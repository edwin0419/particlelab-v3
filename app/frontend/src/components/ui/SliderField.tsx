"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { coerceNumber } from "./NumberField";

export interface SliderFieldProps {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  integer?: boolean;
  odd?: boolean;
  unit?: string;
  disabled?: boolean;
  /** 숫자 입력은 슬라이더 범위 밖도 허용 */
  allowOutOfRange?: boolean;
  /** 소수 표시 자릿수 (기본 step 에서 유도) */
  decimals?: number;
  className?: string;
}

function decimalsOf(step: number) {
  const s = String(step);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

export default function SliderField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step = 1,
  integer,
  odd,
  unit,
  disabled,
  allowOutOfRange,
  decimals,
  className,
}: SliderFieldProps) {
  const dec = decimals ?? decimalsOf(step);
  const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(dec) : "");
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value, dec]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (n: number) => {
    const v = coerceNumber(n, {
      min: allowOutOfRange ? undefined : min,
      max: allowOutOfRange ? undefined : max,
      integer,
      odd,
    });
    if (v !== value) onChange(v);
    setText(fmt(v));
  };

  const cancelled = useRef(false); // Esc 로 취소한 직후의 blur 는 반영하지 않는다
  const commitText = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setText(fmt(value));
      return;
    }
    const n = Number(text);
    // 빈칸은 0 이 아니라 "입력 취소" — 실수로 지웠을 때 값이 0 으로 바뀌지 않게
    if (text.trim() === "" || !Number.isFinite(n)) {
      setText(fmt(value));
      return;
    }
    apply(n);
  };

  const sliderVal = Math.max(min, Math.min(max, value));

  return (
    <div className={clsx("block text-xs", disabled && "opacity-50", className)}>
      <div className="flex justify-between items-center mb-1 gap-2">
        <span className="min-w-0 truncate text-fg" title={hint ? `${label} — ${hint}` : label}>
          {label}
        </span>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <input
            type="text"
            inputMode="decimal"
            className="knob-num font-mono text-[12px] text-right bg-transparent w-16 px-1.5 py-0.5 rounded-md border border-transparent text-fg-mute hover:border-edge-strong focus:border-fg focus:text-fg focus:bg-white disabled:opacity-50"
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => requestAnimationFrame(() => e.target.select())}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                cancelled.current = true;
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          {unit && <span className="text-[10px] text-fg-faint">{unit}</span>}
        </div>
      </div>
      <input
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={odd ? 2 : step}
        value={sliderVal}
        disabled={disabled}
        onChange={(e) => apply(Number(e.target.value))}
      />
      {hint && <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{hint}</div>}
    </div>
  );
}
