"""설정 항목 영상용 '값을 바꾸면 이렇게 달라진다' 예시 그림.

앱이 떠 있는 상태에서:  venv/bin/python tools/param_examples.py [항목id ...]
- 예시 사진 한 장(demo_images/12h-1k-1.jpg)에 설정 값만 바꿔 실제로 계산한 결과를 저장한다.
- 결과: app/frontend/public/intro/params/ex/<id>_a.jpg, <id>_b.jpg, examples.json (그림 아래 설명 문구)
AI 계산은 한 번에 하나씩만 돌린다 (이 Mac 은 동시에 돌리면 멈춘다).
"""
from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from intro_capture import API, DEMO, post_multipart  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app/frontend/public/intro/params/ex"
IMG = str(DEMO / "12h-1k-1.jpg")
WS, AI = "watershed", "ai_hybrid"
ZOOM = (0.30, 0.25, 0.5, 0.5)   # 가운데를 2배로 (미세한 차이를 보여 줄 때)


def E(id, engine, view, a, b, metric="after", base=None, crop=None):
    """a, b = (그림 위 이름, 바꿀 설정). metric = 그림 아래에 적을 숫자."""
    return dict(id=id, engine=engine, view=view, a=a, b=b, metric=metric, base=base or {}, crop=crop)


def ws(**k): return {"watershed": k}
def mk(**k): return {"watershed": {"marker": k}}
def sem(**k): return {"sem": k}
def hy(**k): return {"hybrid": k}
def me(**k): return {"measure": k}
def af(**k): return {"after_filter": k}
def morph(op, kernel): return {"watershed": {"morphology": {op: {"kernel": kernel, "iterations": 1}}}}


SPECS = [
    # ── SEM 전처리 ──
    E("crop_mode", WS, "labeled_before", ("안 자름", sem(bottom_crop_mode="none")), ("비율로 자름 (기본)", sem(bottom_crop_mode="ratio")), "before"),
    E("crop_ratio", WS, "preprocessed", ("0.03", sem(bottom_crop_ratio=0.03)), ("0.074 (기본)", sem(bottom_crop_ratio=0.074)), "crop"),
    E("crop_px", WS, "preprocessed", ("0 px", sem(bottom_crop_mode="px", bottom_crop_px=0)), ("36 px", sem(bottom_crop_mode="px", bottom_crop_px=36)), "crop"),
    E("brightness", WS, "preprocessed", ("−40", sem(brightness=-40)), ("+40", sem(brightness=40)), "after"),
    E("contrast", WS, "preprocessed", ("0.6", sem(contrast=0.6)), ("1.6", sem(contrast=1.6)), "after"),
    E("gamma", WS, "preprocessed", ("0.6", sem(gamma=0.6)), ("1.8", sem(gamma=1.8)), "after"),
    E("use_clahe", WS, "preprocessed", ("끔 (기본)", sem(use_clahe=False)), ("켬", sem(use_clahe=True)), "after"),
    E("clahe_clip", WS, "preprocessed", ("0.5", sem(use_clahe=True, clahe_clip=0.5)), ("10", sem(use_clahe=True, clahe_clip=10.0)), "after"),
    E("clahe_tile", WS, "preprocessed", ("4", sem(use_clahe=True, clahe_clip=4.0, clahe_tile=4)), ("24", sem(use_clahe=True, clahe_clip=4.0, clahe_tile=24)), "after"),
    E("use_usm", WS, "preprocessed", ("끔 (기본)", sem(use_usm=False)), ("켬", sem(use_usm=True, usm_amount=1.5)), "after", crop=ZOOM),
    E("usm_amount", WS, "preprocessed", ("0.3", sem(use_usm=True, usm_amount=0.3)), ("2.5", sem(use_usm=True, usm_amount=2.5)), "after", crop=ZOOM),
    E("usm_radius", WS, "preprocessed", ("1.0", sem(use_usm=True, usm_amount=1.5, usm_radius=1.0)), ("6.0", sem(use_usm=True, usm_amount=1.5, usm_radius=6.0)), "after", crop=ZOOM),
    # ── Watershed ──
    E("blur_kernel", WS, "binary", ("1 × 1", ws(blur_kernel=[1, 1])), ("11 × 11", ws(blur_kernel=[11, 11])), "before"),
    E("enhance_edges", WS, "labeled_before", ("끔 (기본)", ws(enhance_edges=False)), ("켬", ws(enhance_edges=True)), "before"),
    E("edge_method", WS, "labeled_before", ("Laplacian", ws(enhance_edges=True, edge={"method": "laplacian"})), ("Sobel X", ws(enhance_edges=True, edge={"method": "sobelx"})), "before"),
    E("edge_weight", WS, "labeled_before", ("0.2", ws(enhance_edges=True, edge={"weight": 0.2})), ("1.5", ws(enhance_edges=True, edge={"weight": 1.5})), "before"),
    E("edge_kernel", WS, "labeled_before", ("1", ws(enhance_edges=True, edge={"kernel": 1})), ("5", ws(enhance_edges=True, edge={"kernel": 5})), "before"),
    E("marker_method", WS, "markers", ("peak_local_max (기본)", ws(marker_method="peak_local_max")), ("erosion", ws(marker_method="erosion")), "labels"),
    E("peak_min_distance", WS, "markers", ("2", mk(peak_min_distance=2)), ("15", mk(peak_min_distance=15)), "labels"),
    E("distance_threshold", WS, "markers", ("0.2", mk(distance_threshold=0.2)), ("0.6", mk(distance_threshold=0.6)), "labels", base=ws(marker_method="dilate_threshold")),
    E("dilate_kernel", WS, "markers", ("3", mk(distance_threshold=0.5, dilate_kernel=3)), ("9", mk(distance_threshold=0.5, dilate_kernel=9)), "labels", base=ws(marker_method="dilate_threshold")),
    E("dilate_iter", WS, "markers", ("1", mk(distance_threshold=0.5, dilate_iter=1)), ("4", mk(distance_threshold=0.5, dilate_iter=4)), "labels", base=ws(marker_method="dilate_threshold")),
    E("erosion_kernel", WS, "markers", ("3", mk(erosion_kernel=3)), ("9", mk(erosion_kernel=9)), "labels", base=ws(marker_method="erosion")),
    E("erosion_iter", WS, "markers", ("1", mk(erosion_iter=1)), ("4", mk(erosion_iter=4)), "labels", base=ws(marker_method="erosion")),
    E("blob_min_sigma", WS, "markers", ("1", mk(blob_min_sigma=1.0)), ("8", mk(blob_min_sigma=8.0)), "labels", base=ws(marker_method="blob_detection")),
    E("blob_max_sigma", WS, "markers", ("5", mk(blob_max_sigma=5.0)), ("30 (기본)", mk(blob_max_sigma=30.0)), "labels", base=ws(marker_method="blob_detection")),
    E("blob_num_sigma", WS, "markers", ("2", mk(blob_num_sigma=2)), ("20", mk(blob_num_sigma=20)), "labels", base=ws(marker_method="blob_detection")),
    E("blob_threshold", WS, "markers", ("0.01", mk(blob_threshold=0.01)), ("1.0", mk(blob_threshold=1.0)), "labels", base=ws(marker_method="blob_detection")),
    E("min_size", WS, "labels", ("0", ws(min_size=0)), ("400", ws(min_size=400)), "labels"),
    E("morph_on", WS, "binary", ("사용 (기본)", {}), ("사용 안 함", ws(morphology=None)), "before"),
    E("morph_open", WS, "binary", ("커널 3 (기본)", morph("open", 3)), ("커널 11", morph("open", 11)), "before"),
    E("morph_close", WS, "binary", ("커널 3 (기본)", morph("close", 3)), ("커널 11", morph("close", 11)), "before"),
    E("morph_erode", WS, "binary", ("커널 3 (기본)", morph("erode", 3)), ("커널 9", morph("erode", 9)), "before"),
    E("morph_dilate", WS, "binary", ("커널 3 (기본)", morph("dilate", 3)), ("커널 9", morph("dilate", 9)), "before"),
    # ── AI Hybrid ──
    E("high_thresh", AI, "labeled_before", ("0.50", hy(high_thresh=0.5)), ("0.95", hy(high_thresh=0.95)), "before"),
    E("low_thresh", AI, "labeled_before", ("0.10", hy(low_thresh=0.1)), ("0.70", hy(low_thresh=0.7)), "before", crop=ZOOM),
    E("boundary_thickness", AI, "labeled_before", ("1 px", hy(boundary_thickness=1)), ("9 px", hy(boundary_thickness=9)), "before", crop=ZOOM),
    E("min_anchor_area", AI, "labeled_before", ("0", hy(min_anchor_area=0)), ("500", hy(min_anchor_area=500)), "before"),
    E("balance_floor", AI, "ai_separator", ("0", hy(balance_floor=0.0)), ("0.6", hy(balance_floor=0.6)), "before"),
    E("tau_scale", AI, "ai_separator", ("0.5", hy(tau_scale=0.5)), ("2.5", hy(tau_scale=2.5)), "before"),
    E("yolo_conf", AI, "ai_yolo", ("0.05", hy(yolo_conf=0.05)), ("0.70", hy(yolo_conf=0.7)), "yolo"),
    E("yolo_iou", AI, "ai_yolo", ("0.10", hy(yolo_iou=0.1)), ("0.95", hy(yolo_iou=0.95)), "yolo"),
    E("yolo_imgsz", AI, "ai_yolo", ("320", hy(yolo_imgsz=320)), ("1280", hy(yolo_imgsz=1280)), "yolo"),
    E("yolo_round_strength", AI, "ai_yolo", ("0", hy(yolo_round_strength=0)), ("10", hy(yolo_round_strength=10)), "yolo", crop=ZOOM),
    E("yolo_remove_overlaps", AI, "ai_yolo", ("켬 (기본)", hy(yolo_remove_overlaps=True)), ("끔", hy(yolo_remove_overlaps=False)), "before", crop=ZOOM),
    E("yolo_remove_enclosed", AI, "ai_yolo", ("켬 (기본)", hy(yolo_remove_enclosed=True)), ("끔", hy(yolo_remove_enclosed=False)), "yolo"),
    E("enclosed_ratio", AI, "ai_yolo", ("0.5", hy(enclosed_ratio=0.5)), ("1.0", hy(enclosed_ratio=1.0)), "yolo"),
    E("unet_imgsz", AI, "ai_prob", ("256", hy(unet_imgsz=256)), ("비움 (기본)", hy(unet_imgsz=None)), "before"),
    # ── 특성 필터 ──
    E("filter_border", AI, "labeled_before", ("켬 (기본)", me(filter_border_particles=True)), ("끔", me(filter_border_particles=False)), "before+d50"),
    E("min_contour_points", WS, "labeled_before", ("0", me(min_contour_points=0)), ("80", me(min_contour_points=80)), "before+d50"),
    E("min_diameter", AI, "labeled_before", ("0 μm (기본)", me(min_diameter=0)), ("4 μm", me(min_diameter=4.0)), "before+d50"),
    E("curvature_percentile", AI, "labeled_before", ("0 (끔)", me(curvature_percentile=0)), ("30", me(curvature_percentile=30)), "before+d50"),
    E("exclude_linear", AI, "labeled_before", ("끔 (기본)", me(exclude_linear_contour=False)), ("켬", me(exclude_linear_contour=True, linear_contour_percentile=20)), "before+d50"),
    E("linear_percentile", AI, "labeled_before", ("5", me(exclude_linear_contour=True, linear_contour_percentile=5)), ("40", me(exclude_linear_contour=True, linear_contour_percentile=40)), "before+d50"),
    E("exclude_dark", AI, "labeled_before", ("끔 (기본)", me(exclude_dark_particle=False)), ("켬", me(exclude_dark_particle=True, dark_particle_percentile=20)), "before+d50"),
    E("dark_percentile", AI, "labeled_before", ("5", me(exclude_dark_particle=True, dark_particle_percentile=5)), ("40", me(exclude_dark_particle=True, dark_particle_percentile=40)), "before+d50"),
    # ── 형상 필터 ──
    E("dia_lower", AI, "labeled_after", ("0 (끔)", af(diameter_lower_percentile=0)), ("25", af(diameter_lower_percentile=25)), "after+d50"),
    E("dia_upper", AI, "labeled_after", ("0 (끔)", af(diameter_upper_percentile=0)), ("25", af(diameter_upper_percentile=25)), "after+d50"),
    E("circ_enable", AI, "labeled_after", ("켬 (기본)", af(enable_circularity=True)), ("끔", af(enable_circularity=False)), "after+d50"),
    E("circ_mode", AI, "labeled_after", ("값 0.7 (기본)", af(circularity_mode="value")), ("백분위 5", af(circularity_mode="percentile")), "after+d50"),
    E("circ_value", AI, "labeled_after", ("0.50", af(circularity_value=0.5)), ("0.85", af(circularity_value=0.85)), "after+d50"),
    E("circ_percentile", AI, "labeled_after", ("5", af(circularity_mode="percentile", circularity_percentile=5)), ("40", af(circularity_mode="percentile", circularity_percentile=40)), "after+d50"),
    E("ar_enable", AI, "labeled_after", ("켬 (최대값 1.3)", af(enable_aspect_ratio=True, aspect_ratio_value=1.3)), ("끔", af(enable_aspect_ratio=False)), "after+d50", base=af(enable_circularity=False)),
    E("ar_mode", AI, "labeled_after", ("값 2.0 (기본)", af(aspect_ratio_mode="value")), ("백분위 5", af(aspect_ratio_mode="percentile")), "after+d50", base=af(enable_circularity=False)),
    E("ar_value", AI, "labeled_after", ("1.2", af(aspect_ratio_value=1.2)), ("2.0 (기본)", af(aspect_ratio_value=2.0)), "after+d50", base=af(enable_circularity=False)),
    E("ar_percentile", AI, "labeled_after", ("5", af(aspect_ratio_mode="percentile", aspect_ratio_percentile=5)), ("40", af(aspect_ratio_mode="percentile", aspect_ratio_percentile=40)), "after+d50", base=af(enable_circularity=False)),
]


def merge(a: dict, b: dict) -> dict:
    out = dict(a)
    for k, v in b.items():
        out[k] = merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def caption(metric: str, j: dict) -> str:
    d50 = (j.get("d_values_after" if metric.startswith("after") else "d_values_before") or {}).get("d50")
    d = f" · D50 {d50:.2f} μm" if d50 else ""
    if metric == "before": return f"찾은 입자 {j['n_before']}개"
    if metric == "after": return f"최종 입자 {j['n_after']}개"
    if metric == "labels": return f"나눈 조각 {j['n_labels']}개"
    if metric == "before+d50": return f"남은 입자 {j['n_before']}개{d}"
    if metric == "after+d50": return f"남은 입자 {j['n_after']}개{d}"
    if metric == "crop": return f"잘라낸 높이 {j['crop_bottom_px']} px"
    if metric == "yolo":
        n = (j.get("engine_meta") or {}).get("n_yolo")
        return f"AI 2가 찾은 입자 {n}개 · 최종 {j['n_before']}개" if n is not None else f"찾은 입자 {j['n_before']}개"
    return ""


def run(spec: dict) -> dict:
    out = {}
    for key in ("a", "b"):
        label, patch = spec[key]
        params = merge(merge({"engine": spec["engine"]}, spec["base"]), patch)
        j = post_multipart(f"{API}/api/tuner/segment", {"params": json.dumps(params), "server_path": IMG})
        url = j["views"].get(spec["view"])
        im = cv2.imdecode(np.frombuffer(base64.b64decode(url.split(",", 1)[1]), np.uint8), cv2.IMREAD_COLOR)
        if spec["crop"]:
            h, w = im.shape[:2]
            x, y, cw, ch = spec["crop"]
            im = im[int(y * h):int((y + ch) * h), int(x * w):int((x + cw) * w)]
            im = cv2.resize(im, None, fx=2, fy=2, interpolation=cv2.INTER_LANCZOS4)
        cv2.imwrite(str(OUT / f"{spec['id']}_{key}.jpg"), im, [cv2.IMWRITE_JPEG_QUALITY, 93])
        out[key] = {"label": label, "cap": caption(spec["metric"], j), "w": im.shape[1], "h": im.shape[0],
                    "n_before": j["n_before"], "n_after": j["n_after"], "n_labels": j["n_labels"], "meta": j.get("engine_meta") or {}}
    out["zoom"] = bool(spec["crop"])
    print(f"{spec['id']:22s} A[{out['a']['label']}] {out['a']['cap']}  |  B[{out['b']['label']}] {out['b']['cap']}", flush=True)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT.parent / "examples.json"
    done = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    only = set(sys.argv[1:])
    for spec in SPECS:
        if only and spec["id"] not in only:
            continue
        done[spec["id"]] = run(spec)
        path.write_text(json.dumps(done, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
