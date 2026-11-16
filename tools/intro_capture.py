"""소개(쇼릴) 페이지용 실제 화면 캡처.

앱이 떠 있는 상태(START.command)에서 실행:  venv/bin/python tools/intro_capture.py
- 헤드리스 Chrome 을 DevTools 프로토콜로 조작해 분석 · AI 진단 화면을 실제로 사용하면서 캡처한다.
- 결과: app/frontend/public/intro/shots/*.jpg, shots.json (강조 상자 좌표, 화면 대비 비율),
        app/frontend/public/intro/steps/*.png (알고리즘 중간 단계 이미지)
화면이 바뀌면 이 스크립트를 다시 돌리면 소개 페이지 그림이 갱신된다.
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

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app/frontend/public/intro"
DEMO = ROOT / "demo_images"
FRONT = "http://localhost:3001"
API = "http://localhost:8765"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def free_port() -> int:
    """비어 있는 포트 — 다른 프로그램이 띄운 Chrome 에 잘못 붙지 않도록 매번 새로 고른다."""
    import socket
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


PORT = free_port()
W, H = 1600, 900

HELPERS = r"""
window.__q = {
  byText(sel, text, exact) {
    const els = [...document.querySelectorAll(sel)].filter(e => exact ? e.textContent.trim() === text : e.textContent.includes(text));
    return els.sort((a, b) => a.textContent.length - b.textContent.length)[0] || null;
  },
  setInput(el, value) {
    const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    d.set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true }));
  },
  rect(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.left / innerWidth, r.top / innerHeight, r.width / innerWidth, r.height / innerHeight].map(v => Math.round(v * 10000) / 10000);
  },
  card(text) { const h = this.byText('h2', text); return h ? h.closest('.app-card') || h.closest('section') : null; },
  cardAny(text) { const h = this.byText('h2,h3,summary,span,div', text); return h ? h.closest('.app-card') || h.closest('details') || h.parentElement : null; },
};
"""


class Cdp:
    def __init__(self, ws):
        self.ws, self.n = ws, 0

    async def send(self, method, **params):
        self.n += 1
        i = self.n
        await self.ws.send(json.dumps({"id": i, "method": method, "params": params}))
        while True:
            m = json.loads(await self.ws.recv())
            if m.get("id") == i:
                if "error" in m:
                    raise RuntimeError(f"{method}: {m['error']}")
                return m.get("result", {})

    async def js(self, expr):
        r = await self.send("Runtime.evaluate", expression=expr, awaitPromise=True, returnByValue=True)
        if "exceptionDetails" in r:
            raise RuntimeError(r["exceptionDetails"].get("exception", {}).get("description") or str(r["exceptionDetails"]))
        return r["result"].get("value")

    async def goto(self, url):
        await self.send("Page.navigate", url=url)
        await asyncio.sleep(2.5)
        await self.js(HELPERS)

    async def wait(self, cond, timeout=120, what=""):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if await self.js(f"!!({cond})"):
                return
            await asyncio.sleep(0.5)
        raise TimeoutError(f"대기 시간 초과: {what or cond}")

    async def shot(self, name):
        r = await self.send("Page.captureScreenshot", format="png")
        im = Image.open(io.BytesIO(base64.b64decode(r["data"]))).convert("RGB")
        # 확대 장면(최대 2.3배)에서도 선명하도록 원래 해상도(4800×2700) 그대로 저장
        im.save(OUT / "shots" / f"{name}.jpg", quality=92, subsampling=0)
        print("shot", name)


def save_data_url(url: str, path: Path):
    path.write_bytes(base64.b64decode(url.split(",", 1)[1]))


def post_multipart(url: str, fields: dict) -> dict:
    b = "----plabintro"
    body = b"".join(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items()) + f"--{b}--\r\n".encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": f"multipart/form-data; boundary={b}"})
    return json.load(urllib.request.urlopen(req, timeout=300))


def step_images():
    """알고리즘 중간 단계 (실제 계산 결과)."""
    img = str(DEMO / "12h-1k-1.jpg")
    for engine, keys in (("watershed", ["original", "binary", "distance", "markers", "labels", "labeled_after"]),
                         ("ai_hybrid", ["ai_prob", "ai_yolo", "ai_separator", "labeled_before", "labeled_after"])):
        j = post_multipart(f"{API}/api/tuner/segment", {"params": json.dumps({"engine": engine}), "server_path": img})
        for k in keys:
            if j["views"].get(k):
                save_data_url(j["views"][k], OUT / "steps" / f"{'ws' if engine == 'watershed' else 'ai'}_{k}.png")
        print(engine, "n_before", j["n_before"], "n_after", j["n_after"])


async def main():
    step_images()
    prof = tempfile.mkdtemp(prefix="plab_intro_chrome_")
    proc = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={PORT}", f"--user-data-dir={prof}",
                             f"--window-size={W},{H}", "--hide-scrollbars", "--no-first-run", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(40):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=1))
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.5)
        if proc.poll() is not None:
            sys.exit("Chrome 실행 실패")
        ws_url = next(t["webSocketDebuggerUrl"] for t in tabs if t["type"] == "page")
        async with websockets.connect(ws_url, max_size=None, ping_interval=None) as ws:  # 이벤트 구독 없이 요청-응답만
            c = Cdp(ws)
            await c.send("Emulation.setDeviceMetricsOverride", width=W, height=H, deviceScaleFactor=3, mobile=False)
            boxes: dict[str, dict] = {}

            async def rects(name, **exprs):
                boxes[name] = {k: await c.js(f"__q.rect({e})") for k, e in exprs.items()}

            # ── 분석 화면: 처음 상태
            await c.goto(FRONT + "/")
            await c.js("localStorage.clear()")
            await c.goto(FRONT + "/")
            await c.shot("home")
            await rects("home", left="document.querySelectorAll('main section, section')[0]",
                        center="document.querySelectorAll('section')[1]", right="document.querySelector('aside')",
                        nav="document.querySelector('header nav') || document.querySelector('header')",
                        upload="__q.card('입력 파일')")

            # ── 폴더 경로 입력 → 목록 + Watershed 자동 미리보기
            await c.js("__q.byText('button','폴더 경로',true).click()")
            await asyncio.sleep(0.5)
            await c.js(f"__q.setInput(document.querySelector('input[placeholder*=\"sem_images\"]'), {json.dumps(str(DEMO))})")
            await c.wait("document.body.innerText.includes('15h-1k-4.jpg')", what="이미지 목록")
            await c.wait("document.body.innerText.includes('필터 전') && /입자 수\\s*\\d+/.test(document.body.innerText.replace(/\\n/g,' '))", 60, "watershed 미리보기")
            await asyncio.sleep(1.5)
            await c.shot("loaded")
            await rects("loaded", input="__q.card('입력 파일')", list="__q.card('이미지 목록')", engine="__q.card('분할 엔진')",
                        preview="__q.byText('button','미리보기 (선택')", run="__q.byText('button','전체 분석')",
                        viewer="document.querySelectorAll('section')[1].querySelector('.app-card')",
                        stats="document.querySelectorAll('section')[1].querySelector('.app-card > div')")

            # ── Watershed 단계 보기 · 설정 · 저장 옵션
            await c.js("__q.byText('button','거리맵').click()")
            await asyncio.sleep(1.2)
            await c.shot("ws_view")
            await rects("ws_view", pills="__q.byText('button','거리맵').parentElement", viewer="document.querySelectorAll('section')[1].querySelector('.app-card')")
            await c.js("__q.byText('button','라벨 (필터 후)').click()")
            await asyncio.sleep(0.8)
            await c.js("__q.card('분할 — Watershed').scrollIntoView({block:'start'}); window.scrollTo(0,0)")
            await asyncio.sleep(0.6)
            await c.shot("params_ws")
            await rects("params_ws", ws="__q.card('분할 — Watershed')")
            await c.js("document.querySelector('aside').scrollTop = 0")
            await c.js("(() => { const d = __q.byText('summary','저장 옵션'); if (d) d.click(); })()")
            await asyncio.sleep(0.6)
            await c.js("__q.cardAny('저장 옵션').scrollIntoView({block:'center'})")
            await asyncio.sleep(0.5)
            await c.shot("save_opts")
            await rects("save_opts", save="__q.cardAny('저장 옵션')", recent="__q.cardAny('최근 분석')")
            await c.js("window.scrollTo(0,0)")

            # ── AI Hybrid 미리보기
            await c.js("__q.byText('button','AI Hybrid',true).click()")
            await asyncio.sleep(0.6)
            await c.shot("engine")
            await rects("engine", engine="__q.card('분할 엔진')", right="document.querySelector('aside')")
            await c.js("__q.byText('button','미리보기 (선택').click()")
            await c.wait("document.body.innerText.includes('YOLO 검출') && !document.body.innerText.includes('추론 중') && !document.body.innerText.includes('준비 중') && !document.body.innerText.includes('불러오는 중')", 180, "AI 미리보기")
            await asyncio.sleep(1.5)
            await c.shot("ai_before")
            await rects("ai_before", pills="__q.byText('button','라벨 (필터 전)').parentElement", viewer="document.querySelectorAll('section')[1].querySelector('.app-card')")
            await c.js("__q.byText('button','라벨 (필터 후)').click()")
            await asyncio.sleep(1.2)
            await c.shot("ai_after")
            await c.js("__q.card('입도 · 입자 표').scrollIntoView({block:'center'})")
            await asyncio.sleep(0.8)
            await c.shot("table")
            await rects("table", table="__q.card('입도 · 입자 표')")
            await c.js("window.scrollTo(0,0)")

            # ── 설정 패널
            await c.js("document.querySelector('aside').scrollTop = 0")
            await asyncio.sleep(0.5)
            await c.shot("params_top")
            await rects("params_top", right="document.querySelector('aside')", sem="__q.card('SEM 전처리')", ai="__q.card('분할 — AI Hybrid')",
                        save="__q.byText('button','설정 저장')", load="__q.byText('button','불러오기')")
            await c.js("__q.card('분할 — AI Hybrid').scrollIntoView({block:'start'}); window.scrollTo(0,0)")
            await asyncio.sleep(0.6)
            await c.shot("params_ai")
            await rects("params_ai", ai="__q.card('분할 — AI Hybrid')")
            await c.js("__q.card('특성 필터 (measure)').scrollIntoView({block:'start'}); window.scrollTo(0,0)")
            await asyncio.sleep(0.6)
            await c.shot("params_measure")
            await rects("params_measure", measure="__q.card('특성 필터 (measure)')")
            await c.js("__q.card('형상 필터').scrollIntoView({block:'start'})")
            await asyncio.sleep(0.6)
            await c.js("window.scrollTo(0,0)")
            await asyncio.sleep(0.4)
            await c.shot("params_filter")
            await rects("params_filter", filter="__q.card('형상 필터')", measure="__q.card('특성 필터 (measure)')", scale="__q.card('스케일')")

            # ── 전체 분석
            await c.js("document.querySelector('aside').scrollTop = 0")
            await c.js("(() => { const i = document.querySelector('input[placeholder*=\"샘플A\"]'); if (i) __q.setInput(i, '데모 분석'); })()")
            await c.js("__q.byText('button','전체 분석').click()")
            await asyncio.sleep(2.5)
            await c.shot("running")
            await rects("running", progress="document.querySelectorAll('section')[1]")
            await c.wait("document.body.innerText.includes('샘플 요약')", 600, "전체 분석 완료")
            await asyncio.sleep(2)
            await c.js("window.scrollTo(0,0)")
            await c.shot("results")
            await rects("results", download="__q.card('다운로드')", summary="__q.card('샘플 요약')", recent="__q.cardAny('최근 분석')", list="__q.card('이미지 목록')")
            await c.js("__q.card('결과 이미지').scrollIntoView({block:'start'})")
            await asyncio.sleep(2.5)
            await c.shot("gallery")
            await rects("gallery", gallery="__q.card('결과 이미지')")
            job_dir = await c.js("document.querySelector('code') ? document.querySelector('code').textContent : ''")
            await c.js("window.scrollTo(0,0)")

            # ── AI 진단
            await c.js("__q.byText('button','AI 진단으로').click()")
            await c.wait("location.pathname.includes('hybrid-lab') && document.body.innerText.includes('12h-1k-1.jpg')", 60, "AI 진단 이동")
            await asyncio.sleep(1.5)
            await c.js(HELPERS)
            await c.shot("diag_empty")
            await rects("diag_empty", input="__q.card('입력 파일')", run="__q.byText('button','진단 실행')", right="document.querySelector('aside')",
                        gt="__q.byText('div','정답 마스크 (선택)', true)")
            await c.js("__q.byText('button','진단 실행').click()")
            await c.wait("document.body.innerText.includes('YOLO instances')", 600, "AI 진단 결과")
            await asyncio.sleep(2.5)
            await c.shot("diag_result")
            await rects("diag_result", views="__q.byText('button','오버레이').parentElement", center="document.querySelectorAll('section')[1]")
            for key, label in (("diag_prob", "U-Net prob"), ("diag_anchor", "M_75"), ("diag_yolo", "YOLO 경계"), ("diag_number", "번호"), ("diag_hist", "히스토그램")):
                await c.js(f"(() => {{ const b = __q.byText('button', {json.dumps(label)}); if (b) b.click(); }})()")
                await asyncio.sleep(2.2 if key == "diag_number" else 1.3)
                await c.shot(key)
            await c.js("__q.byText('button','최종 분리선').click()")
            await asyncio.sleep(1.5)
            await c.shot("diag_separator")
            await c.js("(() => { const h = [...document.querySelectorAll('h2,h3,div')].find(e => e.textContent.trim().startsWith('형상 · 입도 지표')); if (h) h.scrollIntoView({block:'start'}); })()")
            await asyncio.sleep(1.5)
            await c.shot("diag_morph")
            await c.js("window.scrollTo(0,0); document.querySelector('aside').scrollTop = document.querySelector('aside').scrollHeight")
            await asyncio.sleep(1)
            await c.shot("diag_download")
            await rects("diag_download", right="document.querySelector('aside')")

            (OUT / "shots.json").write_text(json.dumps(boxes, ensure_ascii=False, indent=1), encoding="utf-8")
            print("job_dir", job_dir)
            # 결과 파일 샘플 (히스토그램 · 요약 카드 · 비교 이미지)
            jd = Path(job_dir)
            if jd.is_dir():
                for sub, pat, dst in (("histograms", "*.jpg", "result_hist.jpg"), ("summary_images", "*After_summary.jpg", "result_card.jpg"),
                                      ("comparison_images", "*.jpg", "result_compare.jpg")):
                    fs = sorted((jd / sub).glob(pat))
                    if fs:
                        shutil.copy(fs[0], OUT / "steps" / dst)
                        print("copied", fs[0].name)
    finally:
        proc.terminate()
        shutil.rmtree(prof, ignore_errors=True)


if __name__ == "__main__":
    if not DEMO.is_dir():
        sys.exit(f"데모 이미지 폴더가 없습니다: {DEMO}")
    asyncio.run(main())
