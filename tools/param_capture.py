"""설정 항목 영상용 설정 패널 캡처.

앱이 떠 있는 상태에서:  venv/bin/python tools/param_capture.py
- 분석 화면의 오른쪽 설정 패널을 묶음(카드)별로 찍고, 항목마다 위치(카드 대비 비율)를 기록한다.
- 선택에 따라 보이는 항목이 달라지므로(마커 방법, 자르기 방식 …) 설정을 바꿔 가며 여러 번 찍는다.
- 결과: app/frontend/public/intro/params/panels/<이름>.jpg, panels.json
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import websockets
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from intro_capture import CHROME, FRONT, Cdp, free_port  # noqa: E402
from param_examples import merge  # noqa: E402
from particle_core.params import AnalysisParams  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "app/frontend/public/intro/params"
W, H, DSF = 1600, 3400, 3

BASE = {
    "engine": "watershed",
    "sem": {"use_clahe": True, "use_usm": True},
    "watershed": {"enhance_edges": True},
    "measure": {"exclude_linear_contour": True, "exclude_dark_particle": True},
    "spatial": {"enable_boundary": True, "enable_nnd": True, "enable_dbscan": True},
}
# (이름, 바꿀 설정, 카드 제목, 항목 이름들)
SHOTS = [
    ("sem", {}, "SEM 전처리", ["하단 정보바 자르기", "자를 비율", "밝기", "대비", "감마", "CLAHE", "CLAHE clip", "CLAHE tile", "언샤프 마스크 (USM)", "USM amount", "USM radius"]),
    ("sem_px", {"sem": {"bottom_crop_mode": "px", "bottom_crop_px": 36}}, "SEM 전처리", ["자를 높이"]),
    ("ws", {}, "분할 — Watershed", ["블러 커널 (x, y)", "엣지 강화", "엣지 방법", "엣지 가중치", "엣지 커널", "마커 방법", "peak_min_distance", "min_size", "모폴로지 사용", "Open", "Close", "Erode", "Dilate"]),
    ("ws_dilate", {"watershed": {"marker_method": "dilate_threshold"}}, "분할 — Watershed", ["distance_threshold", "dilate_kernel", "dilate_iter"]),
    ("ws_erosion", {"watershed": {"marker_method": "erosion"}}, "분할 — Watershed", ["erosion_kernel", "erosion_iter"]),
    ("ws_blob", {"watershed": {"marker_method": "blob_detection"}}, "분할 — Watershed", ["blob_min_sigma", "blob_max_sigma", "blob_num_sigma", "blob_threshold"]),
    ("ai", {"engine": "ai_hybrid"}, "분할 — AI Hybrid", ["확정 임계 (high)", "보강 임계 (low)", "분리선 두께 (px)", "최소 입자 크기 (px²)", "분리 균형 (d₁≈d₂)", "틈 검출 범위 (τ* 배수)", "YOLO 신뢰도", "YOLO 중복 제거 IoU", "YOLO 입력 크기 (px)", "마스크 둥글림 (σ)", "겹친 영역 → 배경", "포위된 객체 제거", "포위 판정 비율", "U-Net 입력 크기 (px)", "추론 장치", "U-Net 가중치", "YOLO 가중치"]),
    ("measure", {}, "특성 필터 (measure)", ["모서리 입자 제거", "최소 윤곽 점 수", "최소 직경", "곡률 백분위", "선형 윤곽 제외", "선형 윤곽 백분위", "어두운 입자 제외", "어두운 입자 백분위"]),
    ("filter", {}, "형상 필터", ["직경 하위 백분위 제거", "직경 상위 백분위 제거", "원형도 필터 사용", "원형도 기준", "원형도 최소값", "종횡비 필터 사용", "종횡비 기준", "종횡비 최대값"]),
    ("filter_pct", {"after_filter": {"circularity_mode": "percentile", "aspect_ratio_mode": "percentile"}}, "형상 필터", ["원형도 하위 백분위", "종횡비 상위 백분위"]),
    ("scale", {}, "스케일", ["방식", "μm/px", "배율 인식 실패 시"]),
    ("scale_bar", {"scale": {"mode": "scalebar", "scale_bar_px": 252, "scale_bar_um": 50}}, "스케일", ["스케일바 길이", "스케일바 실제 길이"]),
    ("spatial", {}, "공간 분석", ["경계 접촉 분석", "접촉 임계", "최근접 거리 (NND) / 응집도", "DBSCAN 군집", "eps 자동", "eps factor", "min_samples 자동", "min_samples factor"]),
    ("spatial_manual", {"spatial": {"dbscan_eps_auto": False, "dbscan_min_samples_auto": False}}, "공간 분석", ["eps 값", "min_samples 값"]),
    ("output", {}, "출력 옵션", ["PPT 생성", "윤곽선 전용 이미지", "정규분포 플롯", "형상·입도 지표 시트", "불규칙 입자 기준 (원형도 <)", "JPEG 품질"]),
]

FIND = r"""
window.__p = {
  card(title) { const h = [...document.querySelectorAll('aside h2')].find(e => e.textContent.trim().startsWith(title)); return h ? h.closest('.app-card') : null; },
  open(title) { const c = this.card(title); if (c && !c.querySelector('.cq-cols')) c.querySelector('button').click(); },
  row(title, label) {
    const c = this.card(title); if (!c) return null;
    const el = [...c.querySelectorAll('span,div')].find(e => e.children.length === 0 && e.textContent.trim() === label && e.closest('.block.text-xs'));
    return el ? el.closest('.block.text-xs') : null;
  },
  rel(title, label) {
    const c = this.card(title), r = this.row(title, label); if (!c || !r) return null;
    const a = c.getBoundingClientRect(), b = r.getBoundingClientRect();
    return [(b.left - a.left) / a.width, (b.top - a.top) / a.height, b.width / a.width, b.height / a.height].map(v => Math.round(v * 10000) / 10000);
  },
  box(title) { const r = this.card(title).getBoundingClientRect(); return [r.left, r.top + scrollY, r.width, r.height]; },
};
"""


async def main():
    (OUT / "panels").mkdir(parents=True, exist_ok=True)
    port = free_port()
    prof = tempfile.mkdtemp(prefix="plab_param_chrome_")
    proc = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={prof}",
                             f"--window-size={W},{H}", "--hide-scrollbars", "--no-first-run", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        tabs = None
        for _ in range(40):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=1))
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.5)
        if proc.poll() is not None or not tabs:
            sys.exit("Chrome 실행 실패")
        ws_url = next(t["webSocketDebuggerUrl"] for t in tabs if t["type"] == "page")
        async with websockets.connect(ws_url, max_size=None, ping_interval=None) as ws:
            c = Cdp(ws)
            await c.send("Emulation.setDeviceMetricsOverride", width=W, height=H, deviceScaleFactor=DSF, mobile=False)
            await c.goto(FRONT + "/")
            meta: dict[str, dict] = {}
            missing = []
            for name, patch, title, labels in SHOTS:
                params = merge(merge(AnalysisParams().to_dict(), BASE), patch)
                await c.js(f"localStorage.setItem('plab.params', {json.dumps(json.dumps(params))}); localStorage.setItem('plab.rightW', '320')")
                await c.goto(FRONT + "/")
                await c.js(FIND)
                # 사진을 넣기 전에는 패널이 흐리게 보이므로 또렷하게 (모양은 같다)
                await c.js("(() => { const s = document.createElement('style'); s.textContent = 'aside{opacity:1!important}'; document.head.appendChild(s); })()")
                await c.wait(f"__p.card({json.dumps(title)})", 30, title)
                await c.js(f"__p.open({json.dumps(title)})")
                await asyncio.sleep(0.4)
                # 패널은 자체 스크롤 영역 안에 있다 — 카드를 보이는 곳으로 옮긴 뒤에 찍는다
                await c.js(f"__p.card({json.dumps(title)}).scrollIntoView({{block: 'center'}}); window.scrollTo(0, 0)")
                await asyncio.sleep(0.5)
                x, y, w, h = await c.js(f"__p.box({json.dumps(title)})")
                boxes = {}
                for lab in labels:
                    r = await c.js(f"__p.rel({json.dumps(title)}, {json.dumps(lab)})")
                    if r is None:
                        missing.append(f"{name}: {lab}")
                    boxes[lab] = r
                r = await c.send("Page.captureScreenshot", format="png", clip={"x": x, "y": y, "width": w, "height": h, "scale": 1})
                im = Image.open(io.BytesIO(base64.b64decode(r["data"]))).convert("RGB")
                if im.convert("L").getextrema()[0] > 200:
                    sys.exit(f"{name}: 빈 화면이 찍혔습니다")
                im.save(OUT / "panels" / f"{name}.jpg", quality=93, subsampling=0)
                meta[name] = {"w": round(w, 1), "h": round(h, 1), "boxes": boxes}
                print(f"{name:15s} {im.size} 카드 {w:.0f}×{h:.0f} 항목 {len(labels)}", flush=True)
            await c.js("localStorage.clear()")
            (OUT / "panels.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
            if missing:
                print("못 찾은 항목:", missing)
    finally:
        proc.terminate()
        shutil.rmtree(prof, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
