"""형상·입도 지표 (particle_morphology) 를 배치 파이프라인에 연결 — 엔진 공통.

분할 엔진(watershed / ai_hybrid)이 만든 라벨맵에서 Before 입자 집합(측정 필터 통과분)만 남겨
particle_morphology.particle_metrics 로 61종 지표를 계산하고, 배치 Excel 에 지표 시트 6개를 추가한다.

배치는 이미지마다 μm/px 이 다를 수 있으므로(파일명 배율) 입자 값을 이미지별 스케일로 먼저 μm 환산한 뒤
집계한다. 따라서 엑셀 헬퍼에는 unit="µm", um_per_px=None (재환산 없음) 으로 넘긴다.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict, Iterable, List

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
for _p in (PROJECT_ROOT, PROJECT_ROOT / "app" / "backend"):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import particle_morphology as pm  # noqa: E402


def image_particles(labels: np.ndarray, gray: np.ndarray, keep_labels: Iterable[int],
                    um_per_px: float, irregular_circularity: float, remove_edge: bool) -> tuple[list[dict], int]:
    """라벨맵 → (μm 환산된 입자 지표 리스트, 모서리 제거 수). 입자 번호(id) = 라벨 값 = 라벨 이미지의 번호."""
    keep = np.fromiter((int(v) for v in keep_labels), dtype=np.int64)
    inst = np.where(np.isin(labels, keep), labels, 0).astype(np.int32)
    n_edge = 0
    if remove_edge:
        inst, n_edge = pm.remove_edge_touching(inst)
    plist = pm.particle_metrics(inst, gray, irregular_circularity=irregular_circularity)
    return [pm.scaled(q, um_per_px) for q in plist], int(n_edge)


def _entry(name: str, particles: list[dict], irr: float, edge: bool, n_edge: int, keep_particles: bool) -> dict:
    s = pm.distribution_summary(particles, None, irr, edge_corrected=edge)
    s["unit"] = "µm"
    s["n_edge_removed"] = n_edge
    s["crop_bottom_px"] = None
    return {
        "filename": name, "summary": s,
        "particles": particles if keep_particles else [],
        "size_bins": pm.size_bins(particles, None),
        "shape_stats": pm.shape_distribution(particles),
    }


def build_bundle(images: List[dict], irregular_circularity: float, edge: bool, settings: Dict[str, tuple]) -> dict:
    """images = [{"sample", "filename", "particles"(μm), "n_edge_removed", "um_per_px"}] → add_morphology_sheets 입력.

    열/행 순서: 전체 → (샘플 합계 → 그 샘플의 이미지들) 반복.
    """
    per: list[dict] = []
    samples: list[str] = []
    for im in images:
        if im["sample"] not in samples:
            samples.append(im["sample"])
    for s in samples:
        ims = [im for im in images if im["sample"] == s]
        sp = [q for im in ims for q in im["particles"]]
        per.append(_entry(f"[샘플 / Sample] {s}", sp, irregular_circularity, edge,
                          sum(im["n_edge_removed"] for im in ims), keep_particles=False))
        for im in ims:
            per.append(_entry(im["filename"], im["particles"], irregular_circularity, edge,
                              im["n_edge_removed"], keep_particles=True))
    all_p = [q for im in images for q in im["particles"]]
    all_e = _entry("ALL", all_p, irregular_circularity, edge, sum(im["n_edge_removed"] for im in images), False)
    scales = sorted({round(float(im["um_per_px"]), 6) for im in images})
    return {
        "unit": "µm",
        "um_per_px": None,
        "scale_note": ("이미지별 µm/px 로 환산 (" + ", ".join(f"{v:g}" for v in scales[:8])
                       + (" …" if len(scales) > 8 else "") + ")"),
        "all": {"summary": all_e["summary"], "size_bins": all_e["size_bins"], "shape_stats": all_e["shape_stats"]},
        "per_image": per,
        "settings": settings,
    }


def append_sheets(excel_path: str | Path, bundle: dict) -> None:
    """이미 작성된 배치 Excel 에 형상·입도 지표 시트 6개를 덧붙인다 (첫 화면은 기존 시트 유지)."""
    import openpyxl
    from app.api._excel_export import add_morphology_sheets, sanitize_for_excel

    wb = openpyxl.load_workbook(str(excel_path))
    add_morphology_sheets(wb, bundle)
    for w in wb.worksheets:
        w.sheet_view.tabSelected = False
    wb.active = 0
    wb.active.sheet_view.tabSelected = True
    sanitize_for_excel(wb)
    wb.save(str(excel_path))


__all__ = ["image_particles", "build_bundle", "append_sheets"]
