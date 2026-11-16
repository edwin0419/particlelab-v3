"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { ChevronDown, RotateCcw } from "lucide-react";

export interface ParamSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  /** 기본값 리셋 버튼 콜백 (없으면 버튼 숨김) */
  onReset?: () => void;
  /** 제목 우측 추가 요소 (예: enable 토글) */
  right?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function ParamSection({
  title,
  subtitle,
  defaultOpen = true,
  onReset,
  right,
  badge,
  children,
  className,
}: ParamSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={clsx("app-card p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 text-left flex-1" aria-expanded={open}>
          <h2 className="text-[13px] font-semibold text-fg flex items-center gap-1.5">
            {title}
            {badge}
          </h2>
          {subtitle && <p className="text-[10.5px] text-fg-faint leading-snug mt-0.5">{subtitle}</p>}
        </button>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {right && <div onClick={(e) => e.stopPropagation()}>{right}</div>}
          {onReset && open && (
            <button
              type="button"
              onClick={onReset}
              title="이 섹션을 기본값으로"
              className="text-[11px] px-1.5 py-1 rounded-md text-fg-faint hover:text-fg hover:bg-edge-soft inline-flex items-center gap-1"
            >
              <RotateCcw size={10} />
              기본값
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-[11px] px-2 py-1 rounded-md text-fg-mute hover:text-fg hover:bg-edge-soft font-medium flex items-center gap-1"
          >
            {open ? "접기" : "펼치기"}
            <ChevronDown size={11} className={clsx("transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>
      {open && <div className="mt-3 space-y-3 fade-in cq">{children}</div>}
    </section>
  );
}
