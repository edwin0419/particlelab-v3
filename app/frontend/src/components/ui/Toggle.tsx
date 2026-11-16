"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

export interface ToggleProps {
  label?: ReactNode;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
  /** 라벨 없이 스위치만 */
  bare?: boolean;
}

/** globals.css 의 checkbox→switch 스타일을 사용하는 토글 */
export default function Toggle({ label, hint, checked, onChange, disabled, className, bare }: ToggleProps) {
  const input = (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={typeof label === "string" ? label : undefined}
    />
  );
  if (bare || !label) return <span className={className}>{input}</span>;
  return (
    <label className={clsx("block text-xs cursor-pointer", disabled && "cursor-not-allowed", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className={clsx("text-fg", disabled && "opacity-50")}>{label}</span>
        {input}
      </div>
      {hint && <div className={clsx("text-[10px] text-gray-500 mt-0.5 leading-snug", disabled && "opacity-50")}>{hint}</div>}
    </label>
  );
}
