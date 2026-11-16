"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { API_BASE } from "@/lib/api";
import { TERMS as T } from "@/lib/terms";
import { renderNumberedImage } from "./core";
import type { HybridItem, HybridResult } from "./core";

export function HybridDownloadBar({
  result, currentItem, currentDiagView, currentDiagLabel, currentSrc, originalsMap,
  labelScale, scaleBarPx, scaleBarUm, onScaleChange,
}: {
  result: HybridResult;
  currentItem: HybridItem;
  currentDiagView: string;
  currentDiagLabel: string;
  currentSrc: string;
  originalsMap: Record<string, string>;
  labelScale: number;
  /** 공용 설정의 스케일바 (0 = 미입력) */
  scaleBarPx: number; scaleBarUm: number;
  onScaleChange: (px: number, um: number) => void;
}) {
  const [busy, setBusy] = useState<null | "zip" | "ppt" | "pdf" | "particles" | "metrics">(null);
  // 스케일 없이 실행된 결과에서 엑셀 다운로드 → 스케일 입력 창
  const [scaleAsk, setScaleAsk] = useState<null | "metrics" | "particles">(null);
  // 입력 중인 글자(예: "12.")를 유지하려고 글자 상태를 따로 두고, 숫자가 바뀌면 공용 설정에 반영
  const [scalePx, setScalePxText] = useState(scaleBarPx > 0 ? String(scaleBarPx) : "");
  const [scaleUm, setScaleUmText] = useState(scaleBarUm > 0 ? String(scaleBarUm) : "");
  useEffect(() => {
    setScalePxText((t) => ((parseFloat(t) || 0) === scaleBarPx ? t : scaleBarPx > 0 ? String(scaleBarPx) : ""));
    setScaleUmText((t) => ((parseFloat(t) || 0) === scaleBarUm ? t : scaleBarUm > 0 ? String(scaleBarUm) : ""));
  }, [scaleBarPx, scaleBarUm]);
  const num = (t: string) => { const v = parseFloat(t); return v > 0 ? v : 0; };
  const setScalePx = (t: string) => { setScalePxText(t); onScaleChange(num(t), num(scaleUm)); };
  const setScaleUm = (t: string) => { setScaleUmText(t); onScaleChange(num(scalePx), num(t)); };
  const askUmPerPx = (() => {
    const sp = parseFloat(scalePx), su = parseFloat(scaleUm);
    return sp > 0 && su > 0 ? su / sp : null;
  })();
  useEffect(() => {
    if (!scaleAsk) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setScaleAsk(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scaleAsk]);

  function requestExcel(kind: "metrics" | "particles") {
    if (result.um_per_px) {
      if (kind === "metrics") downloadMetricsXlsx(null);
      else downloadParticlesXlsx(null);
    } else {
      setScaleAsk(kind);
    }
  }

  /** 지표 엑셀. umPerPx 가 있으면 (스케일 없이 실행된 결과를) 서버에서 µm 로 재생성. */
  async function downloadMetricsXlsx(umPerPx: number | null) {
    const name = `hybrid_results_${result.n_images}imgs.xlsx`;
    if (!umPerPx || result.um_per_px) {
      if (!result.excel_data_url) return;
      const a = document.createElement("a");
      a.href = result.excel_data_url;
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    if (!result.run_id) {
      alert("이 결과는 µm 재생성을 지원하지 않습니다. 스케일을 입력하고 분석을 다시 실행해주세요.");
      return;
    }
    setBusy("metrics");
    try {
      const fd = new FormData();
      fd.append("run_id", result.run_id);
      fd.append("scale_bar_px", String(parseFloat(scalePx)));
      fd.append("scale_bar_um", String(parseFloat(scaleUm)));
      const r = await fetch(`${API_BASE}/api/run/hybrid/excel`, { method: "POST", body: fd });
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { msg = (await r.json()).detail ?? msg; } catch {}
        throw new Error(msg);
      }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`엑셀 생성 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  // ── PDF 옵션 모달 ──
  type PdfViewKey =
    | "original" | "overlay" | "instances" | "numbered" | "mask" | "prob"
    | "high" | "close" | "boundary" | "separator" | "color" | "hist";
  const PDF_VIEW_DEFS: { key: PdfViewKey; label: string; desc?: string }[] = [
    { key: "original",  label: "원본",            desc: "입력 SEM 이미지" },
    { key: "overlay",   label: "오버레이",         desc: "원본 + instance 채색" },
    { key: "instances", label: "Instance",       desc: "입자별 색" },
    { key: "numbered",  label: "번호",            desc: "p1, p2 ... 라벨 오버레이" },
    { key: "mask",      label: "Mask",           desc: "이진 마스크" },
    { key: "prob",      label: "U-Net prob",     desc: "확률맵" },
    { key: "high",      label: "M_75 (anchor)",  desc: "확실한 입자" },
    { key: "close",     label: "M_close",        desc: "거리 + Otsu (좁은 틈)" },
    { key: "boundary",  label: "YOLO 경계",       desc: "분리선 후보" },
    { key: "separator", label: "최종 분리선",      desc: "M_close ∩ B" },
    { key: "color",     label: "색 진단",          desc: "M_close / B / 겹침" },
    { key: "hist",      label: "d₊ 히스토그램",   desc: "Otsu 임계 시각화" },
  ];
  const hasGTGlobal = result.n_with_gt > 0;
  const hasHistAny = result.results.some(it => !!it.diag_hist_png);
  const hasParticlesAny = result.results.some(it => !!it.particles && it.particles.length > 0);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfOpts, setPdfOpts] = useState<Record<PdfViewKey, boolean> & { metrics: boolean }>({
    original: true,
    overlay: true,
    instances: true,
    numbered: false,
    mask: false,
    prob: false,
    high: false,
    close: false,
    boundary: false,
    separator: false,
    color: false,
    hist: false,
    metrics: true,
  });

  useEffect(() => {
    if (!pdfModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPdfModalOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [pdfModalOpen]);

  // 원본 (blob URL) 을 data URL 로 변환 — PDF/PPT 임베드용
  async function blobUrlToDataUrl(url: string): Promise<string | null> {
    if (!url) return null;
    if (url.startsWith("data:")) return url;
    try {
      const r = await fetch(url);
      const b = await r.blob();
      return await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result as string);
        fr.onerror = rej;
        fr.readAsDataURL(b);
      });
    } catch {
      return null;
    }
  }

  async function getImageSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => resolve(null);
      im.src = dataUrl;
    });
  }
  const safeName = (s: string) => s.replace(/[^\w가-힣.-]+/g, "_").slice(0, 80) || "image";

  // 현재 이미지 다운로드
  const currentImgName = `${safeName(currentItem.filename.replace(/\.[^.]+$/, ""))}_${currentDiagView}.png`;

  async function downloadAllImagesZip() {
    setBusy("zip");
    try {
      const JSZipMod = (await import("jszip")).default;
      const XLSX = await import("xlsx");
      const zip = new JSZipMod();
      // overlay + mask + instances 한 폴더씩
      for (let i = 0; i < result.results.length; i++) {
        const it = result.results[i];
        const stem = safeName(it.filename.replace(/\.[^.]+$/, ""));
        const idx = String(i + 1).padStart(3, "0");
        const pairs: [string, string | undefined][] = [
          ["overlay", it.overlay_png],
          ["instances", it.instances_png],
          ["mask", it.mask_png],
          ["unet_prob", it.diag_prob_png],
          ["unet_low", it.diag_low_png],
          ["unet_prob_instances", it.diag_prob_instances_png],
          ["unet_prob_with_separator", it.diag_prob_with_separator_png],
          ["separator", it.diag_separator_png],
        ];
        for (const [name, dataUrl] of pairs) {
          if (!dataUrl) continue;
          const base64 = dataUrl.split(",")[1];
          if (!base64) continue;
          zip.file(`${idx}_${stem}/${name}.png`, base64, { base64: true });
        }
        if (it.gt_png) {
          const b64 = it.gt_png.split(",")[1];
          if (b64) zip.file(`${idx}_${stem}/gt.png`, b64, { base64: true });
        }
      }

      // ── (a) 그래프용 xlsx: separator 가 P_low 를 얼마나 배경으로 바꿨는가 ──
      // ── (b) 그래프용 xlsx: separator cut 전/후 component 개수 ──
      const statsRows = result.results
        .map((it, i) => ({ i, it, s: it.low_stats }))
        .filter(({ s }) => s !== undefined) as {
          i: number; it: typeof result.results[number]; s: NonNullable<typeof result.results[number]["low_stats"]>;
        }[];
      if (statsRows.length > 0) {
        const sepRows = statsRows.map(({ i, it, s }) => ({
          idx: i + 1,
          filename: it.filename,
          p_low_px: s.p_low_px,
          converted_px: s.converted_px,
          converted_pct: Number(s.converted_pct.toFixed(4)),
        }));
        const meanPct = sepRows.reduce((a, r) => a + r.converted_pct, 0) / sepRows.length;
        const sepWb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(sepWb, XLSX.utils.json_to_sheet(sepRows), "per_image");
        XLSX.utils.book_append_sheet(sepWb, XLSX.utils.json_to_sheet([
          { metric: "mean_converted_pct", value: Number(meanPct.toFixed(4)) },
          { metric: "n_images", value: sepRows.length },
        ]), "summary");
        const sepBuf = XLSX.write(sepWb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
        zip.file("separator_impact.xlsx", sepBuf);

        const compRows = statsRows.map(({ i, it, s }) => ({
          idx: i + 1,
          filename: it.filename,
          k_at_low: s.k_at_low,
          k_after_separator: s.k_after_separator,
          delta: s.k_delta,
        }));
        const meanDelta = compRows.reduce((a, r) => a + r.delta, 0) / compRows.length;
        const compWb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(compWb, XLSX.utils.json_to_sheet(compRows), "per_image");
        XLSX.utils.book_append_sheet(compWb, XLSX.utils.json_to_sheet([
          { metric: "mean_delta_particles_per_image", value: Number(meanDelta.toFixed(4)) },
          { metric: "n_images", value: compRows.length },
        ]), "summary");
        const compBuf = XLSX.write(compWb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
        zip.file("component_count_impact.xlsx", compBuf);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hybrid_images_${result.n_images}imgs.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`ZIP 생성 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function downloadPPT() {
    setBusy("ppt");
    try {
      const PptxGenJS = (await import("pptxgenjs")).default;
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
      pptx.title = "Particle Lab — Hybrid 결과";
      pptx.author = "Particle Lab v2";

      // 표지
      const cover = pptx.addSlide();
      cover.background = { color: "FFFFFF" };
      cover.addText("Particle Lab — Hybrid 결과", {
        x: 0.6, y: 0.7, w: 12, h: 0.8,
        fontSize: 32, bold: true, color: "191919", fontFace: "Arial",
      });
      cover.addText(`이미지 ${result.n_images}장 · 총 입자 ${result.total_instances.toLocaleString()}개 · GT 매칭 ${result.n_with_gt}/${result.n_images}장`, {
        x: 0.6, y: 1.55, w: 12, h: 0.4,
        fontSize: 14, color: "6B7280", fontFace: "Arial",
      });
      cover.addText(result.params, {
        x: 0.6, y: 2.1, w: 12, h: 1.0,
        fontSize: 10, color: "9CA3AF", fontFace: "Courier New",
      });
      cover.addText(new Date().toLocaleString("ko-KR"), {
        x: 0.6, y: 6.8, w: 12, h: 0.3,
        fontSize: 10, color: "9CA3AF", fontFace: "Arial",
      });

      // 각 이미지 슬라이드
      for (let i = 0; i < result.results.length; i++) {
        const it = result.results[i];
        const slide = pptx.addSlide();
        slide.background = { color: "FFFFFF" };
        slide.addText(it.filename, {
          x: 0.4, y: 0.25, w: 12.5, h: 0.45,
          fontSize: 16, bold: true, color: "191919", fontFace: "Arial",
        });
        slide.addText(
          `입자 ${it.n_instances}개 · YOLO ${it.n_yolo} · U-Net anchor ${it.K_unet_anchor} · τ=${it.tau.toFixed(2)}` +
          (it.gt_filename ? `   ·   GT: ${it.gt_filename}` : ""),
          {
            x: 0.4, y: 0.7, w: 12.5, h: 0.3,
            fontSize: 10, color: "6B7280", fontFace: "Arial",
          }
        );
        // 좌: overlay, 우: instances
        if (it.overlay_png) {
          slide.addImage({ data: it.overlay_png, x: 0.4, y: 1.15, w: 6.2, h: 5.5, sizing: { type: "contain", w: 6.2, h: 5.5 } });
          slide.addText("Overlay", { x: 0.4, y: 6.65, w: 6.2, h: 0.3, fontSize: 10, color: "9CA3AF", align: "center", fontFace: "Arial" });
        }
        if (it.instances_png) {
          slide.addImage({ data: it.instances_png, x: 6.75, y: 1.15, w: 6.2, h: 5.5, sizing: { type: "contain", w: 6.2, h: 5.5 } });
          slide.addText("Instances", { x: 6.75, y: 6.65, w: 6.2, h: 0.3, fontSize: 10, color: "9CA3AF", align: "center", fontFace: "Arial" });
        }

        if (it.metrics_hybrid || it.metrics) {
          const m = (it.metrics_hybrid ?? it.metrics)!;
          slide.addText(
            `Precision ${m.Precision.toFixed(3)}  ·  Recall ${m.Recall.toFixed(3)}  ·  F1 ${m.F1.toFixed(3)}  ·  IoU ${m.IoU.toFixed(3)}  ·  CountErr ${(m.ParticleCountError*100).toFixed(1)}%`,
            { x: 0.4, y: 7.05, w: 12.5, h: 0.35, fontSize: 11, color: "191919", align: "center", fontFace: "Arial" }
          );
        }
      }

      await pptx.writeFile({ fileName: `hybrid_results_${result.n_images}imgs.pptx` });
    } catch (e) {
      alert(`PPT 생성 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function downloadPDF(optsParam?: typeof pdfOpts) {
    const opts = optsParam ?? pdfOpts;
    // 선택된 이미지 뷰 — VIEW_DEFS 순서 보존
    const selectedViews = PDF_VIEW_DEFS.filter(v => opts[v.key]);
    if (selectedViews.length === 0 && !opts.metrics) {
      alert("최소 1개 항목 이상 선택해주세요.");
      return;
    }
    setBusy("pdf");
    try {
      const { jsPDF } = await import("jspdf");

      // ── 페이지 좌표계 (mm, A4 landscape) ──
      const PAGE_W = 297, PAGE_H = 210;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      // ── 색상 팔레트 (Toss 풍 무채색) ──
      const C_INK    = [25, 25, 25] as const;
      const C_TEXT   = [55, 55, 60] as const;
      const C_MUTE   = [120, 122, 130] as const;
      const C_FAINT  = [170, 174, 184] as const;
      const C_LINE   = [232, 232, 228] as const;
      const C_LINE_SOFT = [241, 241, 239] as const;
      const C_BG     = [250, 250, 247] as const;
      const C_GOOD   = [0, 159, 80] as const;
      const C_BAD    = [232, 72, 60] as const;

      // ── 폰트 시스템 사전 로드 (GmarketSans 캔버스 렌더링 보장) ──
      if (typeof document !== "undefined" && (document as any).fonts) {
        try {
          await Promise.all([
            (document as any).fonts.load("400 24px GmarketSans"),
            (document as any).fonts.load("500 14px GmarketSans"),
            (document as any).fonts.load("700 14px GmarketSans"),
            (document as any).fonts.ready,
          ]);
        } catch { /* ignore */ }
      }

      // ── 한글 친화 텍스트 렌더러 (Canvas → PNG) ──
      // jsPDF 의 doc.text 는 라틴 글리프만 지원하므로,
      // 한글이 섞인 모든 텍스트는 캔버스로 그려서 이미지로 PDF 에 박는다.
      // 캔버스 해상도 = ptSize × SCALE (px). mm = pt × 25.4/72.
      const SCALE = 4; // 4x 해상도 (인쇄 품질)
      const wrapByChar = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
        if (!text) return [""];
        const out: string[] = [];
        // 줄바꿈 문자 우선
        for (const part of text.split("\n")) {
          if (!part) { out.push(""); continue; }
          let line = "";
          for (const ch of part) {
            const t = line + ch;
            if (ctx.measureText(t).width > maxW && line) {
              out.push(line);
              line = ch;
            } else {
              line = t;
            }
          }
          if (line) out.push(line);
        }
        return out;
      };
      const renderText = async (
        text: string,
        ptSize: number,
        opts: {
          bold?: boolean;
          color?: readonly [number, number, number];
          maxWidthMm?: number;
          align?: "left" | "center" | "right";
          letterSpacing?: number;
        } = {},
      ): Promise<{ dataUrl: string; widthMm: number; heightMm: number; widthPx: number; heightPx: number }> => {
        const { bold = false, color = C_INK, maxWidthMm = 280, letterSpacing = 0 } = opts;
        const fontSizePx = ptSize * SCALE;
        const maxWidthPx = (maxWidthMm / 25.4 * 72) * SCALE;
        const weight = bold ? "700" : "500";
        const fontStr = `${weight} ${fontSizePx}px "GmarketSans","Inter","Apple SD Gothic Neo","Pretendard",sans-serif`;
        // 가측정
        const m = document.createElement("canvas");
        const mc = m.getContext("2d")!;
        mc.font = fontStr;
        // letter-spacing 시뮬레이션 — Canvas 는 직접 지원이 약하므로 글자 단위로 그림
        const measureLine = (s: string) => {
          if (letterSpacing === 0) return mc.measureText(s).width;
          let w = 0;
          for (const ch of s) w += mc.measureText(ch).width + letterSpacing * SCALE;
          return Math.max(0, w - letterSpacing * SCALE);
        };
        const lines = wrapByChar(mc, text, maxWidthPx);
        const lineHeight = fontSizePx * 1.34;
        const widthPx = Math.ceil(Math.max(1, ...lines.map(measureLine))) + 4;
        const heightPx = Math.ceil(lineHeight * lines.length + fontSizePx * 0.35);
        const canvas = document.createElement("canvas");
        canvas.width = widthPx;
        canvas.height = heightPx;
        const ctx = canvas.getContext("2d")!;
        ctx.font = fontStr;
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
        // 안티앨리어싱 친화
        (ctx as any).textRendering = "geometricPrecision";
        lines.forEach((l, i) => {
          const y = i * lineHeight + fontSizePx;
          if (letterSpacing === 0) {
            ctx.fillText(l, 2, y);
          } else {
            let x = 2;
            for (const ch of l) {
              ctx.fillText(ch, x, y);
              x += ctx.measureText(ch).width + letterSpacing * SCALE;
            }
          }
        });
        return {
          dataUrl: canvas.toDataURL("image/png"),
          widthMm: (widthPx / SCALE) * 25.4 / 72,
          heightMm: (heightPx / SCALE) * 25.4 / 72,
          widthPx, heightPx,
        };
      };
      const drawText = async (text: string, x: number, y: number, ptSize: number, opts: {
        bold?: boolean;
        color?: readonly [number, number, number];
        maxWidthMm?: number;
        align?: "left" | "center" | "right";
        letterSpacing?: number;
      } = {}) => {
        if (!text) return { widthMm: 0, heightMm: 0 };
        const img = await renderText(text, ptSize, opts);
        const align = opts.align ?? "left";
        let dx = x;
        if (align === "center") dx = x - img.widthMm / 2;
        else if (align === "right") dx = x - img.widthMm;
        doc.addImage(img.dataUrl, "PNG", dx, y, img.widthMm, img.heightMm, undefined, "FAST");
        return { widthMm: img.widthMm, heightMm: img.heightMm };
      };

      const fillRect = (x: number, y: number, w: number, h: number, c: readonly [number, number, number]) => {
        doc.setFillColor(c[0], c[1], c[2]);
        doc.rect(x, y, w, h, "F");
      };
      const strokeRect = (x: number, y: number, w: number, h: number, c: readonly [number, number, number], lw = 0.15) => {
        doc.setDrawColor(c[0], c[1], c[2]);
        doc.setLineWidth(lw);
        doc.rect(x, y, w, h, "S");
      };
      const hLine = (x1: number, y: number, x2: number, c: readonly [number, number, number] = C_LINE, lw = 0.15) => {
        doc.setDrawColor(c[0], c[1], c[2]);
        doc.setLineWidth(lw);
        doc.line(x1, y, x2, y);
      };

      // ─────────────────── 표지 ───────────────────
      // 상단 좌측 brand block
      const M = 18;
      // 로고 마크
      fillRect(M, M, 9, 9, C_INK);
      await drawText("P", M + 4.5, M + 1.6, 11, { bold: true, color: [255, 255, 255], align: "center" });
      // 브랜드 이름 + 작은 라벨
      await drawText("Particle Lab", M + 12, M - 0.5, 9.5, { bold: true, color: C_INK, letterSpacing: 0.2 });
      await drawText("SEM Particle Segmentation Report", M + 12, M + 4.8, 7, { color: C_MUTE });

      // 우측 상단: 메타 라벨
      await drawText("REPORT", PAGE_W - M, M + 0.5, 7, { color: C_FAINT, align: "right", letterSpacing: 1.2 });
      await drawText(new Date().toLocaleDateString("ko-KR"), PAGE_W - M, M + 4.6, 8, { color: C_MUTE, align: "right" });

      // 본문 큰 타이틀
      const titleY = 56;
      await drawText("Hybrid 분석 리포트", M, titleY, 32, { bold: true, color: C_INK, letterSpacing: -0.6 });
      await drawText("U-Net 확률맵 × YOLO 인스턴스 경계 융합", M, titleY + 16, 11, { color: C_MUTE });

      // 요약 통계 — 3 큰 숫자
      const summaryY = 100;
      hLine(M, summaryY - 6, PAGE_W - M, C_LINE);
      const colW = (PAGE_W - 2 * M) / 3;
      const stats: { label: string; value: string; sub?: string }[] = [
        { label: "이미지", value: String(result.n_images), sub: "장 분석" },
        { label: "총 입자", value: result.total_instances.toLocaleString(), sub: "개 검출" },
        { label: "GT 매칭", value: `${result.n_with_gt} / ${result.n_images}`, sub: result.n_with_gt > 0 ? "지표 산출됨" : "지표 없음" },
      ];
      for (let s = 0; s < stats.length; s++) {
        const cx = M + s * colW;
        await drawText(stats[s].label, cx, summaryY + 2, 8, { color: C_FAINT, letterSpacing: 1.0 });
        await drawText(stats[s].value, cx, summaryY + 7, 28, { bold: true, color: C_INK, letterSpacing: -0.4 });
        if (stats[s].sub) await drawText(stats[s].sub!, cx, summaryY + 24, 8.5, { color: C_MUTE });
      }
      hLine(M, summaryY + 36, PAGE_W - M, C_LINE);

      // 실행 파라미터 블록
      const paramY = summaryY + 46;
      await drawText("실행 파라미터", M, paramY, 9, { bold: true, color: C_INK, letterSpacing: 0.6 });
      // params chips — key=value 들을 칩으로 나눠 배치
      const paramChips = result.params.split(/\s+·\s+|\s+\/\s+|\s+,\s+/).map(s => s.trim()).filter(Boolean);
      let cx2 = M, cy2 = paramY + 6;
      const CHIP_GAP = 1.5;
      const CHIP_PAD_X = 2.4;
      const CHIP_PAD_Y = 1.4;
      const MAX_X = PAGE_W - M;
      for (const chip of paramChips) {
        const img = await renderText(chip, 7.5, { color: C_TEXT });
        const w = img.widthMm + CHIP_PAD_X * 2;
        const h = img.heightMm + CHIP_PAD_Y * 2;
        if (cx2 + w > MAX_X) { cx2 = M; cy2 += h + CHIP_GAP; }
        if (cy2 + h > PAGE_H - M - 8) break;
        fillRect(cx2, cy2, w, h, C_BG);
        strokeRect(cx2, cy2, w, h, C_LINE_SOFT, 0.1);
        doc.addImage(img.dataUrl, "PNG", cx2 + CHIP_PAD_X, cy2 + CHIP_PAD_Y, img.widthMm, img.heightMm);
        cx2 += w + CHIP_GAP;
      }

      // 푸터
      hLine(M, PAGE_H - 12, PAGE_W - M, C_LINE_SOFT, 0.1);
      await drawText("Particle Lab v2", M, PAGE_H - 9, 7.5, { color: C_FAINT, letterSpacing: 0.8 });
      await drawText(new Date().toLocaleString("ko-KR"), PAGE_W - M, PAGE_H - 9, 7.5, { color: C_FAINT, align: "right" });

      // ─────────────────── 이미지별 페이지 ───────────────────
      for (let i = 0; i < result.results.length; i++) {
        const it = result.results[i];
        doc.addPage();

        const pM = 14;
        const pHeadY = pM;
        // 페이지 헤더 — 페이지 번호 칩 + 파일명
        const pageChip = `${String(i + 1).padStart(2, "0")} / ${String(result.results.length).padStart(2, "0")}`;
        const pageChipImg = await renderText(pageChip, 7.5, { color: C_MUTE, letterSpacing: 1.2 });
        fillRect(pM, pHeadY, pageChipImg.widthMm + 4, pageChipImg.heightMm + 2.8, C_BG);
        strokeRect(pM, pHeadY, pageChipImg.widthMm + 4, pageChipImg.heightMm + 2.8, C_LINE_SOFT, 0.1);
        doc.addImage(pageChipImg.dataUrl, "PNG", pM + 2, pHeadY + 1.4, pageChipImg.widthMm, pageChipImg.heightMm);

        await drawText(it.filename, pM + pageChipImg.widthMm + 8, pHeadY - 0.5, 12, {
          bold: true, color: C_INK, maxWidthMm: PAGE_W - 2 * pM - 60,
        });

        // 상단 우측 — 요약 한 줄
        const headerSub = `입자 ${it.n_instances}   ·   YOLO ${it.n_yolo}   ·   Anchor ${it.K_unet_anchor}   ·   τ ${it.tau.toFixed(2)}`;
        await drawText(headerSub, PAGE_W - pM, pHeadY + 1, 8.5, { color: C_MUTE, align: "right" });
        if (it.gt_filename) {
          await drawText(`GT: ${it.gt_filename}`, PAGE_W - pM, pHeadY + 6, 7.5, { color: C_FAINT, align: "right" });
        }

        hLine(pM, pHeadY + 13, PAGE_W - pM, C_LINE);

        // 본문 영역 — 사용자가 선택한 N개 뷰에 맞춘 적응형 그리드
        const m = it.metrics_hybrid ?? it.metrics;
        const showMetrics = opts.metrics && !!m;
        const FOOT_H = showMetrics ? 38 : 16;
        const bodyY = pHeadY + 18;
        const bodyH = PAGE_H - bodyY - FOOT_H;

        // 선택된 뷰들의 src 매핑
        const origData = await blobUrlToDataUrl(originalsMap[it.filename] ?? "");
        // 번호 모드 — 현재 보기모드의 labelScale 로 클라이언트 렌더링 (viewer 와 동일한 글자 크기)
        const numberedClient = opts.numbered
          ? await renderNumberedImage(it.instances_png ?? "", it.particles ?? [], labelScale)
          : null;
        const SRC: Record<PdfViewKey, string | null> = {
          original:  origData,
          overlay:   it.overlay_png ?? null,
          instances: it.instances_png ?? null,
          numbered:  numberedClient,
          mask:      it.mask_png ?? null,
          prob:      it.diag_prob_png ?? null,
          high:      it.diag_high_png ?? null,
          close:     it.diag_close_png ?? null,
          boundary:  it.diag_boundary_png ?? null,
          separator: it.diag_separator_png ?? null,
          color:     it.diag_overlap_png ?? null,
          hist:      it.diag_hist_png ?? null,
        };
        const cells = selectedViews.map(v => ({
          label: v.label,
          src: SRC[v.key],
        }));

        // 적응형 그리드 — n 개 뷰 → cols × rows
        const gridDims = (n: number): [number, number] => {
          if (n <= 1) return [1, 1];
          if (n === 2) return [2, 1];
          if (n === 3) return [3, 1];
          if (n === 4) return [2, 2];
          if (n <= 6) return [3, 2];
          if (n <= 9) return [3, 3];
          return [4, 3];
        };
        const N = cells.length;
        const [cols, rows] = N === 0 ? [0, 0] : gridDims(N);
        const GAP = N <= 3 ? 4 : 3;

        if (N > 0) {
          const cellW = (PAGE_W - 2 * pM - (cols - 1) * GAP) / cols;
          const cellH = (bodyH - (rows - 1) * GAP) / rows;

          for (let c = 0; c < cells.length; c++) {
            const cell = cells[c];
            const colIdx = c % cols;
            const rowIdx = Math.floor(c / cols);
            const x = pM + colIdx * (cellW + GAP);
            const y = bodyY + rowIdx * (cellH + GAP);

            // 카드 보더
            strokeRect(x, y, cellW, cellH, C_LINE_SOFT, 0.15);

            // 캡션
            const CAP_H = N >= 7 ? 6 : 8;
            fillRect(x, y, cellW, CAP_H, C_BG);
            hLine(x, y + CAP_H, x + cellW, C_LINE_SOFT, 0.1);
            const capFont = N >= 7 ? 6.5 : 7.5;
            await drawText(cell.label, x + 2.2, y + (N >= 7 ? 1.3 : 1.7), capFont, {
              color: C_INK, bold: true, letterSpacing: 0.5,
            });

            const imgArea = {
              x: x + 1, y: y + CAP_H + 1,
              w: cellW - 2, h: cellH - CAP_H - 2,
            };

            if (!cell.src) {
              await drawText(
                cell.label === "원본" ? "원본 미연결" : "없음",
                imgArea.x + imgArea.w / 2, imgArea.y + imgArea.h / 2 - 2,
                Math.max(6.5, 8 - (N - 3) * 0.3),
                { color: C_FAINT, align: "center" },
              );
              continue;
            }

            // 비율 보존 fit
            const sz = await getImageSize(cell.src);
            let drawW = imgArea.w, drawH = imgArea.h;
            if (sz) {
              const ar = sz.w / sz.h;
              const fitH = imgArea.w / ar;
              if (fitH <= imgArea.h) { drawW = imgArea.w; drawH = fitH; }
              else { drawH = imgArea.h; drawW = imgArea.h * ar; }
            }
            const ox = imgArea.x + (imgArea.w - drawW) / 2;
            const oy = imgArea.y + (imgArea.h - drawH) / 2;
            try {
              const fmt = /^data:image\/jpe?g/.test(cell.src) ? "JPEG" : "PNG";
              doc.addImage(cell.src, fmt, ox, oy, drawW, drawH, undefined, "FAST");
            } catch {
              strokeRect(imgArea.x, imgArea.y, imgArea.w, imgArea.h, C_LINE);
            }
          }
        }

        // ── 평가 지표 (옵션 + GT 있을 때) — 화면 동일 7 셀 ──
        if (showMetrics && m) {
          const metricsY = PAGE_H - FOOT_H + 2;
          hLine(pM, metricsY - 2, PAGE_W - pM, C_LINE);
          const metrics: { label: string; value: string; tier: "good" | "bad" | "ink" }[] = (() => {
            const tier = (v: number, better: "high" | "low"): "good" | "bad" | "ink" => {
              if (!isFinite(v)) return "ink";
              if (better === "high") {
                if (v >= 0.85) return "good";
                if (v < 0.40) return "bad";
                return "ink";
              } else {
                if (v <= 0.05) return "good";
                if (v > 0.30) return "bad";
                return "ink";
              }
            };
            return [
              { label: "Precision", value: m.Precision.toFixed(4), tier: tier(m.Precision, "high") },
              { label: "Recall",    value: m.Recall.toFixed(4),    tier: tier(m.Recall, "high") },
              { label: "Accuracy",  value: m.Accuracy.toFixed(4),  tier: tier(m.Accuracy, "high") },
              { label: "IoU",       value: m.IoU.toFixed(4),       tier: tier(m.IoU, "high") },
              { label: "F1",        value: m.F1.toFixed(4),        tier: tier(m.F1, "high") },
              { label: "mAP@0.5",   value: m["mAP@0.5"].toFixed(4),tier: tier(m["mAP@0.5"], "high") },
              { label: "CountErr",  value: `${(m.ParticleCountError * 100).toFixed(2)}%`, tier: tier(m.ParticleCountError, "low") },
            ];
          })();
          const mCellW = (PAGE_W - 2 * pM) / metrics.length;
          for (let k = 0; k < metrics.length; k++) {
            const mx = pM + k * mCellW;
            const valColor =
              metrics[k].tier === "good" ? C_GOOD :
              metrics[k].tier === "bad"  ? C_BAD  : C_INK;
            await drawText(metrics[k].label, mx + 1.5, metricsY + 2, 7, { color: C_FAINT, letterSpacing: 0.8 });
            await drawText(metrics[k].value, mx + 1.5, metricsY + 7, 14, { bold: true, color: valColor, letterSpacing: -0.2 });
          }
          await drawText(
            `n_gt ${m.n_gt_inst}   ·   n_pred ${m.n_pred_inst}`,
            pM, metricsY + 26, 7.5, { color: C_FAINT, letterSpacing: 0.4 },
          );
        } else if (opts.metrics && !m) {
          // 사용자가 평가지표를 켰지만 이 이미지엔 GT 없음
          await drawText(
            `${it.filename} — 정답 마스크 미매칭, 지표 생략됨`,
            pM, PAGE_H - 12, 7.5, { color: C_FAINT },
          );
        }

        // 페이지 푸터
        hLine(pM, PAGE_H - 8, PAGE_W - pM, C_LINE_SOFT, 0.1);
        await drawText("Particle Lab v2  ·  Hybrid Report", pM, PAGE_H - 5.5, 7, { color: C_FAINT, letterSpacing: 0.5 });
        await drawText(`p. ${i + 2} / ${result.results.length + 1}`, PAGE_W - pM, PAGE_H - 5.5, 7, { color: C_FAINT, align: "right" });
      }

      const pdfName = `hybrid_report_${result.n_images}imgs.pdf`;
      // 데스크탑 런처(pywebview)에서는 doc.save() 의 anchor/iframe trigger 가
      // macOS WebKit 에서 메인 창을 PDF 로 navigate 시키는 문제가 있어,
      // launcher 가 노출하는 __plabSaveBlob 으로 직접 bridge 한다.
      const plabSave = (window as any).__plabSaveBlob;
      if (typeof plabSave === "function") {
        const blob = doc.output("blob");
        await plabSave(pdfName, blob);
      } else {
        doc.save(pdfName);
      }
    } catch (e) {
      alert(`PDF 생성 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  // ── 입자별 크기 엑셀 (.xlsx) ──
  // 각 이미지마다 시트 1개 + "Summary" 시트 1개.
  // 시트 컬럼: id (1..N), label (p1, p2, ...), area_px, centroid_x, centroid_y, area_um2(추후)
  /** umPerPx: px 결과를 다운로드 시점에 µm 로 환산 (결과가 이미 µm 면 무시). */
  async function downloadParticlesXlsx(umPerPx: number | null) {
    setBusy("particles");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const conv = !result.um_per_px && umPerPx ? umPerPx : null;
      const unit = conv ? "µm" : (result.length_unit ?? "px");
      // 열 단위 → 환산 배율 (px → µm, px² → µm²)
      const mcols = (result.particle_columns ?? []).map(c => {
        if (conv && c.unit === "px") return { ...c, unit: "µm", f: conv };
        if (conv && c.unit === "px²") return { ...c, unit: "µm²", f: conv * conv };
        return { ...c, f: 1 };
      });
      const lf = conv ?? 1;
      const withUnit = (name: string, u: string) => (u ? `${name} (${u})` : name);

      // 시트명 안전 처리 — Excel 제한 (31자, /\?*[] 금지)
      const safeSheetName = (s: string, used: Set<string>) => {
        let base = s.replace(/\.[^.]+$/, "").replace(/[\/\\?*[\]:]/g, "_").slice(0, 28);
        if (!base) base = "sheet";
        let name = base, k = 2;
        while (used.has(name)) { name = `${base}_${k}`.slice(0, 31); k++; }
        used.add(name);
        return name;
      };
      const used = new Set<string>();
      const num = (v: unknown, f = 1) => (typeof v === "number" && Number.isFinite(v) ? v * f : "");

      // Summary 시트 — 이미지별 입자 수 + 입도/형상 요약. 1행 한글 / 2행 English
      const sumCols: [string, string, string, (it: HybridItem) => number | string][] = [
        ["파일명", "Filename", "", it => it.filename],
        ["입자 수", "Particle count", "", it => (it.particles ?? []).length],
        ["모서리 제거 입자 수", "Edge particles removed", "", it => it.n_edge_removed ?? 0],
        ["하단 크롭", "Bottom crop", "px", it => it.crop_bottom_px ?? 0],
        ["ECD 평균", "ECD mean", unit, it => num(it.morphology?.ecd_mean, lf)],
        ["D10", "D10", unit, it => num(it.morphology?.d10, lf)],
        ["D50", "D50", unit, it => num(it.morphology?.d50, lf)],
        ["D90", "D90", unit, it => num(it.morphology?.d90, lf)],
        ["PSD Span", "PSD Span", "", it => num(it.morphology?.span)],
        ["원형도 평균", "Circularity mean", "", it => num(it.morphology?.circularity_mean)],
        ["종횡비 평균", "Aspect Ratio mean", "", it => num(it.morphology?.aspect_ratio_mean)],
        ["불규칙 입자 비율", "Irregular fraction", "%", it => num(it.morphology?.irregular_fraction_pct)],
        ["이미지 폭", "Image width", "px", it => it.shape[1]],
        ["이미지 높이", "Image height", "px", it => it.shape[0]],
      ];
      const summaryRows: (string | number)[][] = [
        sumCols.map(([ko, , u]) => withUnit(ko, u)),
        sumCols.map(([, en, u]) => withUnit(en, u)),
      ];

      for (const it of result.results) {
        const parts = it.particles ?? [];
        const sheetName = safeSheetName(it.filename || "image", used);
        // 정렬: 면적 큰 순 → 그대로 (backend 가 이미 정렬해서 보냄). 번호 = 번호 이미지와 동일
        const rows: (string | number)[][] = [
          ["입자 번호", "중심 x (px)", "중심 y (px)", ...mcols.map(c => withUnit(c.ko, c.unit))],
          ["Particle ID", "Centroid x (px)", "Centroid y (px)", ...mcols.map(c => withUnit(c.en, c.unit))],
          ...parts.map(p => [
            p.id, p.cx, p.cy,
            ...mcols.map(c => num(p.metrics?.[c.key], c.f)),
          ]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        (ws as any)["!cols"] = [{ wch: 10 }, { wch: 11 }, { wch: 11 }, ...mcols.map(() => ({ wch: 16 }))];
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        summaryRows.push(sumCols.map(([, , , f]) => f(it)));
      }

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      (wsSummary as any)["!cols"] = sumCols.map((_, i) => ({ wch: i === 0 ? 32 : 14 }));
      // Summary 를 첫 시트로
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
      const idx = wb.SheetNames.indexOf("Summary");
      if (idx > 0) {
        wb.SheetNames.splice(idx, 1);
        wb.SheetNames.unshift("Summary");
      }

      XLSX.writeFile(wb, `hybrid_particles_${result.n_images}imgs.xlsx`);
    } catch (e) {
      alert(`엑셀 생성 실패: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const Row = ({
    icon, label, sub, onClick, href, downloadName, disabled, kind,
  }: {
    icon: React.ReactNode;
    label: string;
    sub?: string;
    onClick?: () => void;
    href?: string;
    downloadName?: string;
    disabled?: boolean;
    kind?: "primary" | "default";
  }) => {
    const cls =
      "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-[12px] font-medium text-left transition " +
      (kind === "primary"
        ? "bg-fg text-white border-fg hover:bg-[#2c2c2c] "
        : "bg-white text-fg border-edge hover:border-fg hover:bg-surface-soft ") +
      (disabled ? "opacity-50 cursor-not-allowed " : "");
    const inner = (
      <>
        <span className={"w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 " + (kind === "primary" ? "bg-white/10" : "bg-surface-soft")}>
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block truncate">{label}</span>
          {sub && <span className={"block text-[10px] mt-0.5 truncate font-normal " + (kind === "primary" ? "text-white/60" : "text-fg-faint")}>{sub}</span>}
        </span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50 flex-shrink-0">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </>
    );
    if (href) {
      return (
        <a href={href} download={downloadName} className={cls} onClick={(e) => e.stopPropagation()}>{inner}</a>
      );
    }
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cls}>{inner}</button>
    );
  };

  return (
    <div className="app-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[13px] font-semibold text-fg">다운로드</h2>
          <p className="text-[10.5px] text-fg-faint mt-0.5">결과를 파일로 저장</p>
        </div>
        <span className="text-[10px] text-fg-faint font-mono">{result.n_images}장</span>
      </div>

      <div className="space-y-1.5">
        <Row
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          }
          label="현재 이미지 저장"
          sub={currentDiagLabel + " · PNG"}
          href={currentSrc}
          downloadName={currentImgName}
          kind="primary"
        />
        <Row
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <path d="M9 13h6"/>
              <path d="M9 17h4"/>
            </svg>
          }
          label={busy === "pdf" ? "PDF 생성 중..." : "PDF 리포트"}
          sub="포함할 항목 선택 후 생성"
          onClick={() => setPdfModalOpen(true)}
          disabled={busy !== null}
        />
        <Row
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M8 8h6a2 2 0 0 1 0 4H8z"/>
              <path d="M8 12v5"/>
            </svg>
          }
          label={busy === "ppt" ? "PPT 생성 중..." : "PPT 슬라이드"}
          sub="이미지당 1장 슬라이드"
          onClick={downloadPPT}
          disabled={busy !== null}
        />
        <Row
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/>
              <polyline points="3 8 12 13 21 8"/>
              <path d="M12 2v11"/>
            </svg>
          }
          label={busy === "zip" ? "ZIP 생성 중..." : "전체 이미지 ZIP"}
          sub={`${result.n_images}장 · overlay/instances/mask 폴더별`}
          onClick={downloadAllImagesZip}
          disabled={busy !== null}
        />
        {hasParticlesAny && (
          <Row
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="7" cy="8" r="2.5"/>
                <circle cx="14" cy="15" r="2.5"/>
                <circle cx="17" cy="7" r="1.7"/>
                <circle cx="6" cy="17" r="1.7"/>
              </svg>
            }
            label={busy === "particles" ? "엑셀 생성 중..." : "입자별 지표 엑셀"}
            sub={`입자마다 ECD·원형도… (${result.length_unit ?? "px"}) · 이미지당 시트 + Summary`}
            onClick={() => requestExcel("particles")}
            disabled={busy !== null}
          />
        )}
        {result.excel_data_url && (
          <Row
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            }
            label={busy === "metrics" ? "엑셀 생성 중..." : "지표 엑셀 (.xlsx)"}
            sub={`평가지표 + 형상·입도 지표 (한/영)${result.excel_size_bytes ? ` · ${(result.excel_size_bytes / 1024).toFixed(0)}KB` : ""}`}
            onClick={() => requestExcel("metrics")}
            disabled={busy !== null}
          />
        )}
        {!result.um_per_px && (
          <div className="text-[10.5px] text-warn bg-warn-soft border border-warn-line rounded-md px-2.5 py-1.5 leading-snug">
            스케일 미입력 상태로 분석됨 — 엑셀 다운로드 시 스케일을 입력하면 µm 로 환산됩니다.
          </div>
        )}
      </div>

      {scaleAsk && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4 fade-in"
          onClick={() => setScaleAsk(null)}
        >
          <div
            className="bg-white rounded-xl shadow-lg w-full max-w-[420px] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[14px] font-semibold text-fg">스케일을 입력해주세요</h3>
            <p className="text-[11.5px] text-fg-mute mt-1 leading-snug">
              이 결과는 스케일 없이 분석되어 길이 지표가 <b>px</b> 단위입니다.
              스케일바 길이(px)와 실제 길이(µm)를 입력하면 재분석 없이 µm 로 환산해 엑셀을 만듭니다.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <label className="block text-xs">
                <div className="mb-1 text-text-mute">{T.scaleBarPx.label} (px)</div>
                <input
                  autoFocus type="text" inputMode="decimal" placeholder="예: 200"
                  value={scalePx} onChange={(e) => setScalePx(e.target.value)}
                  className="w-full border border-line rounded-md px-2 py-1.5 text-xs bg-white font-mono"
                />
              </label>
              <label className="block text-xs">
                <div className="mb-1 text-text-mute">{T.scaleBarUm.label} (µm)</div>
                <input
                  type="text" inputMode="decimal" placeholder="예: 10"
                  value={scaleUm} onChange={(e) => setScaleUm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && askUmPerPx) {
                      const k = scaleAsk; setScaleAsk(null);
                      if (k === "metrics") downloadMetricsXlsx(askUmPerPx); else downloadParticlesXlsx(askUmPerPx);
                    }
                  }}
                  className="w-full border border-line rounded-md px-2 py-1.5 text-xs bg-white font-mono"
                />
              </label>
            </div>
            <div className="text-[10.5px] mt-1.5 h-4 text-fg-mute">
              {askUmPerPx
                ? <>1 px = <b className="font-mono text-fg">{askUmPerPx.toPrecision(4)}</b> µm</>
                : <span className="text-danger">두 값을 모두 0보다 크게 입력해주세요.</span>}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                disabled={!askUmPerPx}
                onClick={() => {
                  const k = scaleAsk; setScaleAsk(null);
                  if (k === "metrics") downloadMetricsXlsx(askUmPerPx); else downloadParticlesXlsx(askUmPerPx);
                }}
                className="flex-1 py-2 rounded-md text-[12px] font-semibold bg-fg text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                µm 로 다운로드
              </button>
              <button
                type="button"
                onClick={() => {
                  const k = scaleAsk; setScaleAsk(null);
                  if (k === "metrics") downloadMetricsXlsx(null); else downloadParticlesXlsx(null);
                }}
                className="px-3 py-2 rounded-md text-[12px] border border-edge-strong text-fg-mute hover:border-fg hover:text-fg"
              >
                px 그대로
              </button>
              <button
                type="button"
                onClick={() => setScaleAsk(null)}
                className="px-3 py-2 rounded-md text-[12px] text-fg-faint hover:text-fg"
              >
                취소
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {pdfModalOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4 fade-in"
          onClick={() => setPdfModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-lg w-full max-w-[480px] max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="px-5 pt-5 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold text-fg">PDF 리포트 옵션</h3>
                  <p className="text-[11.5px] text-fg-faint mt-0.5">
                    각 이미지마다 포함할 항목을 선택하세요
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPdfModalOpen(false)}
                  className="w-7 h-7 rounded-md hover:bg-edge-soft text-fg-mute hover:text-fg flex items-center justify-center text-[18px] leading-none"
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>
            </div>

            {/* 옵션 본문 */}
            <div className="px-5 pb-1 overflow-y-auto">
              {/* 일괄 선택 */}
              <div className="flex items-center gap-2 text-[11px] mb-3">
                <button
                  type="button"
                  className="px-2 py-1 rounded-md border border-edge-strong text-fg-mute hover:border-fg hover:text-fg"
                  onClick={() => {
                    const next: any = { ...pdfOpts };
                    PDF_VIEW_DEFS.forEach(v => {
                      if (v.key === "hist") next[v.key] = hasHistAny;
                      else if (v.key === "numbered") next[v.key] = hasParticlesAny;
                      else next[v.key] = true;
                    });
                    next.metrics = hasGTGlobal;
                    setPdfOpts(next);
                  }}
                >
                  모두 선택
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded-md border border-edge-strong text-fg-mute hover:border-fg hover:text-fg"
                  onClick={() => {
                    const next: any = { ...pdfOpts };
                    PDF_VIEW_DEFS.forEach(v => { next[v.key] = false; });
                    next.metrics = false;
                    setPdfOpts(next);
                  }}
                >
                  모두 해제
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded-md border border-edge-strong text-fg-mute hover:border-fg hover:text-fg ml-auto"
                  onClick={() => {
                    setPdfOpts({
                      original: true, overlay: true, instances: true,
                      numbered: false, mask: false, prob: false, high: false,
                      close: false, boundary: false, separator: false,
                      color: false, hist: false,
                      metrics: hasGTGlobal,
                    });
                  }}
                >
                  기본값
                </button>
              </div>

              {/* 이미지 항목 그리드 */}
              <div className="text-[10px] uppercase tracking-wider font-semibold text-fg-faint mb-2">이미지 항목</div>
              <div className="grid grid-cols-2 gap-1.5 mb-4">
                {PDF_VIEW_DEFS.map(v => {
                  const disabled =
                    (v.key === "hist" && !hasHistAny) ||
                    (v.key === "numbered" && !hasParticlesAny);
                  const checked = !!pdfOpts[v.key];
                  return (
                    <label
                      key={v.key}
                      className={
                        "flex items-start gap-2 px-2.5 py-2 rounded-md border cursor-pointer transition " +
                        (disabled
                          ? "border-edge bg-surface-soft opacity-50 cursor-not-allowed "
                          : checked
                            ? "border-fg bg-surface-soft "
                            : "border-edge bg-white hover:border-line-strong ")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={(e) => setPdfOpts({ ...pdfOpts, [v.key]: e.target.checked })}
                        className="mod-check mt-0.5 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-fg truncate">{v.label}</div>
                        {v.desc && <div className="text-[10px] text-fg-faint truncate">{v.desc}</div>}
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* 추가 */}
              <div className="text-[10px] uppercase tracking-wider font-semibold text-fg-faint mb-2">추가</div>
              <label
                className={
                  "flex items-start gap-2 px-2.5 py-2 rounded-md border cursor-pointer transition mb-2 " +
                  (!hasGTGlobal
                    ? "border-edge bg-surface-soft opacity-50 cursor-not-allowed "
                    : pdfOpts.metrics
                      ? "border-fg bg-surface-soft "
                      : "border-edge bg-white hover:border-line-strong ")
                }
              >
                <input
                  type="checkbox"
                  checked={pdfOpts.metrics && hasGTGlobal}
                  disabled={!hasGTGlobal}
                  onChange={(e) => setPdfOpts({ ...pdfOpts, metrics: e.target.checked })}
                  className="mod-check mt-0.5 flex-shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-fg">평가 지표</div>
                  <div className="text-[10px] text-fg-faint">
                    {hasGTGlobal
                      ? `Precision · Recall · IoU · F1 · mAP · CountErr (GT 매칭 ${result.n_with_gt}/${result.n_images}장)`
                      : "정답 마스크 (GT) 가 매칭되지 않아 사용 불가"}
                  </div>
                </div>
              </label>
            </div>

            {/* 푸터 */}
            <div className="px-5 py-4 border-t border-edge flex items-center justify-between gap-3">
              <div className="text-[11px] text-fg-faint min-w-0 truncate">
                {(() => {
                  const n = PDF_VIEW_DEFS.filter(v => pdfOpts[v.key]).length;
                  const includeMetrics = pdfOpts.metrics && hasGTGlobal;
                  return `이미지 ${n}항목${includeMetrics ? " + 지표" : ""} · ${result.n_images}페이지`;
                })()}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setPdfModalOpen(false)}
                  className="px-3 py-1.5 rounded-md text-[12px] font-medium text-fg-mute hover:bg-edge-soft"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => { setPdfModalOpen(false); downloadPDF(pdfOpts); }}
                  disabled={busy !== null}
                  className="px-3.5 py-1.5 rounded-md text-[12px] font-semibold bg-fg text-white hover:bg-[#2c2c2c] disabled:opacity-50"
                >
                  PDF 생성
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
