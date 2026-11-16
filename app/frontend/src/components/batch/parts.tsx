"use client";

// 배치 결과 표시용 부품 (갤러리 · Summary 표 · 폴더 탐색 · 상태 표시). 통합 분석 화면에서 사용.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, FolderOpen, FolderSearch, HardDrive, Loader2, X } from "lucide-react";

import type { BatchResult, FsList, SummaryRow } from "@/lib/types";
import { basename, fsDrives, fsList } from "@/lib/api";
import Chip from "@/components/ui/Chip";
import { type DataTableColumn } from "@/components/ui/DataTable";

export const POLL_MS = 700;
export const EXCEL_NAME = "particle_analysis_result.xlsx";
export const PPTX_NAME = "particle_analysis_result.pptx";

// ───────────────────────── 갤러리 카테고리 ─────────────────────────

export interface GalleryItem {
  relpath: string;
  label: string;
}

const CATEGORY_DEFS: { id: string; label: string; imageKeys?: string[]; sampleKeys?: string[]; extraKeys?: string[] }[] = [
  { id: "labeled_before", label: "라벨 Before", imageKeys: ["labeled_before"] },
  { id: "labeled_after", label: "라벨 After", imageKeys: ["labeled_after"] },
  { id: "comparison", label: "비교", imageKeys: ["comparison"] },
  { id: "contour", label: "윤곽선", imageKeys: ["contour_before", "contour_after"] },
  { id: "hist", label: "히스토그램", sampleKeys: ["hist_diameter", "hist_circularity", "hist_aspect"] },
  { id: "summary", label: "요약카드", sampleKeys: ["summary_before", "summary_after"] },
  { id: "boundary", label: "경계", imageKeys: ["boundary_before", "boundary_after"] },
  { id: "aggl", label: "응집도", imageKeys: ["aggl_before", "aggl_after"] },
  { id: "dbscan", label: "DBSCAN", imageKeys: ["dbscan_before", "dbscan_after"] },
  { id: "normal_dist", label: "정규분포", extraKeys: ["normal_dist"] },
];

export function buildGallery(r: BatchResult): { id: string; label: string; items: GalleryItem[] }[] {
  const out: { id: string; label: string; items: GalleryItem[] }[] = [];
  const usedImageKeys = new Set<string>();
  const usedSampleKeys = new Set<string>();
  const usedExtraKeys = new Set<string>();

  for (const def of CATEGORY_DEFS) {
    const items: GalleryItem[] = [];
    for (const k of def.imageKeys ?? []) {
      usedImageKeys.add(k);
      for (const im of r.images ?? []) {
        const rel = im.files?.[k];
        if (rel) items.push({ relpath: rel, label: `${im.filename} · ${k}` });
      }
    }
    for (const k of def.sampleKeys ?? []) {
      usedSampleKeys.add(k);
      for (const [sample, files] of Object.entries(r.sample_files ?? {})) {
        const rel = files?.[k];
        if (rel) items.push({ relpath: rel, label: `${sample} · ${k}` });
      }
    }
    for (const k of def.extraKeys ?? []) {
      usedExtraKeys.add(k);
      for (const rel of r.extra_files?.[k] ?? []) items.push({ relpath: rel, label: `${k} · ${basename(rel)}` });
    }
    if (items.length) out.push({ id: def.id, label: def.label, items });
  }

  // 정의되지 않은 키는 그대로 탭으로
  const extraImageKeys = new Set<string>();
  for (const im of r.images ?? []) for (const k of Object.keys(im.files ?? {})) if (!usedImageKeys.has(k)) extraImageKeys.add(k);
  for (const k of extraImageKeys) {
    const items = (r.images ?? []).flatMap((im) => (im.files?.[k] ? [{ relpath: im.files[k], label: `${im.filename} · ${k}` }] : []));
    if (items.length) out.push({ id: `img:${k}`, label: k, items });
  }
  const extraSampleKeys = new Set<string>();
  for (const files of Object.values(r.sample_files ?? {})) for (const k of Object.keys(files ?? {})) if (!usedSampleKeys.has(k)) extraSampleKeys.add(k);
  for (const k of extraSampleKeys) {
    const items = Object.entries(r.sample_files ?? {}).flatMap(([s, files]) => (files?.[k] ? [{ relpath: files[k], label: `${s} · ${k}` }] : []));
    if (items.length) out.push({ id: `smp:${k}`, label: k, items });
  }
  for (const [k, rels] of Object.entries(r.extra_files ?? {})) {
    if (usedExtraKeys.has(k) || !rels?.length) continue;
    out.push({ id: `ext:${k}`, label: k, items: rels.map((rel) => ({ relpath: rel, label: `${k} · ${basename(rel)}` })) });
  }
  return out;
}

// ───────────────────────── Summary 표 ─────────────────────────

// 백엔드 Summary 시트 컬럼: Sample, Total_Particles_{Before,After}, D10/D50/D90/Span/Mean/Std/Mode/CV_{Before,After}
const PREFERRED_SUMMARY_COLS: Array<[string, string]> = [
  ["Sample", "샘플"],
  ["Total_Particles_Before", "입자수 (Before)"],
  ["Total_Particles_After", "입자수 (After)"],
  ["D10_After", "D10"],
  ["D50_After", "D50"],
  ["D90_After", "D90"],
  ["Span_After", "Span"],
  ["Mean_After", "Mean"],
  ["Std_After", "Std"],
  ["CV_After", "CV (%)"],
];

export function summaryColumns(rows: SummaryRow[]): DataTableColumn<SummaryRow>[] {
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]);
  const lower = new Map(keys.map((k) => [k.toLowerCase().replace(/[\s_()%]/g, ""), k]));
  const picked: Array<[string, string]> = [];
  for (const [want, label] of PREFERRED_SUMMARY_COLS) {
    const k = lower.get(want.toLowerCase().replace(/[\s_()%]/g, ""));
    if (k && !picked.some(([pk]) => pk === k)) picked.push([k, label]);
  }
  // 선호 컬럼이 거의 없으면 전체 표시
  const cols: Array<[string, string]> = picked.length >= 3 ? picked : keys.map((k) => [k, k]);
  return cols.map(([k, label]) => ({
    key: k,
    label,
    align: typeof rows[0][k] === "number" ? "right" : "left",
    render: (v) => {
      if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
      if (v === null || v === undefined || v === "") return <span className="text-text-faint">–</span>;
      return String(v);
    },
  }));
}

// ───────────────────────── 폴더 탐색 모달 ─────────────────────────

export function FolderBrowser({ initial, onSelect, onClose }: { initial: string; onSelect: (path: string) => void; onClose: () => void }) {
  const [drives, setDrives] = useState<string[]>([]);
  const [listing, setListing] = useState<FsList | null>(null);
  const [path, setPath] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (p: string) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fsList(p);
      setListing(r);
      setPath(r.path);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    fsDrives()
      .then((d) => {
        setDrives(d);
        load(initial || d[0] || "");
      })
      .catch((e) => {
        setErr((e as Error).message);
        if (initial) load(initial);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4 fade-in" onClick={onClose}>
      <div className="app-card w-full max-w-[720px] max-h-[80vh] flex flex-col shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
          <div className="text-[13px] font-semibold flex items-center gap-2">
            <FolderSearch size={15} /> 서버 폴더 탐색
          </div>
          <button type="button" className="w-7 h-7 rounded-md hover:bg-bg3 inline-flex items-center justify-center text-text-mute" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="px-4 py-2 flex items-center gap-2 border-b border-line-soft">
          {drives.map((d) => (
            <Chip key={d} active={listing?.path?.toLowerCase().startsWith(d.toLowerCase())} onClick={() => load(d)}>
              <HardDrive size={11} /> {d}
            </Chip>
          ))}
          <div className="flex-1 flex items-center gap-1">
            <input
              type="text"
              className="h-7 flex-1 rounded-md border px-2 text-[11px] font-mono"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load(path)}
            />
            <button type="button" className="h-7 px-2 rounded-md border border-line text-[11px] hover:border-line-strong" onClick={() => load(path)}>
              이동
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 grid grid-cols-[1fr_220px]">
          <div className="overflow-y-auto border-r border-line-soft">
            {listing?.parent && (
              <button type="button" className="w-full text-left px-4 py-1.5 text-[12px] hover:bg-bg2 flex items-center gap-2 toss-row" onClick={() => load(listing.parent as string)}>
                <ChevronLeft size={13} className="text-text-faint" /> ..
              </button>
            )}
            {busy && (
              <div className="px-4 py-3 text-[11px] text-text-faint flex items-center gap-2">
                <Loader2 size={12} className="animate-spin" /> 불러오는 중…
              </div>
            )}
            {!busy && listing?.dirs.length === 0 && <div className="px-4 py-3 text-[11px] text-text-faint">하위 폴더 없음</div>}
            {!busy &&
              listing?.dirs.map((d) => (
                <button key={d.path} type="button" className="w-full text-left px-4 py-1.5 text-[12px] hover:bg-bg2 flex items-center gap-2 toss-row" onClick={() => load(d.path)} onDoubleClick={() => onSelect(d.path)}>
                  <FolderOpen size={13} className="text-amber flex-shrink-0" />
                  <span className="truncate">{d.name}</span>
                </button>
              ))}
            {err && <div className="px-4 py-2 text-[11px] text-bad">{err}</div>}
          </div>
          <div className="overflow-y-auto p-3 text-[11px]">
            <div className="text-text-mute mb-1">
              이미지 <span className="font-semibold text-text font-mono">{listing?.n_images ?? 0}</span>장
            </div>
            <ul className="space-y-0.5 text-[10px] font-mono text-text-faint">
              {(listing?.images ?? []).map((n) => (
                <li key={n} className="truncate" title={n}>
                  {n}
                </li>
              ))}
              {listing && listing.n_images > listing.images.length && <li>… 외 {listing.n_images - listing.images.length}장</li>}
            </ul>
          </div>
        </div>
        <div className="px-4 py-2.5 border-t border-line flex items-center justify-between gap-2">
          <div className="text-[10px] text-text-faint font-mono truncate">{listing?.path}</div>
          <div className="flex gap-2">
            <button type="button" className="h-8 px-3 rounded-md border border-line text-[12px] hover:border-line-strong" onClick={onClose}>
              취소
            </button>
            <button type="button" className="btn-primary h-8 px-3 text-[12px]" disabled={!listing} onClick={() => listing && onSelect(listing.path)}>
              이 폴더 선택 {listing ? `(${listing.n_images}장)` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ───────────────────────── 페이지 ─────────────────────────

export function statusTone(s: string): "good" | "bad" | "ink" | "mute" | "amber" {
  switch (s) {
    case "done":
      return "good";
    case "error":
      return "bad";
    case "running":
      return "ink";
    case "cancelled":
      return "amber";
    default:
      return "mute";
  }
}
export const STATUS_KO: Record<string, string> = { queued: "대기", running: "실행 중", done: "완료", error: "오류", cancelled: "취소됨" };

export function fmtTime(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "";
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("ko-KR", { hour12: false });
}

