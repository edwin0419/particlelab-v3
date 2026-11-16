"use client";

// 상단바: 로고 · 네비 탭 · 백엔드 상태 점 · 기본 모델 상태.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Activity, Home, PlayCircle, ScanSearch } from "lucide-react";
import { basicPt, health } from "@/lib/api";

const NAV = [
  { href: "/home", label: "홈", Icon: Home, title: "프로그램 첫 화면" },
  { href: "/", label: "분석", Icon: ScanSearch, title: "이미지 목록 → 미리보기로 설정 맞추기 → 전체 분석 (Excel · PPT)" },
  { href: "/hybrid-lab", label: "AI 진단", Icon: Activity, title: "정답 마스크와 비교해 AI 분할 평가 · 형상 지표" },
  { href: "/intro", label: "소개", Icon: PlayCircle, title: "처음 쓰는 분을 위한 프로그램 안내 (자동 재생)" },
];

type Health = "unknown" | "ok" | "down";

interface BasicStatus {
  unet: boolean | null;
  yolo: boolean | null;
  raw: Record<string, unknown> | null;
}

/** /api/basic_pt 응답 형태가 백엔드 구현에 따라 다를 수 있어 느슨하게 해석 */
function parseBasic(j: unknown): BasicStatus {
  if (!j || typeof j !== "object") return { unet: null, yolo: null, raw: null };
  const d = j as Record<string, unknown>;
  const pick = (keys: string[]): boolean | null => {
    for (const k of keys) {
      const v = d[k];
      if (typeof v === "boolean") return v;
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (typeof o.exists === "boolean") return o.exists;
        if (typeof o.ok === "boolean") return o.ok;
        if (typeof o.available === "boolean") return o.available;
        if (typeof o.path === "string") return o.path.length > 0;
      }
      if (typeof v === "string") return v.length > 0;
    }
    return null;
  };
  return {
    unet: pick(["unet", "unetpp", "U-net++", "unet_pp", "unet_exists", "has_unet"]),
    yolo: pick(["yolo", "yolo_11", "yolo11", "yolo_exists", "has_yolo"]),
    raw: d,
  };
}

export default function AppShell() {
  const pathname = usePathname() ?? "/";
  const [hs, setHs] = useState<Health>("unknown");
  const [device, setDevice] = useState<string>("");
  const [basic, setBasic] = useState<BasicStatus>({ unet: null, yolo: null, raw: null });

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 4000);
      try {
        const h = (await health(ctrl.signal)) as unknown as { device?: string; mps?: boolean; cuda?: boolean };
        if (alive) {
          setHs("ok");
          setDevice(h?.cuda ? "CUDA GPU" : h?.mps ? "Apple GPU" : h?.device ? "CPU" : "");
        }
      } catch {
        if (alive) setHs("down");
      } finally {
        clearTimeout(to);
      }
      if (alive) timer = setTimeout(tick, 10_000);
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // 백엔드가 살아있을 때만 (상태 전환 시) 기본 모델 상태 조회
  useEffect(() => {
    if (hs !== "ok") return;
    let alive = true;
    basicPt()
      .then((j) => alive && setBasic(parseBasic(j)))
      .catch(() => alive && setBasic({ unet: null, yolo: null, raw: null }));
    return () => {
      alive = false;
    };
  }, [hs]);

  const basicLabel = (() => {
    if (hs !== "ok") return "모델 상태 확인 불가";
    if (basic.unet === null && basic.yolo === null) return "기본 모델: 확인 중";
    const parts: string[] = [];
    parts.push(`U-Net++ ${basic.unet ? "✓" : "✗"}`);
    parts.push(`YOLO ${basic.yolo ? "✓" : "✗"}`);
    return parts.join(" · ");
  })();
  const basicOk = basic.unet === true && basic.yolo === true;

  return (
    <header className="sticky top-0 z-40 bg-bg1/90 backdrop-blur border-b border-line">
      <div className="w-full px-4 lg:px-6 h-12 flex items-center gap-4">
        <Link href="/home" className="flex items-center gap-2 flex-shrink-0" title="홈">
          <span className="w-6 h-6 rounded-md bg-fg text-white inline-flex items-center justify-center text-[11px] font-bold">P</span>
          <span className="text-[14px] font-bold tracking-tight text-text">Particle Lab</span>
        </Link>

        {/* 화면 전환: 버튼임이 보이도록 테두리 있는 버튼 묶음으로 */}
        <nav className="flex items-center gap-1.5 ml-3" aria-label="화면 전환">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" || pathname.startsWith("/batch") : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                title={n.title}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "h-8 px-3.5 inline-flex items-center gap-1.5 rounded-md border text-[12.5px] font-semibold transition-colors",
                  active
                    ? "bg-fg border-fg text-white shadow-sm"
                    : "bg-white border-line-strong text-fg shadow-[0_1px_0_rgba(0,0,0,0.04)] hover:border-fg hover:bg-surface-soft",
                )}
              >
                <n.Icon size={14} strokeWidth={2.2} className={active ? "text-white" : "text-fg-mute"} />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {device && hs === "ok" && (
            <span className="chip chip-mute hidden sm:inline-flex" title="AI 추론 장치">{device}</span>
          )}
          <span
            className={clsx("chip", basicOk ? "chip-good" : hs === "ok" ? "chip-mute" : "chip-mute opacity-60")}
            title={basic.raw ? JSON.stringify(basic.raw) : undefined}
          >
            {basicLabel}
          </span>
          <span
            className={clsx("chip", hs === "ok" ? "chip-good" : hs === "down" ? "chip-bad" : "chip-mute")}
            title={`${hs === "ok" ? "백엔드 연결됨" : hs === "down" ? "백엔드 응답 없음" : "확인 중"} (10초마다 /api/health)`}
          >
            <span className={clsx("chip-dot", hs === "ok" && "ring-pulse", hs === "unknown" && "dot-pulse")} />
            {hs === "ok" ? "백엔드 연결" : hs === "down" ? "백엔드 끊김" : "확인 중"}
          </span>
        </div>
      </div>
    </header>
  );
}
