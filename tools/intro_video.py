"""소개 영상(mp4, 무음 · 자막 포함)과 더빙 대본을 만든다.

앱이 떠 있는 상태에서:  venv/bin/python tools/intro_video.py            (프로그램 소개 편)
                        venv/bin/python tools/intro_video.py --set params (설정 항목 편 → *_설정항목.*)
                        venv/bin/python tools/intro_video.py --limit=5    (앞의 5장면만 시험 → _test.mp4)
더빙에 맞추기:          venv/bin/python tools/intro_video.py [--set params] --voice 소개자료/더빙_맞춤_소개.json
  장면 길이를 목소리에 맞춘 무음 영상(*_더빙_무음.mp4)과 자막(자막*_더빙.srt)을 만든다. 그 다음 순서:
    1) tools/dub_align.py        목소리 파일 → 장면별 시작·끝 시각 (더빙_맞춤_*.json)
       (받아쓴 스크립트가 있으면 먼저 tools/dub_transcript.py 로 말한 대본과 고정점을 만든다)
    2) 이 스크립트 --voice        → *_더빙_무음.mp4
    3) tools/mux_audio.swift     무음 영상 + 소리 → *_더빙.mp4
    4) tools/intro_voice.py      소개 탭에서도 같은 더빙이 나오게 한다
- 소개 페이지(/intro?capture=1&scene=N)를 헤드리스 Chrome 으로 4K(3840×2160)로 찍어 장면을 만들고,
  장면 길이(src/lib/introScenes.ts 의 sceneSeconds)만큼 이어 붙인다. 소리는 넣지 않는다 (더빙은 따로).
- 결과: 소개자료/ParticleLab_소개.mp4, 소개자료/더빙_대본.md, 소개자료/자막.srt
"""
from __future__ import annotations

import asyncio
import base64
import json
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import cv2
import numpy as np
import websockets

sys.path.insert(0, str(Path(__file__).resolve().parent))
from intro_capture import CHROME, FRONT, Cdp, free_port  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "소개자료"
CSS_W, CSS_H = 1920, 1080   # 소개 페이지 무대 크기
SCALE = 2                     # 2 = 4K(3840×2160), 1 = 1080p
W, H, FPS = CSS_W * SCALE, CSS_H * SCALE, 24
FADE = 0.4      # 장면 사이 겹침(초)
HL_AT = 0.9     # 장면이 시작되고 강조 상자가 나타나는 때(초)
HL_FADE = 0.5


def ts(sec: float, sep: str = ".") -> str:
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def mmss(sec: float) -> str:
    return f"{int(sec) // 60}:{int(sec) % 60:02d}"


def fit_to_voice(scenes, voice: dict, n_all: int):
    """장면 경계를 앞 장면의 말이 끝난 때와 다음 장면의 말이 시작하는 때의 가운데에 둔다 (목소리는 0초부터 그대로 재생).
    n_all = 이 편의 전체 장면 수. --limit 로 앞부분만 만들 때 scenes 는 그보다 짧다."""
    v, n = voice["scenes"], len(scenes)
    if len(v) != n_all:
        sys.exit(f"더빙 맞춤 파일의 장면 수({len(v)})가 영상({n_all})과 다릅니다")
    cuts = [0.0] + [(v[i - 1]["end"] + v[i]["start"]) / 2 for i in range(1, min(len(v), n + 1))]
    if len(cuts) == n:  # 마지막 장면까지 다 만들 때: 목소리가 끝난 뒤 1초 여유
        cuts.append(voice["total"] + 1.0)
    frames = [int(round(c * FPS)) for c in cuts]
    for i, s in enumerate(scenes):
        s["seconds"] = (frames[i + 1] - frames[i]) / FPS


async def grab(limit: int | None, on_scene=None, set_key: str = "intro", voice: dict | None = None):
    port = free_port()
    prof = tempfile.mkdtemp(prefix="plab_intro_video_")
    proc = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={prof}",
                             f"--window-size={CSS_W},{CSS_H}", "--hide-scrollbars", "--no-first-run", "about:blank"],
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
            await c.send("Emulation.setDeviceMetricsOverride", width=CSS_W, height=CSS_H, deviceScaleFactor=SCALE, mobile=False)

            async def frame(i: int, hl: int) -> np.ndarray:
                await c.send("Page.navigate", url=f"{FRONT}/intro?capture=1&set={set_key}&scene={i}&hl={hl}")
                await c.wait("document.body && document.body.dataset.introReady === '1' && [...document.images].every(im => im.complete && im.naturalWidth > 0)", 30, f"장면 {i}")
                await asyncio.sleep(0.35)
                r = await c.send("Page.captureScreenshot", format="png")
                im = cv2.imdecode(np.frombuffer(base64.b64decode(r["data"]), np.uint8), cv2.IMREAD_COLOR)
                return cv2.resize(im, (W, H)) if im.shape[:2] != (H, W) else im

            await c.send("Page.navigate", url=f"{FRONT}/intro?capture=1&set={set_key}&scene=0")
            await c.wait("window.__introScenes", 30, "장면 목록")
            scenes = await c.js("window.__introScenes")
            n_all = len(scenes)
            if limit:
                scenes = scenes[:limit]
            if voice:
                fit_to_voice(scenes, voice, n_all)
            prev = None
            for i, s in enumerate(scenes):
                on = await frame(i, 1)
                off = await frame(i, 0) if s["hasBox"] else on
                if on_scene is not None:
                    on_scene(i, s, off, on, prev)
                prev = on
                print(f"장면 {i + 1}/{len(scenes)} {s['title']}", flush=True)
            return scenes
    finally:
        proc.terminate()
        shutil.rmtree(prof, ignore_errors=True)


class VideoOut:
    """장면이 준비되는 대로 바로 써 내려간다 (4K 프레임을 전부 메모리에 두지 않도록)."""

    def __init__(self, path: Path):
        self.codec = "avc1"
        self.vw = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*self.codec), FPS, (W, H))
        if not self.vw.isOpened():
            self.codec = "mp4v"
            self.vw = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*self.codec), FPS, (W, H))

    def scene(self, _i, s, off, on, prev):
        for k in range(int(round(s["seconds"] * FPS))):
            t = k / FPS
            if off is on or t >= HL_AT + HL_FADE:
                img = on
            elif t < HL_AT:
                img = off
            else:
                a = (t - HL_AT) / HL_FADE
                img = cv2.addWeighted(on, a, off, 1 - a, 0)
            if prev is not None and t < FADE:
                a = t / FADE
                img = cv2.addWeighted(img, a, prev, 1 - a, 0)
            self.vw.write(img)

    def close(self):
        self.vw.release()


def write_script(scenes, path_md: Path | None, path_srt: Path, set_key: str = "intro"):
    """대본(md)과 자막(srt)을 쓴다. path_md 가 None 이면 자막만 쓴다."""
    total = sum(s["seconds"] for s in scenes)
    chars = sum(len(s["say"].replace(" ", "")) for s in scenes)
    src = "introScenes.ts" if set_key == "intro" else "paramScenes.ts"
    md = [f"# Particle Lab {'소개' if set_key == 'intro' else '설정 항목'} 영상 — 더빙 대본", "",
          f"- 영상 길이: {mmss(total)} ({len(scenes)}장면) · 대본 {chars:,}자 (공백 제외)",
          "- 영상에는 소리가 없고 화면 아래에 같은 문장이 자막으로 들어 있습니다.",
          "- 각 장면은 낭독 약 5글자/초에 앞뒤 2초 여유를 두고 길이를 잡았습니다. 장면 시작 약 0.5초 뒤에 읽기 시작하면 맞습니다.",
          "- 읽는 법: D10 = 디 텐, D50 = 디 피프티, D90 = 디 나인티, μm = 마이크로미터, 1k = 원 케이,",
          "  Watershed = 워터셰드, AI Hybrid = 에이아이 하이브리드, Particle Lab = 파티클 랩, Summary = 서머리.",
          *(["- 영어 설정 이름 읽는 법: peak_min_distance = 피크 민 디스턴스, distance_threshold = 디스턴스 스레숄드, dilate = 딜레이트,",
             "  erosion = 이로전, blob = 블랍, sigma = 시그마, min_size = 민 사이즈, CLAHE = 클라헤, clip = 클립, tile = 타일, USM = 유에스엠,",
             "  amount = 어마운트, radius = 레이디어스, Laplacian = 라플라시안, Sobel = 소벨, Scharr = 샤르, U-Net = 유넷, YOLO = 욜로,",
             "  IoU = 아이오유, NND = 엔엔디, DBSCAN = 디비스캔, eps = 엡실론, min_samples = 민 샘플스, factor = 팩터."] if set_key == "params" else []),
          "- 더빙 파일을 주실 때: 장면 번호대로 001.mp3, 002.mp3 … 처럼 장면별로 나눠 주시면 장면 길이를 목소리 길이에 정확히 맞출 수 있습니다.",
          f"- 대본을 고치려면 `app/frontend/src/lib/{src}` 의 `say` 를 고친 뒤 `tools/intro_video.py` 를 다시 실행하세요 (장면 길이도 함께 바뀝니다).", ""]
    srt, t, chapter = [], 0.0, None
    for i, s in enumerate(scenes):
        if s["chapter"] != chapter:
            chapter = s["chapter"]
            md += [f"## {chapter}", "", "| # | 시작 | 길이 | 화면 | 대본 |", "|---|---|---|---|---|"]
        md.append(f"| {i + 1} | {mmss(t)} | {s['seconds']:g}초 | {s['title']} | {s['say']} |")
        srt += [str(i + 1), f"{ts(t + 0.3, ',')} --> {ts(t + s['seconds'] - 0.3, ',')}", s["say"], ""]
        t += s["seconds"]
        if i + 1 == len(scenes) or scenes[i + 1]["chapter"] != chapter:
            md.append("")
    if path_md is not None:
        path_md.write_text("\n".join(md), encoding="utf-8")
    path_srt.write_text("\n".join(srt), encoding="utf-8")


def main():
    set_key = "params" if "params" in sys.argv[1:] else "intro"
    tag = "" if set_key == "intro" else "_설정항목"
    limit = next((int(a.split("=")[1]) for a in sys.argv[1:] if a.startswith("--limit=")), None)
    voice = json.loads(Path(sys.argv[sys.argv.index("--voice") + 1]).read_text(encoding="utf-8")) if "--voice" in sys.argv else None
    if voice:
        tag += "_더빙"
    OUT.mkdir(exist_ok=True)
    mp4 = OUT / (f"ParticleLab_{'소개' if set_key == 'intro' else '설정항목'}{'_더빙_무음' if voice else ''}.mp4" if not limit else f"_test{tag}.mp4")
    out = VideoOut(mp4)
    scenes = asyncio.run(grab(limit, out.scene, set_key, voice))
    out.close()
    if limit:
        print(f"시험 내보내기: {mp4}")
        return
    if voice:  # 대본은 그대로, 자막 시각만 목소리에 맞춘 것을 따로 쓴다
        write_script(scenes, None, OUT / f"자막{tag}.srt", set_key)
    else:
        write_script(scenes, OUT / f"더빙_대본{tag}.md", OUT / f"자막{tag}.srt", set_key)
    print(f"완료: {mp4} ({mp4.stat().st_size / 1e6:.0f} MB, {out.codec}, {W}×{H}), 길이 {mmss(sum(s['seconds'] for s in scenes))}")


if __name__ == "__main__":
    main()
