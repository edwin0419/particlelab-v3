"""AI Hybrid 분할 엔진 — particle_core.engines.SegmentationEngine 구현.

U-Net 확률맵 × YOLO 인스턴스 → hybrid_core.hybrid_fuse → 라벨맵.
모델은 get_bundle() 로 1회 로드해 프로세스 안에서 캐시 (최근 1개) — 분석 · AI 진단 공용.
"""
from __future__ import annotations

import logging
import sys
import threading
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[3]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from hybrid_core import HybridParams, hybrid_fuse  # noqa: E402
from particle_core.engines import make_engine  # noqa: E402
from particle_core.params import AnalysisParams, HybridEngineParams  # noqa: E402
from particle_core.segment import SegmentationResult  # noqa: E402

log = logging.getLogger("particle_lab.ai")

BASIC_PT_DIR = PROJECT_ROOT / "basic_pt"
BASIC_FILES = {"unet": BASIC_PT_DIR / "U-net++", "yolo": BASIC_PT_DIR / "yolo_11"}


def resolve_weights(spec: Optional[str], which: str) -> Path:
    """'basic' / None / 빈 문자열 → basic_pt 기본 파일, 그 외는 서버 절대경로."""
    if not spec or spec.strip().lower() == "basic":
        p = BASIC_FILES[which]
        if not p.exists():
            raise FileNotFoundError(f"기본 {which} 가중치가 없습니다: {p}")
        return p
    p = Path(spec).expanduser()
    if not p.exists():
        raise FileNotFoundError(f"{which} 가중치 파일 없음: {p}")
    return p


def ensure_pt_suffix(p: Path) -> Path:
    """ultralytics 는 .pt 확장자를 요구 → 확장자 없는 파일은 같은 폴더에 .pt 사본을 만들어 사용."""
    if p.suffix.lower() == ".pt":
        return p
    alt = p.with_name(p.name + ".pt")
    try:
        if not alt.exists() or alt.stat().st_mtime < p.stat().st_mtime or alt.stat().st_size != p.stat().st_size:
            import shutil
            shutil.copy2(p, alt)
        return alt
    except Exception as e:  # noqa: BLE001
        import tempfile, shutil
        tmp = Path(tempfile.gettempdir()) / "particle_lab_weights" / (p.name + ".pt")
        tmp.parent.mkdir(parents=True, exist_ok=True)
        if not tmp.exists() or tmp.stat().st_size != p.stat().st_size:
            shutil.copy2(p, tmp)
        log.warning("가중치 .pt 사본을 임시폴더에 생성 (%s): %s", e, tmp)
        return tmp


def resolve_device(device: str) -> str:
    import torch
    d = (device or "auto").strip().lower()
    if d == "auto":
        if torch.cuda.is_available():
            return "cuda:0"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        return "cpu"
    return d


class _ModelBundle:
    """U-Net + YOLO 로드 결과 (캐시 단위)."""

    def __init__(self, unet_path: Path, yolo_path: Path, device: str) -> None:
        import torch
        from ultralytics import YOLO
        from unet_trainer import build_model, deserialize_model

        t0 = time.time()
        payload = deserialize_model(unet_path.read_bytes())
        self.unet_method: str = payload["method"]
        self.unet_image_size: int = int(payload.get("image_size", 256))
        self.device = torch.device(device)
        self.device_str = device
        self.unet = build_model(self.unet_method).to(self.device)
        self.unet.load_state_dict(payload["state_dict"])
        self.unet.eval()
        # basic_pt 파일은 확장자가 없어 ultralytics 가 task 를 추정하지 못함 → 명시
        self.yolo = YOLO(str(yolo_path), task="segment")
        self.key = _bundle_key(unet_path, yolo_path, device)
        self.lock = threading.Lock()
        log.info("AI 모델 로드 %.1fs — unet=%s(%s, %dpx) yolo=%s device=%s",
                 time.time() - t0, unet_path.name, self.unet_method, self.unet_image_size,
                 yolo_path.name, device)

    def infer(self, gray: np.ndarray, yolo_source=None, *, unet_imgsz: Optional[int] = None,
              yolo_conf: float = 0.15, yolo_iou: float = 0.5, yolo_imgsz: int = 640) -> tuple[np.ndarray, list]:
        """U-Net 확률맵 + YOLO 인스턴스 마스크 (튜너 · 배치 · AI 진단 공용).

        gray: 2D uint8 (U-Net 입력). yolo_source: YOLO 입력 (없으면 gray → BGR). 결과는 gray 크기.
        """
        from unet_trainer import predict_one

        h, w = gray.shape
        size = int(unet_imgsz) if unet_imgsz else self.unet_image_size
        if yolo_source is None:
            yolo_source = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        with self.lock:
            prob, _ = predict_one(self.unet, gray, size, self.device)
            r = self.yolo.predict(
                source=yolo_source, imgsz=int(yolo_imgsz), conf=float(yolo_conf), iou=float(yolo_iou),
                device=self.device_str,
                max_det=100_000,  # ultralytics 기본 상한 300 해제 (고밀도 입자 이미지 대응)
                verbose=False,
            )[0]
        if prob.shape != (h, w):
            prob = cv2.resize(prob, (w, h), interpolation=cv2.INTER_LINEAR)
        yolo_inst: list = []
        if r.masks is not None and r.masks.data.numel() > 0:
            yolo_inst = [
                cv2.resize(m.astype(np.uint8), (w, h), interpolation=cv2.INTER_NEAREST).astype(bool)
                for m in r.masks.data.cpu().numpy()
            ]
        return prob, yolo_inst


_cache_lock = threading.Lock()
_cache: Optional[_ModelBundle] = None


def model_loaded() -> bool:
    """AI 모델이 이미 메모리에 올라와 있는지 (첫 실행 안내용)."""
    return _cache is not None


def store_upload(data: bytes, suffix: str = ".pt") -> Path:
    """업로드된 가중치를 내용 해시 이름으로 저장 → 같은 파일을 다시 올려도 모델 캐시가 적중."""
    import hashlib
    import tempfile
    d = Path(tempfile.gettempdir()) / "particle_lab_weights"
    d.mkdir(parents=True, exist_ok=True)
    p = d / (hashlib.sha1(data).hexdigest()[:16] + suffix)
    if not p.exists() or p.stat().st_size != len(data):
        p.write_bytes(data)
    return p


def get_bundle(unet_spec: Optional[str], yolo_spec: Optional[str], device: str = "auto") -> tuple["_ModelBundle", str]:
    """('basic' | 서버 경로) 두 개 → (캐시된 모델 묶음, 실제 device). 튜너 · 배치 · AI 진단 공용."""
    unet_path = resolve_weights(unet_spec, "unet")
    yolo_path = ensure_pt_suffix(resolve_weights(yolo_spec, "yolo"))
    dev = resolve_device(device)
    return _get_bundle(unet_path, yolo_path, dev), dev


def _bundle_key(unet_path: Path, yolo_path: Path, device: str) -> tuple:
    return (str(unet_path), unet_path.stat().st_mtime, str(yolo_path), yolo_path.stat().st_mtime, device)


def _get_bundle(unet_path: Path, yolo_path: Path, device: str) -> _ModelBundle:
    global _cache
    key = _bundle_key(unet_path, yolo_path, device)
    with _cache_lock:
        if _cache is not None and _cache.key == key:
            return _cache
        _cache = _ModelBundle(unet_path, yolo_path, device)
        return _cache


def make_hybrid_params(*, high_thresh, low_thresh, boundary_thickness, min_anchor_area,
                       balance_floor, tau_scale, yolo_round_strength, yolo_remove_overlaps,
                       yolo_remove_enclosed, enclosed_ratio) -> HybridParams:
    """화면 입력값 → 범위를 맞춘 HybridParams (분석 · AI 진단 공용)."""
    return HybridParams(
        high_thresh=float(high_thresh),
        low_thresh=float(low_thresh),
        boundary_thickness=max(1, int(boundary_thickness)),
        min_anchor_area=max(1, int(min_anchor_area)),
        balance_floor=max(0.0, min(1.0, float(balance_floor))),
        tau_scale=max(0.1, float(tau_scale)),
        yolo_round_strength=max(0, int(yolo_round_strength)),
        yolo_remove_overlaps=bool(yolo_remove_overlaps),
        yolo_remove_enclosed=bool(yolo_remove_enclosed),
        enclosed_ratio=max(0.5, min(1.0, float(enclosed_ratio))),
    )


def build_engine(params: AnalysisParams):
    """분석 설정 → 분할 엔진 (AI Hybrid 는 이 모듈, Watershed 는 particle_core)."""
    if params.engine == "ai_hybrid":
        return HybridAIEngine(params.hybrid)
    return make_engine(params)


class HybridAIEngine:
    name = "ai_hybrid"

    def __init__(self, hp: HybridEngineParams) -> None:
        self.hp = hp
        self._bundle: Optional[_ModelBundle] = None
        self.params = make_hybrid_params(
            high_thresh=hp.high_thresh, low_thresh=hp.low_thresh,
            boundary_thickness=hp.boundary_thickness, min_anchor_area=hp.min_anchor_area,
            balance_floor=hp.balance_floor, tau_scale=hp.tau_scale,
            yolo_round_strength=hp.yolo_round_strength, yolo_remove_overlaps=hp.yolo_remove_overlaps,
            yolo_remove_enclosed=hp.yolo_remove_enclosed, enclosed_ratio=hp.enclosed_ratio,
        )
        self.last_meta: dict = {}

    def prepare(self) -> None:
        self._bundle, _ = get_bundle(self.hp.unet_weights, self.hp.yolo_weights, self.hp.device)

    def segment(self, gray_pre: np.ndarray) -> SegmentationResult:
        if self._bundle is None:
            self.prepare()
        assert self._bundle is not None

        if gray_pre.ndim == 3:
            gray_pre = cv2.cvtColor(gray_pre, cv2.COLOR_BGR2GRAY)
        if gray_pre.dtype != np.uint8:
            gray_pre = cv2.normalize(gray_pre, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
        prob, yolo_inst = self._bundle.infer(
            gray_pre, unet_imgsz=self.hp.unet_imgsz, yolo_conf=self.hp.yolo_conf,
            yolo_iou=self.hp.yolo_iou, yolo_imgsz=self.hp.yolo_imgsz)

        res = hybrid_fuse(prob, yolo_inst, self.params)
        self.last_meta = {
            "n_yolo": int(res.n_yolo),
            "K_unet_anchor": int(res.K_unet),
            "tau": float(res.tau),
        }
        self.last_prob = prob
        self.last_res = res
        self.last_yolo = yolo_inst
        return SegmentationResult(
            labels=res.instances.astype(np.int32),
            binary=res.semantic.astype(bool),
            distance=None,
            markers=None,
            n_labels=int(res.n_instances),
        )
