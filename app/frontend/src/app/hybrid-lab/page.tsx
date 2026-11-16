"use client";

// 입자 분석 — Lab. 단순 한글 한 페이지 UI.
// Hybrid (U-Net + YOLO) 추론 전용 — /api/run/hybrid 와 연결, GT 있으면 평가 지표.

import { useEffect, useState } from "react";

import { API_BASE } from "@/lib/api";
import { saveParams, useAnalysisParams } from "@/lib/params";
import { takeHandoffImages } from "@/lib/handoff";
import { TERMS as T } from "@/lib/terms";
import { useRightPanelWidth } from "@/lib/useRightPanelWidth";
import ParamsPanel from "@/components/params/ParamsPanel";
import { MultiFileDropzone, SingleFileDropzone } from "@/components/hybrid/dropzones";
import { HybridView } from "@/components/hybrid/HybridView";
import { HybridDownloadBar } from "@/components/hybrid/HybridDownloadBar";
import { InferenceProgressCard, RunButton } from "@/components/hybrid/parts";
import { renderNumberedImage } from "@/components/hybrid/core";
import type { HybridResult } from "@/components/hybrid/core";
import { useRouter } from "next/navigation";

export default function Page() {
  // 오른쪽 설정 패널 폭 (분석 화면과 공유, 손잡이로 조절)
  const { rightW, startResize } = useRightPanelWidth();

  // ── 튜너·배치와 설정 공유 (localStorage plab.params) ──
  const { params: shared, setParams: setShared } = useAnalysisParams();
  useEffect(() => {
    const f = takeHandoffImages();
    if (f) setHybridImages(f);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const router = useRouter();
  const goBatchWithAi = () => {
    const next = { ...shared, engine: "ai_hybrid" as const };
    saveParams(next);
    setShared(next);
    router.push("/");
  };

  // Hybrid 모드 (U-Net + YOLO fusion)
  const [hybridImages, setHybridImages] = useState<File[]>([]);
  const [hybridGts, setHybridGts] = useState<File[]>([]);
  // 분석 화면에서 지정한 서버 가중치 경로 ("basic" 이면 기본 모델)
  const pathOf = (v: string) => (v && v.trim().toLowerCase() !== "basic" ? v.trim() : "");
  const sharedUnetPath = pathOf(shared.hybrid.unet_weights);
  const sharedYoloPath = pathOf(shared.hybrid.yolo_weights);
  const [hybridUnetWeights, setHybridUnetWeights] = useState<File | null>(null);
  const [hybridYoloWeights, setHybridYoloWeights] = useState<File | null>(null);
  const [hybridRes, setHybridRes] = useState<HybridResult | null>(null);
  const [hybridActiveIdx, setHybridActiveIdx] = useState(0);
  const [hybridDiagView, setHybridDiagView] = useState<"original" | "overlay" | "instances" | "numbered" | "mask" | "prob" | "high" | "close" | "boundary" | "separator" | "color" | "hist">("overlay");
  const [hybridLabelScale, setHybridLabelScale] = useState<number>(1.0);
  // 번호 모드 클라이언트 렌더링 — Page 레벨에서 캐시 (HybridView, 다운로드 패널 모두 공유)
  const [hybridNumberedSrc, setHybridNumberedSrc] = useState<string>("");
  const [hybridNumberedBusy, setHybridNumberedBusy] = useState(false);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 추론 진행 추정 (서버측 잡 progress 가 없는 단일 POST endpoint 용) ──
  const [inferStartMs, setInferStartMs] = useState<number | null>(null);
  const [inferTick, setInferTick] = useState(0);
  const [inferTotal, setInferTotal] = useState<number>(0);
  const [inferLabel, setInferLabel] = useState<string>("");
  useEffect(() => {
    if (inferStartMs === null) return;
    const id = window.setInterval(() => setInferTick(t => t + 1), 300);
    return () => window.clearInterval(id);
  }, [inferStartMs]);

  // ── Hybrid 번호 모드 클라이언트 렌더링 ──
  // active item / labelScale 변경 시 짧은 디바운스 후 재렌더링.
  useEffect(() => {
    const res = hybridRes;
    if (!res) { setHybridNumberedSrc(""); return; }
    const it = res.results[Math.min(hybridActiveIdx, res.results.length - 1)];
    if (!it || !it.instances_png || !(it.particles && it.particles.length > 0)) {
      setHybridNumberedSrc("");
      return;
    }
    let cancelled = false;
    setHybridNumberedBusy(true);
    const id = window.setTimeout(async () => {
      const url = await renderNumberedImage(it.instances_png, it.particles ?? [], hybridLabelScale);
      if (!cancelled) {
        setHybridNumberedSrc(url ?? "");
        setHybridNumberedBusy(false);
      }
    }, 40);
    return () => { cancelled = true; window.clearTimeout(id); setHybridNumberedBusy(false); };
  }, [hybridRes, hybridActiveIdx, hybridLabelScale]);

  // ── Hybrid 원본 이미지 (드롭존에서 받은 File → blob URL) ──
  const [hybridOriginals, setHybridOriginals] = useState<Record<string, string>>({});
  useEffect(() => {
    const m: Record<string, string> = {};
    hybridImages.forEach(f => {
      try { m[f.name] = URL.createObjectURL(f); } catch { /* ignore */ }
    });
    setHybridOriginals(m);
    return () => {
      Object.values(m).forEach(u => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } });
    };
  }, [hybridImages]);

  async function run() {
    setError(null);
    setRunning(true);
    setHybridRes(null);
    // 추론 진행 추정 시작 — 이미지 수 + 라벨
    setInferTotal(hybridImages.length);
    setInferLabel("Hybrid 추론");
    setInferStartMs(Date.now());
    setInferTick(0);
    try {
      const fd = new FormData();
      if (hybridImages.length === 0) throw new Error("이미지를 1장 이상 추가해주세요.");
      const url = `${API_BASE}/api/run/hybrid`;
      // 모델: 여기서 올린 파일 > 분석 화면에서 지정한 서버 경로 > 기본 모델
      if (hybridUnetWeights) fd.append("unet_weights", hybridUnetWeights);
      else if (sharedUnetPath) fd.append("unet_weights_path", sharedUnetPath);
      if (hybridYoloWeights) fd.append("yolo_weights", hybridYoloWeights);
      else if (sharedYoloPath) fd.append("yolo_weights_path", sharedYoloPath);
      for (const f of hybridImages) fd.append("images", f);
      for (const f of hybridGts) fd.append("gts", f);
      const h = shared.hybrid;
      fd.append("high_thresh", String(h.high_thresh));
      fd.append("low_thresh", String(h.low_thresh));
      fd.append("boundary_thickness", String(h.boundary_thickness));
      fd.append("min_anchor_area", String(h.min_anchor_area));
      fd.append("balance_floor", String(h.balance_floor));
      fd.append("tau_scale", String(h.tau_scale));
      fd.append("yolo_conf", String(h.yolo_conf));
      fd.append("yolo_iou", String(h.yolo_iou));
      fd.append("yolo_imgsz", String(h.yolo_imgsz));
      fd.append("yolo_round_strength", String(h.yolo_round_strength));
      fd.append("yolo_remove_overlaps", String(h.yolo_remove_overlaps));
      fd.append("yolo_remove_enclosed", String(h.yolo_remove_enclosed));
      fd.append("enclosed_ratio", String(h.enclosed_ratio));
      if (h.unet_imgsz) fd.append("unet_imgsz", String(h.unet_imgsz));
      fd.append("device", String(h.device || "auto"));
      fd.append("crop_bottom_mode", shared.sem.bottom_crop_mode);
      fd.append("crop_bottom_px", String(shared.sem.bottom_crop_px));
      fd.append("crop_bottom_ratio", String(shared.sem.bottom_crop_ratio));
      fd.append("remove_edge_particles", String(shared.measure.filter_border_particles));
      // 스케일: 분석 화면과 같은 방식으로 해석 (파일명 배율 모드는 이미지마다 달라 AI 진단에서는 px 단위)
      const sc = shared.scale;
      if (sc.mode === "scalebar" && sc.scale_bar_px > 0 && sc.scale_bar_um > 0) {
        fd.append("scale_bar_px", String(sc.scale_bar_px));
        fd.append("scale_bar_um", String(sc.scale_bar_um));
      } else if (sc.mode === "manual" && sc.pixel_to_micro > 0) {
        fd.append("scale_bar_px", "1");
        fd.append("scale_bar_um", String(sc.pixel_to_micro));
      }
      fd.append("irregular_circularity", String(shared.output.irregular_circularity));

      const r = await fetch(url, { method: "POST", body: fd });
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
      const json = await r.json();
      setHybridRes(json); setHybridActiveIdx(0); setRunning(false);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setRunning(false);
    } finally {
      setInferStartMs(null);
    }
  }

  const canRun = !running && hybridImages.length > 0;

  return (
    <div className="min-h-screen text-text font-sans overflow-x-hidden">
      <div className="w-full px-4 lg:px-6 pt-3 flex items-center gap-2 text-[11px] text-text-mute">
        <span className="font-semibold text-text text-[12px] whitespace-nowrap flex-shrink-0">AI 진단</span>
        <span className="truncate">정답 마스크와 비교해 AI 분할을 평가 · 형상 지표 확인. 모델과 설정은 분석 화면과 공유됩니다.</span>
        <button type="button" className="btn-primary ml-auto h-7 px-3 text-[11px] inline-flex items-center gap-1 flex-shrink-0" onClick={goBatchWithAi}>
          이 설정으로 분석 화면 열기 →
        </button>
      </div>

      <div
        className="w-full px-4 lg:px-6 py-4 lg:py-5 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_var(--right-w)] gap-4 lg:gap-5"
        style={{ ["--right-w" as any]: `${rightW}px` }}
      >
        {/* ── 좌측 ── */}
        <section className="space-y-3 min-w-0">
          {/* v2: mode selector 제거 — Hybrid 추론 전용 */}

          <div className="app-card p-4 space-y-3">
            <h2 className="text-sm font-semibold">입력 파일</h2>

            {/* 입력 이미지 / 마스크 슬롯 */}
            <div className="rounded-md border border-line p-2.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text">모델</span>
                <span className="chip chip-good">분석 화면과 공유</span>
              </div>
              <div className="mt-1 text-text-mute">
                {hybridUnetWeights ? hybridUnetWeights.name : sharedUnetPath ? sharedUnetPath.split(/[\\/]/).pop() : "U-Net++ (기본)"} ·{" "}
                {hybridYoloWeights ? hybridYoloWeights.name : sharedYoloPath ? sharedYoloPath.split(/[\\/]/).pop() : "YOLO11 (기본)"}
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-[10.5px] text-text-faint">다른 가중치로 평가</summary>
                <div className="mt-2 space-y-2">
                  <SingleFileDropzone label="U-Net 가중치 (.pt)" hint="비우면 기본 모델" file={hybridUnetWeights}
                    onChange={setHybridUnetWeights} accept=".pt,application/octet-stream"
                    onRevertToDefault={hybridUnetWeights ? () => setHybridUnetWeights(null) : undefined} />
                  <SingleFileDropzone label="YOLO 가중치 (.pt)" hint="비우면 기본 모델" file={hybridYoloWeights}
                    onChange={setHybridYoloWeights} accept=".pt,application/octet-stream"
                    onRevertToDefault={hybridYoloWeights ? () => setHybridYoloWeights(null) : undefined} />
                </div>
              </details>
            </div>
            <MultiFileDropzone
              files={hybridImages}
              setFiles={setHybridImages}
              label="추론할 이미지"
              emptyText="이미지 끌어다 놓거나 클릭"
              emptyHint="여러 장 가능"
            />
            <MultiFileDropzone
              files={hybridGts}
              setFiles={setHybridGts}
              label="정답 마스크 (선택)"
              emptyText="GT 마스크 끌어다 놓기"
              emptyHint="파일명 매칭 시 자동 지표"
            />
          </div>

          {/* GT 매칭 안내 */}
          <div className="rounded-md border border-edge bg-surface-soft px-3 py-2.5 text-[10.5px] text-fg-mute leading-relaxed">
            <div className="flex items-start gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5 text-fg-faint">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <div className="min-w-0">
                <div className="font-semibold text-fg mb-0.5">평가 지표를 보려면 정답 마스크 (GT) 도 함께 올리세요</div>
                <div>파일명이 자동 매칭됩니다. 예: <code className="text-[10px]">foo.png</code> ↔ <code className="text-[10px]">foo.png</code>, 또는 <code className="text-[10px]">foo_image.png</code> ↔ <code className="text-[10px]">foo_label.png</code></div>
              </div>
            </div>
          </div>

          <RunButton
            onClick={run}
            disabled={!canRun}
            busy={running}
            label={running ? "실행 중..." : T.runDiagnosis.label}
            icon="play"
          />

          {error && (
            <div className="text-[11.5px] text-[#7a1c1c] bg-[#fff1f1] border border-[#fbcaca] rounded-md p-3 whitespace-pre-wrap leading-relaxed fade-in flex gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c92a2a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div className="min-w-0 break-words">{error}</div>
            </div>
          )}
        </section>

        {/* ── 중앙 — 뷰어 / 결과 ── */}
        <section className="space-y-3 min-w-0 max-w-full">
          {!hybridRes && !running && (
            <div className="app-card p-10 lg:p-16 text-center fade-in">
              <div className="mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-4 bg-edge-soft">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="6.5"/>
                  <path d="m20 20-4.35-4.35"/>
                </svg>
              </div>
              <div className="text-[14px] font-semibold text-fg">아직 표시할 결과가 없어요</div>
              <p className="text-[12px] text-fg-mute mt-1.5 max-w-sm mx-auto leading-relaxed">
                왼쪽에서 파일을 올리고 오른쪽에서 파라미터를 조정한 뒤
                <kbd className="mx-1">실행</kbd>을 누르면 결과가 여기에 나타나요.
              </p>
            </div>
          )}

          {running && (
            <InferenceProgressCard
              label={inferLabel || "추론"}
              total={inferTotal}
              startMs={inferStartMs}
              tick={inferTick}
              firstCallNote="U-Net 가중치 + YOLO 가중치 로드 후 이미지별 융합"
            />
          )}

          {hybridRes && (
            <HybridView
              r={hybridRes}
              activeIdx={hybridActiveIdx}
              onPick={setHybridActiveIdx}
              diagView={hybridDiagView}
              setDiagView={setHybridDiagView}
              originalsMap={hybridOriginals}
              labelScale={hybridLabelScale}
              setLabelScale={setHybridLabelScale}
              numberedSrc={hybridNumberedSrc}
              numberedBusy={hybridNumberedBusy}
            />
          )}
        </section>

        {/* ── 우측 — 파라미터 패널 (가로 폭 드래그 조절) ── */}
        <aside className="relative space-y-3 min-w-0 lg:max-h-[calc(100vh-90px)] lg:overflow-y-auto lg:sticky lg:top-[68px] pr-1">
          <div
            className="resize-handle hidden lg:flex"
            title="드래그로 너비 조절"
            onMouseDown={startResize}
          />
          <ParamsPanel params={shared} onChange={setShared} mode="diagnosis" disabled={running} />

          {/* 다운로드 패널 — Hybrid 결과 있을 때만, 파라미터 바로 아래 */}
          {hybridRes && (() => {
            const it = hybridRes.results[Math.min(hybridActiveIdx, hybridRes.results.length - 1)];
            if (!it) return null;
            const dv = hybridDiagView;
            const diagLabelMap: Record<string, string> = {
              original: "원본", overlay: "오버레이", instances: "Instance",
              numbered: "번호", mask: "Mask", prob: "U-Net prob",
              high: "M_75 (anchor)", close: "M_close",
              boundary: "YOLO 경계", separator: "최종 분리선",
              color: "색 진단", hist: "d₊ 히스토그램",
            };
            const srcByView: Record<string, string> = {
              original: hybridOriginals[it.filename] ?? "",
              overlay: it.overlay_png,
              instances: it.instances_png,
              numbered: hybridNumberedSrc || it.instances_png,
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
              <HybridDownloadBar
                result={hybridRes}
                currentItem={it}
                currentDiagView={dv}
                currentDiagLabel={diagLabelMap[dv] ?? "image"}
                currentSrc={srcByView[dv] ?? ""}
                originalsMap={hybridOriginals}
                labelScale={hybridLabelScale}
                scaleBarPx={shared.scale.scale_bar_px}
                scaleBarUm={shared.scale.scale_bar_um}
                onScaleChange={(px, um) => setShared((p) => ({ ...p, scale: { ...p.scale, scale_bar_px: px, scale_bar_um: um, mode: px > 0 && um > 0 ? "scalebar" : p.scale.mode } }))}
              />
            );
          })()}
        </aside>
      </div>
    </div>
  );
}
