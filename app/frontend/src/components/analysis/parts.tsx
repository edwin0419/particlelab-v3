// 분석 화면 공용 작은 부품 — 숫자 표기 · 알약 버튼 · 통계 칸.

import clsx from "clsx";

import { TERMS as T } from "@/lib/terms";

export function fmt(v: number | undefined | null, d = 3) {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "–";
}

export const PILL = (active: boolean) =>
  "text-[11px] px-2.5 py-1 rounded-md border " +
  (active
    ? "bg-fg text-white border-fg"
    : "bg-white border-edge-strong text-fg-mute hover:border-fg hover:text-fg");

export function BigStat({ label, value, unit, sub, dim, small }: { label: string; value: number | string; unit?: string; sub?: string; dim?: boolean; small?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-fg-faint font-semibold">{label}</div>
      <div className={clsx("font-bold leading-none mt-0.5", small ? "text-[14px] pt-1.5" : "text-[20px]", dim ? "text-fg-faint" : "text-fg")}>
        {typeof value === "number" ? value.toLocaleString() : value}
        {unit && <span className="text-[12px] text-fg-faint font-medium ml-0.5">{unit}</span>}
      </div>
      {sub && <div className="text-[10px] text-fg-faint mt-0.5 font-mono">{sub}</div>}
    </div>
  );
}

export function DStat({ label, before, after, d = 3 }: { label: string; before?: number; after?: number; d?: number }) {
  return (
    <div className="flex flex-col items-start px-3 py-1.5 border-r border-edge last:border-r-0 min-w-[92px]">
      <span className="text-[10px] uppercase tracking-wider text-fg-faint font-semibold">{label}</span>
      <span className="text-[14px] font-bold font-mono tabular-nums text-fg">{fmt(after, d)}</span>
      <span className="text-[10px] font-mono tabular-nums text-fg-faint">
        {T.before.label} {fmt(before, d)}
      </span>
    </div>
  );
}
