"use client";

// 홈 — 프로그램을 처음 여는 화면. 한 화면: 왼쪽 이름, 오른쪽 실제 분석 결과(원본 ↔ 분할, 끌어서 비교) + 아래 메뉴 카드.
// 그림은 데모 사진(12h-1k-1)을 실제로 분석한 결과다 (소개 탭과 같은 파일).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

const MENU = [
  { href: "/", k: "ANALYSIS", t: "입도 분석", d: "사진을 넣고, 한 장으로 확인한 뒤, 전체를 분석합니다.", meta: "Excel · PPT · 그림", wide: true },
  { href: "/hybrid-lab", k: "AI CHECK", t: "AI 진단", d: "인공지능이 어디를 입자로 보았는지 단계별로 확인합니다.", meta: "정답 그림과 비교" },
  { href: "/intro", k: "GUIDE", t: "소개 영상", d: "처음 쓰는 분을 위한 안내와 설정 항목 설명.", meta: "더빙 포함" },
];

/** 원본 ↔ 분할 결과를 끌어서 비교 */
function Compare() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(0.5);
  const drag = useRef(false);
  const holdUntil = useRef(0); // 사용자가 손댄 뒤 잠시 동안은 자동으로 움직이지 않는다
  const phase = useRef(0);

  // 가운데 바가 천천히 좌우로 오간다
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!drag.current && now > holdUntil.current) {
        phase.current += dt * ((2 * Math.PI) / 7); // 한 번 왕복에 7초
        setPos(0.5 + 0.32 * Math.sin(phase.current));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const touched = useCallback((p: number) => {
    holdUntil.current = performance.now() + 4000;
    phase.current = Math.asin(Math.max(-1, Math.min(1, (p - 0.5) / 0.32))); // 멈춘 자리에서 이어서 움직이게
  }, []);
  const move = useCallback((clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const p = Math.max(0.04, Math.min(0.96, (clientX - r.left) / r.width));
    setPos(p);
    touched(p);
  }, [touched]);
  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden rounded-[28px] bg-black select-none touch-none cursor-ew-resize shadow-[0_30px_80px_rgba(20,24,28,0.13)]"
      style={{ aspectRatio: "640 / 444" }}
      onPointerDown={(e) => {
        drag.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => drag.current && move(e.clientX)}
      onPointerUp={() => (drag.current = false)}
      role="slider"
      aria-label="원본과 분할 결과 비교"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pos * 100)}
      tabIndex={0}
      onKeyDown={(e) => {
        const d = e.key === "ArrowLeft" ? -0.05 : e.key === "ArrowRight" ? 0.05 : 0;
        if (!d) return;
        const p = Math.max(0.04, Math.min(0.96, pos + d));
        setPos(p);
        touched(p);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/intro/steps/ai_labeled_before.png" alt="입자 분할 결과" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/intro/steps/ws_original.png"
        alt="원본 SEM 사진"
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover object-top"
        style={{ clipPath: `inset(0 ${(1 - pos) * 100}% 0 0)` }}
      />
      <div className="absolute top-0 bottom-0 w-[2px] bg-white" style={{ left: `calc(${pos * 100}% - 1px)` }}>
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white text-[#14181c] grid place-content-center text-[15px] shadow-[0_6px_18px_rgba(20,24,28,0.25)]">↔</span>
      </div>
      <span className="absolute left-4 bottom-4 rounded-full bg-white/95 px-3 pt-[7px] pb-[5px] text-[12px] font-medium leading-none text-[#14181c]">원본</span>
      <span className="absolute right-4 bottom-4 rounded-full bg-white/95 px-3 pt-[7px] pb-[5px] text-[12px] font-medium leading-none text-[#14181c]">분할 결과</span>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="bg-white text-[#14181c]">
      {/* 첫 화면 */}
      <section className="relative isolate overflow-hidden grid items-center min-h-[calc(100vh-48px)] py-10">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background: "radial-gradient(52vmax 46vmax at 78% 46%, rgba(32,87,212,0.10), transparent 62%)",
            // 구역 위·아래 끝에서 빛이 뚝 끊겨 네모 경계가 보이지 않게 가장자리로 갈수록 지운다
            WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 18%, #000 72%, transparent 100%)",
            maskImage: "linear-gradient(180deg, transparent 0%, #000 18%, #000 72%, transparent 100%)",
          }}
        />
        <div className="mx-auto w-full max-w-[1340px] px-6 lg:px-12 grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-10 lg:gap-12 items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/75 px-4 pt-[9px] pb-[7px] text-[14px] font-medium leading-none text-[#56606b] shadow-[inset_0_0_0_1px_rgba(20,24,28,0.1)]">
              <i className="w-[7px] h-[7px] rounded-full bg-ink shadow-[0_0_0_4px_rgba(32,87,212,0.18)]" />
              SEM 입자 분석 프로그램
            </p>
            <div className="mt-7 text-[clamp(4rem,7.4vw,7rem)] font-bold leading-[0.95] tracking-[-0.04em]">
              Particle
              <br />
              Lab<span className="text-ink">.</span>
            </div>
            <p className="mt-4 text-[12.5px] font-bold uppercase tracking-[0.32em] text-[#8b94a0]">SEM Particle Size Analysis</p>
            <h1 className="mt-5 text-[clamp(1.7rem,2.6vw,2.6rem)] font-bold leading-[1.25] tracking-[-0.02em]">
              SEM 사진 한 장에서
              <br />
              입도 분포까지
            </h1>
            <p className="mt-6 max-w-[27rem] text-[18px] font-light leading-[1.7] text-[#56606b]">
              <b className="font-medium text-[#14181c]">손으로 하루 걸리던 측정을, 몇 분 안에.</b>
              <br />
              사진 속 입자를 하나하나 찾아 크기와 모양을 재고, Excel과 PPT로 정리합니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <Link href="/" className="inline-flex items-center justify-center rounded-full bg-[#14181c] px-6 pt-[15px] pb-[13px] text-[16px] font-bold leading-none text-white transition hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_12px_30px_rgba(20,24,28,0.22)]">
                분석 시작하기
              </Link>
              <Link href="/intro" className="inline-flex items-center justify-center rounded-full bg-white/60 px-6 pt-[15px] pb-[13px] text-[16px] font-bold leading-none shadow-[inset_0_0_0_1.5px_rgba(20,24,28,0.16)] transition hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1.5px_rgba(20,24,28,0.5)]">
                소개 영상 보기
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[640px]">
            <div aria-hidden className="absolute -inset-[14%] rounded-full border border-[rgba(20,24,28,0.06)]" />
            <div aria-hidden className="absolute -inset-[30%] rounded-full border border-[rgba(20,24,28,0.04)]" />
            <div className="relative">
              <Compare />
            </div>
          </div>
        </div>
      </section>

      {/* 메뉴 카드 */}
      <section aria-label="둘러보기" className="pb-24">
        <div className="mx-auto w-full max-w-[1340px] px-6 lg:px-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {MENU.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className={`group relative isolate flex min-h-[13.5rem] flex-col overflow-hidden rounded-[28px] bg-[#f4f6f8] p-6 transition duration-500 hover:-translate-y-[5px] hover:bg-white hover:shadow-[0_30px_80px_rgba(20,24,28,0.13)] ${m.wide ? "lg:col-span-2" : ""}`}
            >
              {m.wide && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/intro/steps/ws_original.png"
                  alt=""
                  className="absolute right-0 top-0 -z-10 h-full w-[48%] object-cover mix-blend-multiply opacity-70"
                  style={{ WebkitMaskImage: "linear-gradient(90deg, transparent 0%, #000 58%)", maskImage: "linear-gradient(90deg, transparent 0%, #000 58%)" }}
                />
              )}
              <span className="text-[12.5px] font-bold tracking-[0.02em] text-ink">{m.k}</span>
              <h3 className="mt-2 text-[clamp(1.3rem,1.8vw,1.7rem)] font-bold leading-[1.25] tracking-[-0.02em]">{m.t}</h3>
              <p className="mt-2 max-w-[17rem] text-[14.5px] font-light leading-[1.55] text-[#56606b]">{m.d}</p>
              <span className="mt-auto flex items-center justify-between gap-2.5 pt-[18px] text-[13.5px] font-medium">
                {m.meta}
                <span aria-hidden className="grid h-[34px] w-[34px] flex-none place-content-center rounded-full bg-[#14181c] text-white transition duration-500 group-hover:translate-x-1 group-hover:bg-ink" style={{ fontFamily: "-apple-system, 'Segoe UI', sans-serif" }}>
                  →
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

    </main>
  );
}
