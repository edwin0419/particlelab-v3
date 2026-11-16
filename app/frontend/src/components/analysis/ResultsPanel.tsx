"use client";

// 전체 분석 결과 — 다운로드 · 샘플 요약 · 결과 이미지 갤러리 · 경고.

import { useMemo, useState } from "react";
import { Copy, FileSpreadsheet, Package, Presentation } from "lucide-react";

import { EXCEL_NAME, PPTX_NAME, buildGallery, summaryColumns } from "@/components/batch/parts";
import DataTable from "@/components/ui/DataTable";
import { Lightbox } from "@/components/ui/ImageViewer";
import { basename, jobFileUrl, jobZipUrl } from "@/lib/api";
import type { BatchResult, SummaryRow } from "@/lib/types";

import { PILL } from "./parts";

export default function ResultsPanel({ batch, jobId }: { batch: BatchResult; jobId: string }) {
  const [copied, setCopied] = useState(false);
  const [gallerySel, setGallerySel] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const gallery = useMemo(() => buildGallery(batch), [batch]);
  const activeCat = gallery.find((g) => g.id === gallerySel) ?? gallery[0];
  const summaryCols = useMemo(() => summaryColumns((batch.samples ?? []) as SummaryRow[]), [batch]);
  const excelRel = batch.excel_path ? basename(batch.excel_path) || EXCEL_NAME : EXCEL_NAME;
  const pptxRel = batch.pptx_path ? basename(batch.pptx_path) || PPTX_NAME : null;

  const copyOutput = async () => {
    const dir = batch.output_dir;
    if (!dir) return;
    try {
      await navigator.clipboard.writeText(dir);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("출력 폴더 경로", dir);
    }
  };

  return (
    <>
      <div className="app-card p-4">
        <h2 className="text-[13px] font-semibold text-fg mb-2">다운로드</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <a href={jobFileUrl(jobId, excelRel)} className="btn-primary h-8 px-3 text-[12px] inline-flex items-center gap-1.5" download>
            <FileSpreadsheet size={13} /> Excel
          </a>
          {pptxRel ? (
            <a href={jobFileUrl(jobId, pptxRel)} className={PILL(false) + " h-8 inline-flex items-center gap-1.5"} download>
              <Presentation size={13} /> PPT
            </a>
          ) : null}
          <a href={jobZipUrl(jobId)} className={PILL(false) + " h-8 inline-flex items-center gap-1.5"} download>
            <Package size={13} /> 전체 zip
          </a>
          <button type="button" className={PILL(false) + " h-8 inline-flex items-center gap-1.5"} onClick={copyOutput}>
            <Copy size={13} /> {copied ? "복사됨" : "출력 폴더 경로 복사"}
          </button>
        </div>
        <code className="block mt-2 break-all bg-surface-soft border border-edge rounded px-2 py-1.5 font-mono text-[10px] text-fg-faint">{batch.output_dir}</code>
      </div>

      <div className="app-card p-4">
        <h2 className="text-[13px] font-semibold text-fg mb-2">
          샘플 요약 <span className="text-[11px] text-fg-faint font-medium">({batch.samples?.length ?? 0})</span>
        </h2>
        <DataTable<SummaryRow>
          rows={batch.samples ?? []}
          columns={summaryCols}
          rowKey={(r, i) => `${String(r[summaryCols[0]?.key ?? ""] ?? "")}-${i}`}
          maxHeight={260}
          dense
          emptyText="요약 행이 없습니다"
        />
      </div>

      <div className="app-card p-4">
        <h2 className="text-[13px] font-semibold text-fg mb-2">결과 이미지</h2>
        <div className="flex flex-wrap gap-1 mb-3">
          {gallery.map((g) => (
            <button key={g.id} type="button" className={PILL(activeCat?.id === g.id)} onClick={() => setGallerySel(g.id)}>
              {g.label} <span className="font-mono text-[9px] opacity-70">{g.items.length}</span>
            </button>
          ))}
        </div>
        {activeCat && (
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
            {activeCat.items.map((it, i) => (
              <button key={it.relpath} type="button" className="group text-left flex flex-col gap-1" onClick={() => setLightboxIdx(i)} title={it.label}>
                <div className="aspect-[4/3] w-full rounded-md overflow-hidden border border-edge-strong bg-black/90 group-hover:border-fg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={jobFileUrl(jobId, it.relpath)} alt={it.label} loading="lazy" className="w-full h-full object-contain" />
                </div>
                <div className="text-[10px] text-fg-mute truncate">{it.label}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {batch.warnings?.length > 0 && (
        <div className="text-[11px] text-warn bg-warn-soft border border-warn-line rounded-md px-3 py-2">
          <div className="font-semibold mb-1">경고 ({batch.warnings.length})</div>
          <ul className="space-y-0.5 max-h-40 overflow-y-auto">
            {batch.warnings.map((w, i) => (
              <li key={i} className="whitespace-pre-wrap break-words">
                · {w}
              </li>
            ))}
          </ul>
        </div>
      )}

    {activeCat && lightboxIdx !== null && (
      <Lightbox
        src={jobFileUrl(jobId, activeCat.items[lightboxIdx].relpath)}
        label={activeCat.items[lightboxIdx].label}
        counter={`${lightboxIdx + 1} / ${activeCat.items.length}`}
        onClose={() => setLightboxIdx(null)}
        onPrev={lightboxIdx > 0 ? () => setLightboxIdx(lightboxIdx - 1) : undefined}
        onNext={lightboxIdx < activeCat.items.length - 1 ? () => setLightboxIdx(lightboxIdx + 1) : undefined}
      />
    )}
    </>
  );
}
