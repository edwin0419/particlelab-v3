"use client";

// 미리보기 결과의 입도(D10 · D50 · D90 …)와 입자 표. 필터 전/후 전환.

import { useState } from "react";

import DataTable, { type DataTableColumn } from "@/components/ui/DataTable";
import { TERMS as T } from "@/lib/terms";
import type { ParticleRow, TunerSegmentResponse } from "@/lib/types";

import { DStat, PILL } from "./parts";

const PARTICLE_COLS: DataTableColumn<ParticleRow>[] = [
  { key: "Label", label: "번호", align: "right", width: 56 },
  { key: "Diameter (μm)", label: "직경 (μm)", align: "right", decimals: 3 },
  { key: "Circularity", label: "원형도", align: "right", decimals: 3 },
  { key: "Aspect Ratio", label: "종횡비", align: "right", decimals: 3 },
  { key: "Area (μm^2)", label: "면적 (μm²)", align: "right", decimals: 3 },
  { key: "Solidity", label: "Solidity", align: "right", decimals: 3 },
  { key: "Mean Intensity", label: "평균 밝기", align: "right", decimals: 1 },
  { key: "x", label: "x", align: "right", decimals: 1 },
  { key: "y", label: "y", align: "right", decimals: 1 },
];

export default function ParticleTableCard({ result }: { result: TunerSegmentResponse | null }) {
  const [tableSide, setTableSide] = useState<"before" | "after">("after");
  const dBefore = result?.d_values_before;
  const dAfter = result?.d_values_after;
  const rows = tableSide === "after" ? result?.particles_after ?? [] : result?.particles_before ?? [];
  return (
    <div className="app-card p-4 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div>
          <h2 className="text-[13px] font-semibold text-fg">입도 · 입자 표</h2>
          <p className="text-[10.5px] text-fg-faint leading-snug mt-0.5">
            큰 숫자 = {T.after.label}, 작은 숫자 = {T.before.label}
          </p>
        </div>
        <div className="flex gap-1">
          <button type="button" className={PILL(tableSide === "after")} onClick={() => setTableSide("after")}>
            {T.after.label} {result ? `(${result.particles_after.length})` : ""}
          </button>
          <button type="button" className={PILL(tableSide === "before")} onClick={() => setTableSide("before")}>
            {T.before.label} {result ? `(${result.particles_before.length})` : ""}
          </button>
        </div>
      </div>
      <div className="flex items-stretch flex-wrap border border-edge rounded-md mb-2">
        <DStat label="D10 (μm)" before={dBefore?.d10} after={dAfter?.d10} />
        <DStat label="D50 (μm)" before={dBefore?.d50} after={dAfter?.d50} />
        <DStat label="D90 (μm)" before={dBefore?.d90} after={dAfter?.d90} />
        <DStat label="Span" before={dBefore?.span} after={dAfter?.span} />
        <DStat label="평균 (μm)" before={dBefore?.mean} after={dAfter?.mean} />
        <DStat label="CV" before={dBefore?.cv} after={dAfter?.cv} />
      </div>
      <DataTable<ParticleRow>
        rows={rows}
        columns={PARTICLE_COLS}
        rowKey={(r, i) => `${r.Label}-${i}`}
        maxRows={500}
        maxHeight={220}
        dense
        emptyText={result ? "입자가 없습니다" : "미리보기 후 입자 목록이 표시됩니다"}
        defaultSort={{ key: "Diameter (μm)", dir: "desc" }}
      />
    </div>
  );
}
