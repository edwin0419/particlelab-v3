"use client";

import { useEffect, useRef, useState } from "react";

import { API_BASE } from "@/lib/api";
import type { HybridResult, Metrics, MorphologySummary } from "./core";

export function HybridView({
  r, activeIdx, onPick, diagView, setDiagView, originalsMap,
  labelScale, setLabelScale, numberedSrc, numberedBusy,
}: {
  r: HybridResult;
  activeIdx: number;
  onPick: (i: number) => void;
  diagView: "original" | "overlay" | "instances" | "numbered" | "mask" | "prob" | "high" | "close" | "boundary" | "separator" | "color" | "hist";
  setDiagView: (v: "original" | "overlay" | "instances" | "numbered" | "mask" | "prob" | "high" | "close" | "boundary" | "separator" | "color" | "hist") => void;
  originalsMap: Record<string, string>;
  labelScale: number;
  setLabelScale: (n: number) => void;
  numberedSrc: string;
  numberedBusy: boolean;
}) {
  const it = r.results[activeIdx];
  if (!it) return null;
  const originalSrc = originalsMap[it.filename] ?? "";

  const diagOptions: [typeof diagView, string, string][] = [
    ["original", "원본", "입력 이미지"],
    ["overlay", "오버레이", "원본 + instance"],
    ["instances", "Instance", "입자별 색"],
    ["numbered", "번호", "1, 2 ... 라벨"],
    ["mask", "Mask", "semantic 이진"],
    ["prob", "U-Net prob", "확률맵"],
    ["high", "M_75 (anchor)", "확실한 입자"],
    ["close", "M_close (좁은 틈)", "거리 + Otsu"],
    ["boundary", "YOLO 경계", "분리선 후보"],
    ["separator", "최종 분리선", "M_close ∩ B"],
    ["color", "색 진단", "빨강=M_close, 파랑=B, 흰=둘 다(분리선)"],
    ["hist", "d₊ 히스토그램", "Otsu 임계 시각화 (논문 figure)"],
  ];
  const srcMap: Record<typeof diagView, string> = {
    original: originalSrc,
    overlay: it.overlay_png,
    instances: it.instances_png,
    numbered: numberedSrc || it.instances_png,
    mask: it.mask_png,
    prob: it.diag_prob_png,
    high: it.diag_high_png,
    close: it.diag_close_png,
    boundary: it.diag_boundary_png,
    separator: it.diag_separator_png,
    color: it.diag_overlap_png,
    hist: it.diag_hist_png ?? "",
  };

  return (
    <div className="space-y-3 min-w-0">
      <div className="app-card p-4 min-w-0">
        {/* 간결한 헤더 — 큰 숫자 위주 */}
        <div className="flex items-end justify-between gap-4 flex-wrap mb-3">
          <div className="flex items-end gap-5 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-fg-faint font-semibold">이미지</div>
              <div className="text-[20px] font-bold text-fg leading-none mt-0.5">
                {r.n_images}<span className="text-[12px] text-fg-faint font-medium ml-0.5">장</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-fg-faint font-semibold">총 입자</div>
              <div className="text-[20px] font-bold text-fg leading-none mt-0.5">
                {r.total_instances.toLocaleString()}<span className="text-[12px] text-fg-faint font-medium ml-0.5">개</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-fg-faint font-semibold">GT 매칭</div>
              <div className={"text-[20px] font-bold leading-none mt-0.5 " + (r.n_with_gt === 0 ? "text-fg-faint" : "text-fg")}>
                {r.n_with_gt}<span className="text-[12px] text-fg-faint font-medium ml-0.5">/{r.n_images}</span>
              </div>
            </div>
          </div>
        </div>

        {r.n_with_gt > 0 && r.n_with_gt < r.n_images && (
          <div className="text-[11px] text-warn bg-warn-soft border border-warn-line rounded-md px-3 py-2 mb-3">
            {r.n_images - r.n_with_gt}장이 GT 와 파일명 매칭 실패. 매칭된 {r.n_with_gt}장만 평가됨.
          </div>
        )}

        {/* 파일 selector */}
        {r.results.length > 1 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {r.results.map((x, i) => (
              <button
                key={i}
                onClick={() => onPick(i)}
                className={
                  "text-[11px] px-2.5 py-1 rounded-md border truncate max-w-[200px] " +
                  (i === activeIdx
                    ? "bg-fg text-white border-fg"
                    : "bg-white border-edge-strong text-fg-mute hover:border-fg hover:text-fg")
                }
                title={x.filename}
              >
                {x.filename}
              </button>
            ))}
          </div>
        )}

        {/* 뷰 selector */}
        <div className="flex flex-wrap gap-1 mb-3">
          {diagOptions.map(([id, label, sub]) => (
            <button
              key={id}
              onClick={() => setDiagView(id)}
              className={
                "text-[11px] px-2.5 py-1 rounded-md border " +
                (diagView === id
                  ? "bg-fg text-white border-fg"
                  : "bg-white border-edge-strong text-fg-mute hover:border-fg hover:text-fg")
              }
              title={sub}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="text-[11px] text-fg-mute mb-2 flex flex-wrap gap-x-4 gap-y-0.5">
          <span>입자 수 <b className="text-fg">{it.n_instances}</b></span>
          <span>YOLO instances <b className="text-fg">{it.n_yolo}</b></span>
          <span>U-Net anchor <b className="text-fg">{it.K_unet_anchor}</b></span>
          <span>τ (Otsu) <b className="text-fg">{it.tau.toFixed(2)}</b></span>
          {!!it.crop_bottom_px && (
            <span>하단 크롭 <b className="text-fg">{it.crop_bottom_px}px</b></span>
          )}
          {!!it.n_edge_removed && (
            <span>모서리 제거 <b className="text-fg">{it.n_edge_removed}</b>개</span>
          )}
        </div>

        {diagView === "numbered" && (it.particles?.length ?? 0) > 0 && (
          <div className="flex items-center gap-3 mb-2 px-3 py-2 rounded-md border border-edge bg-surface-soft text-[11.5px]">
            <span className="text-fg-mute font-medium flex-shrink-0">번호 크기</span>
            <input
              type="range"
              min={0.3} max={3.5} step={0.05}
              value={labelScale}
              onChange={(e) => setLabelScale(Number(e.target.value))}
              className="flex-1"
            />
            <span className="font-mono text-fg tabular-nums w-12 text-right text-[11px]">
              {labelScale.toFixed(2)}×
            </span>
            <button
              type="button"
              onClick={() => setLabelScale(1.0)}
              className="text-[10.5px] text-fg-faint hover:text-fg px-1.5 py-0.5 rounded hover:bg-white"
              title="기본값"
            >
              초기화
            </button>
            <span className={"text-[10px] text-fg-faint tabular-nums flex-shrink-0 " + (numberedBusy ? "" : "opacity-0")}>
              그리는 중...
            </span>
          </div>
        )}

        <ImageBox label={diagOptions.find(o => o[0] === diagView)?.[1] ?? ""} src={srcMap[diagView]} />

        {/* 다운로드는 우측 패널 (파라미터 아래) 로 이동 */}

        {/* 실행 파라미터 — 접혀있고 펼쳐서 볼 수 있음 */}
        <details className="mt-3 text-[10.5px] text-fg-faint group">
          <summary className="cursor-pointer select-none hover:text-fg-mute inline-flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-open:rotate-90 transition-transform">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            실행 파라미터 보기
          </summary>
          <code className="block mt-1.5 break-all bg-surface-soft border border-edge rounded px-2 py-1.5 font-mono text-[10px] leading-relaxed">
            {r.params}
          </code>
        </details>
        {r.excel_error && (
          <div className="mt-2 text-[11px] text-danger bg-danger-soft border border-danger-line rounded-md px-3 py-2">
            엑셀 생성 실패: {r.excel_error}
          </div>
        )}

        {/* d_+ 히스토그램 + CSV 다운로드 */}
        {(it.hist_csv || it.pixel_csv) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-gray-500">데이터 다운로드:</span>
            {it.hist_csv && (
              <a
                href={it.hist_csv}
                download={`${it.filename.replace(/\.[^.]+$/, "")}_d_histogram.csv`}
                className="px-2 py-1 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
              >
                📊 히스토그램 CSV (bin width=1, 엑셀 차트용)
              </a>
            )}
            {it.pixel_csv && (
              <a
                href={`${API_BASE}${it.pixel_csv}?save_as=${encodeURIComponent(`${it.filename.replace(/\.[^.]+$/, "")}_d_pixels.csv`)}`}
                className="px-2 py-1 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
              >
                📋 픽셀별 CSV (y, x, d₁, d₂, d₊, balance, in_M_close)
                {it.pixel_csv_rows ? ` — ${it.pixel_csv_rows.toLocaleString()} 행` : ""}
              </a>
            )}
          </div>
        )}

        {it.gt_png && (
          <div className="mt-2">
            <ImageBox label={`정답 (${it.gt_filename ?? ""})`} src={it.gt_png} />
          </div>
        )}
      </div>

      {it.morphology && (
        <MorphologyCard
          title={`형상 · 입도 지표 — ${it.filename}`}
          m={it.morphology}
        />
      )}
      {r.morphology_all && r.n_images > 1 && (
        <MorphologyCard title={`형상 · 입도 지표 — 전체 ${r.n_images}장`} m={r.morphology_all} />
      )}

      {/* 평가 지표 — 새 백엔드는 세 방법별, 옛 백엔드는 hybrid 단일 metrics 만 */}
      {(() => {
        const lowPct = Math.round(((r.low_thresh ?? 0.30) * 100));
        const unetLabel = `② U-Net ≥ ${lowPct}%`;
        return (
          <>
            {(it.metrics_yolo || it.metrics_unet_low || it.metrics_hybrid || it.metrics) ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-700">
                  이미지별 지표 — {it.filename}
                </div>
                {it.metrics_yolo && (
                  <MetricsCard m={it.metrics_yolo} title="① YOLO 만 (라운드/overlap 후처리 적용)" />
                )}
                {it.metrics_unet_low && (
                  <MetricsCard m={it.metrics_unet_low} title={unetLabel} />
                )}
                {(it.metrics_hybrid || it.metrics) && (
                  <MetricsCard
                    m={(it.metrics_hybrid ?? it.metrics)!}
                    title={it.metrics_yolo
                      ? "③ Hybrid (최종)"
                      : "Hybrid (최종) — 백엔드 재시작 시 ①②③ 비교 표시"}
                  />
                )}
              </div>
            ) : it.gt_filename ? (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠️ GT 매칭 완료 ({it.gt_filename}) 인데 평가 지표 누락 — 백엔드 재시작 필요할 수도.
              </div>
            ) : null}
            {(r.summary_yolo || r.summary_unet_low || r.summary_hybrid || r.summary) && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-700">
                  전체 평균 ({(r.summary_hybrid ?? r.summary ?? r.summary_yolo ?? r.summary_unet_low)?.n_with_gt ?? 0}장)
                </div>
                {r.summary_yolo && (
                  <MetricsCard m={r.summary_yolo as any} title="① YOLO 만 — 평균" />
                )}
                {r.summary_unet_low && (
                  <MetricsCard m={r.summary_unet_low as any} title={`${unetLabel} — 평균`} />
                )}
                {(r.summary_hybrid || r.summary) && (
                  <MetricsCard
                    m={(r.summary_hybrid ?? r.summary) as any}
                    title={r.summary_yolo ? "③ Hybrid — 평균" : "Hybrid — 평균"}
                  />
                )}
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}


export function MetricsCard({ m, title }: { m: Metrics; title: string }) {
  // 논문 2.3절 기준 7개 평가 지표
  // higher is better except ParticleCountError
  const ratings: { en: string; ko?: string; v: number; display: string; better: "high" | "low" }[] = [
    { en: "Precision", ko: "정밀도",   v: m.Precision, display: m.Precision.toFixed(4), better: "high" },
    { en: "Recall",    ko: "재현율",   v: m.Recall,    display: m.Recall.toFixed(4),    better: "high" },
    { en: "Accuracy",  ko: "정확도",   v: m.Accuracy,  display: m.Accuracy.toFixed(4),  better: "high" },
    { en: "IoU",       ko: undefined,  v: m.IoU,       display: m.IoU.toFixed(4),       better: "high" },
    { en: "F1 Score",  ko: undefined,  v: m.F1,        display: m.F1.toFixed(4),        better: "high" },
    { en: "mAP@0.5",   ko: undefined,  v: m["mAP@0.5"], display: m["mAP@0.5"].toFixed(4), better: "high" },
    { en: "Count Error", ko: "입자수오차", v: m.ParticleCountError,
      display: `${(m.ParticleCountError * 100).toFixed(2)}%`, better: "low" },
  ];
  // minimal coloring: only highlight extremes (good/bad), neutral otherwise
  const tier = (v: number, better: "high" | "low") => {
    if (!isFinite(v)) return { c: "#9ca3af", bg: "transparent" };
    if (better === "high") {
      if (v >= 0.85) return { c: "#009f50", bg: "transparent" };
      if (v >= 0.40) return { c: "#191919", bg: "transparent" };
      return { c: "#e8483c", bg: "transparent" };
    } else {
      if (v <= 0.05) return { c: "#009f50", bg: "transparent" };
      if (v <= 0.30) return { c: "#191919", bg: "transparent" };
      return { c: "#e8483c", bg: "transparent" };
    }
  };
  return (
    <div className="app-card p-3.5 space-y-2.5 min-w-0 fade-in">
      <h2 className="text-[13px] font-semibold truncate text-text">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
        {ratings.map((cell) => {
          const t = tier(cell.v, cell.better);
          return (
            <div
              key={cell.en}
              className="rounded-md px-2 py-1.5 min-w-0"
              style={{
                border: "1px solid var(--c-border)",
                background: t.bg,
              }}
            >
              <div
                className="text-[9px] uppercase tracking-wider truncate font-semibold"
                style={{ color: "#8d92a0" }}
                title={`${cell.en}${cell.ko ? " · " + cell.ko : ""}`}
              >
                {cell.en}
              </div>
              {cell.ko && (
                <div className="text-[9px] text-[#a8aebb] truncate">{cell.ko}</div>
              )}
              <div className="text-[14px] font-mono font-semibold truncate" style={{ color: t.c }}>
                {cell.display}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[10.5px] text-text-mute pt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span>GT 입자수 <b className="text-text">{m.n_gt_inst}</b></span>
        <span>Pred 입자수 <b className="text-text">{m.n_pred_inst}</b></span>
        <span className="text-[#a8aebb]">connected components 기준</span>
      </div>
    </div>
  );
}


export function MorphologyCard({ title, m }: { title: string; m: MorphologySummary }) {
  const u = m.unit;
  const num = (k: string, digits = 3) => {
    const v = m[k];
    return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "—";
  };
  const groups: [string, [string, string, string][]][] = [
    ["입도 분포 · Size distribution", [
      ["ECD 평균 · mean", num("ecd_mean"), u],
      ["D10", num("d10"), u],
      ["D50", num("d50"), u],
      ["D90", num("d90"), u],
      ...(typeof m.d50_ml === "number"
        ? [["D50 (모서리 보정)", num("d50_ml"), u] as [string, string, string]]
        : []),
      ["Span (D90−D10)/D50", num("span"), ""],
      ["Dv50 (부피 기준)", num("dv50"), u],
      ["최대 Feret · Max", num("feret_max_mean"), u],
      ["최소 Feret · Min", num("feret_min_mean"), u],
    ]],
    ["형상 (평균) · Shape (mean)", [
      ["원형도 · Circularity", num("circularity_mean"), ""],
      ["종횡비 · Aspect Ratio", num("aspect_ratio_mean"), ""],
      ["Solidity", num("solidity_mean"), ""],
      ["Convexity", num("convexity_mean"), ""],
      ["진원도 · Roundness", num("roundness_mean"), ""],
      ["이심률 · Eccentricity", num("eccentricity_mean"), ""],
      ["텍스처 엔트로피", num("texture_entropy_mean"), "bits"],
      ["프랙탈 차원", num("fractal_dim_mean"), ""],
    ]],
    ["분포 특성 · Distribution traits", [
      [`불규칙 비율 (원형도<${m.irregular_threshold ?? ""})`, num("irregular_fraction_pct", 1), "%"],
      ["크기–원형도 Spearman ρ", num("spearman_rho"), ""],
      ["Spearman p", num("spearman_p", 4), ""],
      ["이봉 계수 BC", num("bimodality_coefficient"), ""],
      ["Ashman D", num("ashman_d"), ""],
      ["ΔBIC (1−2성분)", num("delta_bic", 1), ""],
      ["이봉 판정", m.bimodal === undefined || m.bimodal === null ? "—" : m.bimodal ? "예 (Yes)" : "아니오 (No)", ""],
    ]],
  ];
  return (
    <div className="app-card p-4">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="text-xs font-semibold text-gray-700 truncate">{title}</div>
        <div className="text-[10.5px] text-fg-faint flex-shrink-0">
          입자 {m.n_particles}개 · 단위 {u}
          {!!m.n_edge_removed && ` · 모서리 제거 ${m.n_edge_removed}`}
        </div>
      </div>
      {u === "px" && (
        <div className="text-[10.5px] text-warn bg-warn-soft border border-warn-line rounded-md px-2.5 py-1.5 mb-2 leading-snug">
          스케일 미입력 — 길이 지표가 px 단위입니다. 왼쪽 &apos;전처리 · 스케일&apos;에 입력 후 다시 실행하거나, 엑셀 다운로드 때 입력하세요.
        </div>
      )}
      {m.n_particles === 0 ? (
        <div className="text-[11px] text-fg-faint">분석할 입자가 없습니다.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {groups.map(([gTitle, rows]) => (
            <div key={gTitle}>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-faint mb-1">{gTitle}</div>
              <table className="w-full text-[11px]">
                <tbody>
                  {rows.map(([label, val, unit]) => (
                    <tr key={label} className="border-b border-[#f4f4f1] last:border-0">
                      <td className="py-0.5 text-fg-mute pr-2">{label}</td>
                      <td className="py-0.5 text-right font-mono text-fg whitespace-nowrap">
                        {val}{val !== "—" && unit ? <span className="text-fg-faint ml-0.5">{unit}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
      <div className="text-[10px] text-fg-faint mt-2">
        입자별 값 · 크기구간별 형상 · 지표 정의(한/영)는 다운로드 → 지표 엑셀
      </div>
    </div>
  );
}


export function ImageBox({ label, src }: { label: string; src: string }) {
  // Zoom/pan + download interactive viewer
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState(false);
  // 이미지 자연 비율을 추적 — 컨테이너가 비율에 맞춰 줄어들면서 사진이 채움
  const [aspect, setAspect] = useState<number | null>(null);
  useEffect(() => { setAspect(null); setScale(1); setTx(0); setTy(0); }, [src]);

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const MIN = 1, MAX = 8;

  const reset = () => { setScale(1); setTx(0); setTy(0); };

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    const nextScale = clamp(scale * factor, MIN, MAX);
    if (nextScale === scale) return;
    const ratio = nextScale / scale;
    setTx((cx - (cx - tx) * ratio));
    setTy((cy - (cy - ty) * ratio));
    setScale(nextScale);
  }

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (scale <= 1) return;
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, tx, ty };
  }
  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragging || !dragStart.current) return;
    setTx(dragStart.current.tx + (e.clientX - dragStart.current.x));
    setTy(dragStart.current.ty + (e.clientY - dragStart.current.y));
  }
  function endDrag() { setDragging(false); dragStart.current = null; }

  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (scale > 1) { reset(); return; }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    const nextScale = 2.5;
    setScale(nextScale);
    setTx(-cx * (nextScale - 1));
    setTy(-cy * (nextScale - 1));
  }

  const downloadName = (() => {
    const safe = label.replace(/[^\w가-힣.-]+/g, "_").slice(0, 60) || "image";
    return `${safe}.png`;
  })();

  // ESC to close lightbox, lock body scroll while open
  useEffect(() => {
    if (!lightbox) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [lightbox]);

  const ViewerBody = ({ inLightbox = false }: { inLightbox?: boolean }) => (
    <div
      ref={inLightbox ? undefined : containerRef}
      className={
        "rounded-lg overflow-hidden flex items-center justify-center relative select-none w-full " +
        (inLightbox ? "h-full" : "")
      }
      style={{
        background:
          "repeating-conic-gradient(#161616 0% 25%, #1f1f1f 0% 50%) 50% / 16px 16px, #0e0e0e",
        border: inLightbox ? "none" : "1px solid #e6e6df",
        boxShadow: inLightbox ? "none" : "inset 0 0 0 1px rgba(255,255,255,0.02), 0 1px 0 rgba(20,22,27,0.03)",
        cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
        // 컨테이너가 이미지 비율을 따라가도록 → 첫 화면부터 사진이 미리보기 영역을 채움.
        // 비율 정해지기 전엔 안전한 최소 높이 확보.
        aspectRatio: !inLightbox && aspect ? String(aspect) : undefined,
        maxHeight: inLightbox ? undefined : "78vh",
        minHeight: inLightbox ? undefined : (aspect ? undefined : 420),
      }}
      onWheel={inLightbox ? undefined : onWheel}
      onMouseDown={inLightbox ? undefined : onMouseDown}
      onMouseMove={inLightbox ? undefined : onMouseMove}
      onMouseUp={inLightbox ? undefined : endDrag}
      onMouseLeave={inLightbox ? undefined : endDrag}
      onDoubleClick={inLightbox ? undefined : onDoubleClick}
    >
      <img
        src={src}
        alt={label}
        draggable={false}
        onLoad={(e) => {
          const t = e.currentTarget;
          if (t.naturalWidth > 0 && t.naturalHeight > 0) {
            setAspect(t.naturalWidth / t.naturalHeight);
          }
        }}
        className="w-full h-full object-contain transition-transform"
        style={{
          transform: inLightbox ? "none" : `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: "center center",
          transition: dragging ? "none" : "transform 0.08s ease-out",
        }}
      />
    </div>
  );

  return (
    <>
      <div className="min-w-0 group">
        <div className="text-[11px] text-text-mute mb-1 flex items-center justify-between gap-2">
          <span className="truncate font-medium">{label}</span>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[10px] font-mono text-text-faint tabular-nums w-10 text-right">
              {(scale * 100).toFixed(0)}%
            </span>
            <ToolbarBtn title="축소" onClick={() => setScale(s => clamp(s / 1.3, MIN, MAX))}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </ToolbarBtn>
            <ToolbarBtn title="확대" onClick={() => setScale(s => clamp(s * 1.3, MIN, MAX))}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </ToolbarBtn>
            <ToolbarBtn title="원본 크기로 되돌리기" onClick={reset}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            </ToolbarBtn>
            <ToolbarBtn title="크게 보기" onClick={() => setLightbox(true)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            </ToolbarBtn>
            <a
              href={src}
              download={downloadName}
              title="이미지 저장"
              onClick={(e) => e.stopPropagation()}
              className="w-6 h-6 inline-flex items-center justify-center rounded-md border border-line bg-white hover:border-ink hover:text-ink text-text-mute"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </a>
          </div>
        </div>
        <ViewerBody />
        {scale > 1 && (
          <div className="text-[9px] text-text-faint mt-0.5 text-right">
            드래그로 이동 · 휠로 줌 · 더블클릭으로 리셋
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col fade-in"
          onClick={() => setLightbox(false)}
        >
          <div className="flex items-center justify-between px-4 py-2 text-white">
            <div className="text-sm font-semibold truncate">{label}</div>
            <div className="flex items-center gap-2">
              <a
                href={src}
                download={downloadName}
                onClick={(e) => e.stopPropagation()}
                className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-xs font-semibold border border-white/20"
              >
                📥 저장
              </a>
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox(false); }}
                className="w-8 h-8 rounded-md bg-white/10 hover:bg-white/20 border border-white/20 text-base"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
          </div>
          <div
            className="flex-1 min-h-0 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <ViewerBody inLightbox />
          </div>
          <div className="text-center text-[11px] text-white/60 py-2">
            배경 클릭 / ESC 로 닫기
          </div>
        </div>
      )}
    </>
  );
}


export function ToolbarBtn({
  onClick, title, children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="w-6 h-6 inline-flex items-center justify-center rounded-md border border-line bg-white text-text-mute hover:border-ink hover:text-ink"
    >
      {children}
    </button>
  );
}
