"use client";

import clsx from "clsx";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectFieldProps<T extends string> {
  label?: string;
  hint?: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
  selectClassName?: string;
}

export default function SelectField<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  disabled,
  className,
  selectClassName,
}: SelectFieldProps<T>) {
  const sel = (
    <select
      className={clsx("w-full border border-line rounded-md px-2 py-1.5 text-xs bg-white disabled:opacity-50", selectClassName)}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  if (!label) return <div className={className}>{sel}</div>;
  return (
    <label className={clsx("block text-xs", className)}>
      <div className={clsx("mb-1 text-text-mute", disabled && "opacity-50")}>{label}</div>
      {sel}
      {hint && <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{hint}</div>}
    </label>
  );
}
