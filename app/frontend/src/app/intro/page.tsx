"use client";

// 소개(쇼릴) — 프로그램을 처음 보는 사람을 위한 장면별 안내. 실제 화면 캡처 + 자막이 자동으로 넘어간다.
// 영상 내보내기(tools/intro_video.py)는 이 페이지를 ?capture=1&scene=N&hl=0|1 로 열어 장면을 찍는다.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX } from "lucide-react";

import { INTRO_SCENES, sceneSeconds, type IntroScene } from "@/lib/introScenes";
import { PARAM_SCENES } from "@/lib/paramScenes";

// 영상 두 편: 프로그램 소개 / 설정 항목 하나하나 (?set=params)
const SETS = {
  intro: { label: "프로그램 소개", desc: "처음 쓰는 분을 위한 안내", scenes: INTRO_SCENES },
  params: { label: "설정 항목", desc: "설정을 하나씩, 값을 바꾸면 생기는 일", scenes: PARAM_SCENES },
} as const;
type SetKey = keyof typeof SETS;

type Panels = Record<string, { w: number; h: number; boxes: Record<string, Box | null> }>;
type ExSide = { label: string; cap: string; w: number; h: number };
type Examples = Record<string, { a: ExSide; b: ExSide; zoom?: boolean }>;
interface Assets {
  boxes: Boxes;
  panels: Panels;
  examples: Examples;
}

type Box = [number, number, number, number]; // x, y, w, h (화면 대비 비율)
type Boxes = Record<string, Record<string, Box | null>>;

const STAGE_W = 1920;
const STAGE_H = 1080;
const SHOT_W = 1440; // 캡처(16:9)가 놓이는 크기
const SHOT_H = 810;

function fmtTime(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function lookupBox(boxes: Boxes, shot: string, name?: string): Box | null {
  if (!name) return null;
  const [a, b] = name.includes(".") ? name.split(".") : [shot, name];
  const r = boxes[a]?.[b];
  if (!r) return null;
  // 화면 밖으로 나간 부분은 잘라낸다
  const x = Math.max(0, r[0]);
  const y = Math.max(0, r[1]);
  const w = Math.min(1, r[0] + r[2]) - x;
  const h = Math.min(1, r[1] + r[3]) - y;
  return w > 0.01 && h > 0.01 ? [x, y, w, h] : null;
}

/** 설정 패널 캡처에서 해당 항목 주변만 보여 주는 틀 */
function PanelCrop({ panels, panel, row, width, height }: { panels: Panels; panel: string; row: string; width: number; height: number }) {
  const meta = panels[panel];
  if (!meta) return <div style={{ width, height }} />;
  const imgH = (width * meta.h) / meta.w;
  height = Math.min(height, imgH); // 짧은 카드는 틀도 그만큼만
  const box = meta.boxes[row];
  const cy = box ? (box[1] + box[3] / 2) * imgH : 0;
  const ty = Math.min(0, Math.max(height - imgH, height / 2 - cy));
  return (
    <div className="relative rounded-2xl overflow-hidden border border-edge-strong shadow-lg bg-white" style={{ width, height }}>
      <div className="absolute left-0 top-0" style={{ width, height: imgH, transform: `translateY(${ty}px)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/intro/params/panels/${panel}.jpg`} alt={row} className="absolute inset-0 w-full h-full" />
        {box && (
          <div
            className="absolute rounded-xl"
            style={{ left: box[0] * width - 10, top: box[1] * imgH - 8, width: box[2] * width + 20, height: box[3] * imgH + 16, border: "4px solid #2057d4", boxShadow: "0 0 0 4000px rgba(20,22,27,0.34)" }}
          />
        )}
      </div>
    </div>
  );
}

/** 설정 항목 장면: 왼쪽 = 패널에서의 위치 + 기본값 · 효과, 오른쪽 = 값을 바꿔 계산한 실제 결과 */
function ParamVisual({ v, assets }: { v: Extract<IntroScene["visual"], { kind: "param" }>; assets: Assets }) {
  const ex = v.ex ? assets.examples[v.ex] : undefined;
  const figs = ex
    ? [
        { src: `/intro/params/ex/${v.ex}_a.jpg`, label: ex.a.label, cap: ex.a.cap },
        { src: `/intro/params/ex/${v.ex}_b.jpg`, label: ex.b.label, cap: ex.b.cap },
      ]
    : v.img
      ? [{ src: v.img.src, label: v.img.label, cap: "" }]
      : [];
  const wide = figs.length === 0;
  const info = (
    <div className="rounded-2xl border border-edge-strong bg-white shadow-sm px-7 py-6" style={{ width: wide ? 780 : 640 }}>
      <div className={clsx("font-bold text-fg leading-tight", wide ? "text-[44px]" : "text-[36px]")}>{v.row}</div>
      <div className="mt-4 flex flex-wrap gap-2.5">
        {v.facts.map((f) => (
          <span key={f} className={clsx("rounded-full bg-surface-soft border border-edge px-4 py-1.5 text-fg-mute font-medium", wide ? "text-[23px]" : "text-[20px]")}>
            {f}
          </span>
        ))}
      </div>
      <dl className="mt-5 space-y-3">
        {v.effects.map(([k, t]) => (
          <div key={k + t} className={clsx("flex items-start gap-4 leading-snug", wide ? "text-[26px]" : "text-[22px]")}>
            <dt className="flex-shrink-0 rounded-lg bg-ink text-white font-semibold px-3 py-0.5 text-center" style={{ minWidth: wide ? 150 : 124 }}>
              {k}
            </dt>
            <dd className="text-fg pt-0.5" style={{ wordBreak: "keep-all" }}>
              {t}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
  if (wide) {
    return (
      <div className="w-full h-full flex items-center justify-center gap-14">
        <PanelCrop panels={assets.panels} panel={v.panel} row={v.row} width={640} height={640} />
        {info}
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center gap-12 px-12">
      <div className="flex flex-col gap-6 flex-shrink-0">
        <PanelCrop panels={assets.panels} panel={v.panel} row={v.row} width={640} height={300} />
        {info}
      </div>
      <div className="flex items-start justify-center gap-6 min-w-0">
        {figs.map((f) => (
          <figure key={f.src} className="flex flex-col items-center min-w-0">
            <div className="mb-3 rounded-full bg-fg text-white text-[24px] font-semibold px-6 py-1.5">{f.label}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.src} alt={f.label} className="rounded-2xl border border-edge-strong shadow-lg bg-white object-contain" style={figs.length === 2 ? { width: 540, maxHeight: 560 } : { maxWidth: 1040, maxHeight: 640 }} />
            {f.cap && <figcaption className="mt-3 text-[24px] text-fg font-medium">{f.cap}</figcaption>}
          </figure>
        ))}
        </div>
      {ex?.zoom && <div className="absolute right-12 top-[84px] text-[19px] text-fg-faint">사진 가운데를 2배로 확대</div>}
    </div>
  );
}

/** 장면의 그림 영역 */
function Visual({ scene, assets, highlight, animate }: { scene: IntroScene; assets: Assets; highlight: boolean; animate: boolean }) {
  const v = scene.visual;
  const boxes = assets.boxes;
  if (v.kind === "param") return <ParamVisual v={v} assets={assets} />;
  if (v.kind === "title") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center">
        <div className="text-[92px] font-bold tracking-tight text-fg leading-tight">{v.big}</div>
        {v.sub && <div className="mt-6 text-[36px] text-fg-mute">{v.sub}</div>}
        <div className="mt-12 h-1.5 w-40 rounded-full bg-ink" />
      </div>
    );
  }
  if (v.kind === "points") {
    return (
      <div className="w-full h-full flex flex-col justify-center px-[200px]">
        <div className="text-[56px] font-bold text-fg mb-10">{v.heading}</div>
        <ul className="space-y-6">
          {v.items.map((it) => (
            <li key={it} className="flex items-start gap-6 text-[36px] text-fg leading-snug">
              <span className="mt-[18px] h-3.5 w-3.5 rounded-full bg-ink flex-shrink-0" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (v.kind === "steps") {
    const shown = v.items.slice(0, v.upto + 1);
    const cur = shown[shown.length - 1];
    return (
      <div className="w-full h-full flex items-center justify-center gap-10 px-16">
        <div className="flex flex-col gap-3 w-[330px]">
          {v.items.map((it, i) => (
            <div
              key={it.label}
              className={clsx(
                "rounded-xl border px-4 py-3 text-[21px] leading-snug",
                i === v.upto ? "border-ink bg-ink text-white font-semibold" : i < v.upto ? "border-edge-strong bg-white text-fg-mute" : "border-edge bg-surface-soft text-fg-faint opacity-50",
              )}
            >
              {it.label}
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cur.src} alt={cur.label} className="h-[720px] w-auto rounded-2xl border border-edge-strong shadow-lg bg-black" />
        </div>
      </div>
    );
  }
  if (v.kind === "image") {
    return (
      <div className="w-full h-full flex items-center justify-center gap-10 px-16">
        {[{ src: v.src, label: v.label }, ...(v.src2 ? [{ src: v.src2, label: v.label2 }] : [])].map((im) => (
          <figure key={im.src} className="flex flex-col items-center min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.src} alt={im.label ?? ""} className="max-h-[680px] max-w-full w-auto rounded-2xl border border-edge-strong shadow-lg bg-white" style={{ minHeight: v.src2 ? 520 : 0 }} />
            {im.label && <figcaption className="mt-5 text-[26px] text-fg-mute">{im.label}</figcaption>}
          </figure>
        ))}
      </div>
    );
  }
  // 실제 화면 캡처 + 강조 상자. 강조할 때는 그 부분을 확대해 글씨가 읽히게 한다.
  const box = lookupBox(boxes, v.shot, v.box);
  let z = 1;
  let tx = 0;
  let ty = 0;
  if (box && highlight) {
    z = Math.max(1, Math.min(2.3, 0.82 / box[2], 0.82 / box[3]));
    const lim = (z - 1) / 2; // 그림이 틀 밖으로 밀려나지 않는 한계
    tx = Math.max(-lim, Math.min(lim, (0.5 - (box[0] + box[2] / 2)) * z)) * SHOT_W;
    ty = Math.max(-lim, Math.min(lim, (0.5 - (box[1] + box[3] / 2)) * z)) * SHOT_H;
  }
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="relative rounded-2xl overflow-hidden border border-edge-strong shadow-xl bg-white" style={{ width: SHOT_W, height: SHOT_H }}>
        <div className="absolute inset-0" style={{ transform: `translate(${tx}px, ${ty}px) scale(${z})`, transition: animate ? "transform 0.7s ease" : "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/intro/shots/${v.shot}.jpg`} alt={scene.title} className="absolute inset-0 w-full h-full" />
          {box && (
            <div
              className="absolute"
              style={{
                left: box[0] * SHOT_W - 6 / z,
                top: box[1] * SHOT_H - 6 / z,
                width: box[2] * SHOT_W + 12 / z,
                height: box[3] * SHOT_H + 12 / z,
                opacity: highlight ? 1 : 0,
                transition: animate ? "opacity 0.5s" : "none",
                borderRadius: 12 / z,
                border: `${5 / z}px solid #2057d4`,
                boxShadow: "0 0 0 4000px rgba(20,22,27,0.38)",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** 1920×1080 무대 한 장면 (영상 프레임과 같은 모양) */
function Stage({ scenes, index, assets, highlight, progress, animate = true }: { scenes: readonly IntroScene[]; index: number; assets: Assets; highlight: boolean; progress: number; animate?: boolean }) {
  const scene = scenes[index];
  return (
    <div className="relative bg-[#f7f8fb] overflow-hidden" style={{ width: STAGE_W, height: STAGE_H }}>
      <div className="absolute left-0 right-0 top-0 h-[70px] px-12 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-[22px] font-bold text-ink">{scene.chapter}</span>
          <span className="text-[22px] text-fg-faint">·</span>
          <span className="text-[22px] font-semibold text-fg">{scene.title}</span>
        </div>
        <span className="text-[20px] text-fg-faint font-mono">
          {index + 1} / {scenes.length}
        </span>
      </div>
      <div className="absolute left-0 right-0 top-[70px]" style={{ height: 830 }}>
        <Visual scene={scene} assets={assets} highlight={highlight} animate={animate} />
      </div>
      <div className="absolute left-0 right-0 bottom-0 h-[180px] bg-white border-t border-edge-strong px-[120px] flex items-center justify-center">
        <p className="text-[31px] leading-[1.5] text-fg text-center" style={{ wordBreak: "keep-all" }}>
          {scene.say}
        </p>
      </div>
      <div className="absolute left-0 bottom-0 h-1.5 bg-ink" style={{ width: `${progress * 100}%` }} />
    </div>
  );
}

function IntroInner() {
  const sp = useSearchParams();
  const capture = sp.get("capture") === "1";
  const [setKey, setSetKey] = useState<SetKey>(() => (sp.get("set") === "params" ? "params" : "intro"));
  const SCENES: readonly IntroScene[] = SETS[setKey].scenes;
  const [index, setIndex] = useState(() => Math.max(0, Math.min(SETS[sp.get("set") === "params" ? "params" : "intro"].scenes.length - 1, parseInt(sp.get("scene") ?? "0", 10) || 0)));
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0); // 현재 장면에서 지난 시간(초)
  const [speed, setSpeed] = useState(1);
  const [assets, setAssets] = useState<Assets>({ boxes: {}, panels: {}, examples: {} });
  const [scale, setScale] = useState(0.5);
  const wrapRef = useRef<HTMLDivElement>(null);
  // 더빙: /intro/voice/<편>.m4a 와 장면 시작 시각(<편>.json, tools/intro_voice.py 가 만든다). 있으면 목소리가 시계가 된다.
  const [voice, setVoice] = useState<{ cuts: number[]; total: number } | null>(null);
  const [muted, setMuted] = useState(false);
  const [barsOn, setBarsOn] = useState(true); // 재생 중에는 마우스를 움직일 때만 위·아래 바를 보인다
  const audioRef = useRef<HTMLAudioElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const at = useRef({ index: 0, elapsed: 0 }); // 지금 보고 있는 곳 (목소리를 틀 때 여기서부터)

  useEffect(() => {
    // 영상 · 대본 내보내기 스크립트가 장면 목록을 읽어 간다
    (window as unknown as { __introScenes: unknown }).__introScenes = SCENES.map((x) => ({
      chapter: x.chapter,
      title: x.title,
      say: x.say,
      seconds: sceneSeconds(x),
      hasBox: x.visual.kind === "shot" && !!x.visual.box,
    }));
  }, [SCENES]);
  useEffect(() => {
    const get = (url: string) =>
      fetch(url)
        .then((r) => r.json())
        .catch(() => ({}));
    Promise.all([get("/intro/shots.json"), get("/intro/params/panels.json"), get("/intro/params/examples.json")]).then(([boxes, panels, examples]) => {
      setAssets({ boxes, panels, examples });
      document.body.dataset.introReady = "1"; // 영상 캡처 스크립트가 기다리는 신호
    });
  }, []);

  // 무대를 화면 폭에 맞춰 축소
  useEffect(() => {
    if (capture) return;
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / STAGE_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [capture]);

  useEffect(() => {
    if (capture) return;
    let alive = true;
    setVoice(null);
    fetch(`/intro/voice/${setKey}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (alive && v && Array.isArray(v.cuts) && v.cuts.length === SETS[setKey].scenes.length) setVoice(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [setKey, capture]);

  // 장면 길이: 더빙이 있으면 목소리에 맞춘 길이, 없으면 글자 수로 잡은 길이
  const durs = useMemo(
    () => (voice ? voice.cuts.map((c, i) => (i + 1 < voice.cuts.length ? voice.cuts[i + 1] : voice.total) - c) : SCENES.map((x) => sceneSeconds(x))),
    [voice, SCENES],
  );
  const dur = durs[index];
  at.current = { index, elapsed };
  const go = useCallback((i: number) => {
    const n = Math.max(0, Math.min(SCENES.length - 1, i));
    setIndex(n);
    setElapsed(0);
    if (voice && audioRef.current) audioRef.current.currentTime = voice.cuts[n];
  }, [SCENES, voice]);
  const pickSet = (k: SetKey) => {
    setSetKey(k);
    setIndex(0);
    setElapsed(0);
    setPlaying(false);
  };

  // 재생: 더빙이 있으면 목소리를 틀고 그 시각을 따라간다. 없으면 타이머.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !voice) return;
    a.playbackRate = speed;
    a.muted = muted;
    if (playing) {
      // 소리 파일이 준비되기 전에 장면을 옮겼으면 목소리 위치가 어긋나 있다 → 화면 쪽에 맞춘다
      const want = voice.cuts[at.current.index] + at.current.elapsed;
      if (Math.abs(a.currentTime - want) > 0.5) a.currentTime = want;
      a.play().catch(() => setPlaying(false));
    } else a.pause();
  }, [playing, speed, muted, voice]);
  useEffect(() => {
    if (!playing || capture) return;
    const t = setInterval(() => {
      const a = audioRef.current;
      if (voice && a) {
        const now = a.currentTime;
        let i = voice.cuts.length - 1;
        while (i > 0 && voice.cuts[i] > now) i -= 1;
        setIndex(i);
        setElapsed(now - voice.cuts[i]);
        if (a.ended) setPlaying(false);
      } else setElapsed((e) => e + 0.1 * speed);
    }, 100);
    return () => clearInterval(t);
  }, [playing, speed, capture, voice]);
  useEffect(() => {
    if (voice || elapsed < dur) return;
    if (index < SCENES.length - 1) go(index + 1);
    else setPlaying(false);
  }, [voice, elapsed, dur, index, go, SCENES.length]);

  // 위·아래 바: 멈춰 있으면 항상, 재생 중에는 마우스를 움직인 뒤 2.5초 동안
  const wake = useCallback(() => {
    setBarsOn(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setBarsOn(false), 2500);
  }, []);
  useEffect(() => {
    if (playing) wake(); // 재생을 시작하면 잠시 뒤 바가 사라진다
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [playing, wake]);

  // 키보드: 스페이스 = 재생/정지, ← → = 이전/다음
  useEffect(() => {
    if (capture) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [capture, go, index]);

  const chapters = useMemo(() => {
    const out: { name: string; start: number; count: number; seconds: number }[] = [];
    SCENES.forEach((s, i) => {
      const last = out[out.length - 1];
      if (last && last.name === s.chapter) {
        last.count += 1;
        last.seconds += durs[i];
      } else out.push({ name: s.chapter, start: i, count: 1, seconds: durs[i] });
    });
    return out;
  }, [SCENES, durs]);

  const total = useMemo(() => durs.reduce((a, x) => a + x, 0), [durs]);
  const before = durs.slice(0, index).reduce((a, x) => a + x, 0);
  const overall = (before + Math.min(elapsed, dur)) / total;

  if (capture) {
    // 영상 프레임: 무대만, 정확히 1920×1080
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#f7f8fb" }}>
        <Stage scenes={SCENES} index={index} assets={assets} highlight={sp.get("hl") !== "0"} progress={(before + dur) / total} animate={false} />
      </div>
    );
  }

  return (
    <div className="w-full px-4 lg:px-6 py-4 lg:py-5 grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)] gap-4 lg:gap-5">
      {/* 차례 */}
      <aside className="app-card p-3 h-fit lg:sticky lg:top-[68px]">
        <div className="px-1 pb-2">
          <div className="text-[11px] font-semibold text-fg-mute mb-1.5">영상 선택</div>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {(Object.keys(SETS) as SetKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => pickSet(k)}
                aria-pressed={k === setKey}
                className={clsx(
                  "h-10 rounded-md border text-[12.5px] font-semibold transition-colors",
                  k === setKey ? "bg-ink border-ink text-white shadow-sm" : "bg-white border-line-strong text-fg hover:border-ink hover:text-ink",
                )}
              >
                {SETS[k].label}
              </button>
            ))}
          </div>
          <p className="text-[10.5px] text-fg-faint mt-0.5">
            {SETS[setKey].desc} · 약 {Math.round(total / 60)}분 · {SCENES.length}장면
          </p>
        </div>
        <ol className="space-y-0.5">
          {chapters.map((c, ci) => {
            const active = index >= c.start && index < c.start + c.count;
            return (
              <li key={c.name}>
                <button
                  type="button"
                  onClick={() => go(c.start)}
                  className={clsx("w-full text-left px-2 py-1.5 rounded-md text-[12px] flex items-center justify-between gap-2", active ? "bg-fg text-white font-semibold" : "text-fg-mute hover:bg-edge-soft hover:text-fg")}
                >
                  <span className="truncate">
                    {ci + 1}. {c.name}
                  </span>
                  <span className={clsx("font-mono text-[10px]", active ? "text-white/70" : "text-fg-faint")}>{fmtTime(c.seconds)}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="text-[10px] text-fg-faint mt-3 px-1 leading-snug">스페이스 = 재생/정지 · ← → = 이전/다음 장면</p>
      </aside>

      {/* 무대 — 조작 바는 무대 위·아래에 겹쳐 뜬다 */}
      <section className="min-w-0">
        {voice && <audio ref={audioRef} src={`/intro/voice/${setKey}.m4a`} preload="auto" />}
        <div
          ref={wrapRef}
          className={clsx("app-card overflow-hidden relative select-none", playing && !barsOn && "cursor-none")}
          style={{ height: STAGE_H * scale }}
          onMouseMove={wake}
          onMouseLeave={() => playing && setBarsOn(false)}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: STAGE_W, height: STAGE_H }} onClick={() => setPlaying((p) => !p)}>
            <Stage scenes={SCENES} index={index} assets={assets} highlight={!playing || elapsed > 0.9} progress={overall} />
          </div>
          {(() => {
            const show = !playing || barsOn;
            const bar = clsx("absolute inset-x-0 flex items-center gap-3 px-4 text-white transition-opacity duration-300", show ? "opacity-100" : "opacity-0 pointer-events-none");
            const icon = "h-9 w-9 rounded-md inline-flex items-center justify-center hover:bg-white/20 disabled:opacity-40";
            return (
              <>
                <div className={clsx(bar, "top-0 bg-[#161616]")} style={{ height: Math.max(44, 72 * scale) }}>
                  <span className="text-[13px] font-semibold truncate">
                    {SETS[setKey].label} · {SCENES[index].chapter}
                  </span>
                  <span className="text-[12px] text-white/80 truncate">{SCENES[index].title}</span>
                  <span className="ml-auto text-[11px] font-mono text-white/80 shrink-0">
                    {index + 1} / {SCENES.length}
                  </span>
                </div>
                <div className={clsx(bar, "bottom-0 h-12 bg-black/80")}>
                  <button type="button" className={icon} onClick={() => setPlaying((p) => !p)} title={playing ? "일시정지" : "재생"} aria-label={playing ? "일시정지" : "재생"}>
                    {playing ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                  <button type="button" className={icon} onClick={() => go(index - 1)} disabled={index === 0} title="이전 장면" aria-label="이전 장면">
                    <ChevronLeft size={18} />
                  </button>
                  <button type="button" className={icon} onClick={() => go(index + 1)} disabled={index === SCENES.length - 1} title="다음 장면" aria-label="다음 장면">
                    <ChevronRight size={18} />
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={SCENES.length - 1}
                    step={1}
                    value={index}
                    onChange={(e) => go(parseInt(e.target.value, 10))}
                    className="flex-1 min-w-[120px] accent-white"
                    aria-label="장면 이동"
                  />
                  <span className="text-[11px] font-mono text-white/90 shrink-0">
                    {fmtTime(before + Math.min(elapsed, dur))} / {fmtTime(total)}
                  </span>
                  {voice && (
                    <button type="button" className={icon} onClick={() => setMuted((m) => !m)} title={muted ? "소리 켜기" : "소리 끄기"} aria-label={muted ? "소리 켜기" : "소리 끄기"}>
                      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                  )}
                  <select className="h-8 rounded-md bg-white/15 border border-white/30 px-1.5 text-[12px] text-white" value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))} aria-label="재생 속도">
                    {[0.75, 1, 1.25, 1.5, 2].map((v) => (
                      <option key={v} value={v} className="text-black">
                        {v}×
                      </option>
                    ))}
                  </select>
                </div>
              </>
            );
          })()}
        </div>
      </section>
    </div>
  );
}

export default function IntroPage() {
  return (
    <Suspense fallback={null}>
      <IntroInner />
    </Suspense>
  );
}
