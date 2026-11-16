// AI 진단 결과 타입 · 번호 오버레이 렌더링 (화면 · 내려받기 공용).

export type Metrics = {
  Precision: number;
  Recall: number;
  Accuracy: number;
  IoU: number;
  F1: number;
  "mAP@0.5": number;
  ParticleCountError: number;
  n_gt_inst: number;
  n_pred_inst: number;
};

export type Particle = {
  id: number;       // 1, 2, ...
  label: string;    // "1", "2", ... ("p" 접두사 제거)
  area_px: number;  // pixel count
  cy: number;
  cx: number;
  /** 형상 지표 — 길이/면적은 스케일 환산 단위 (HybridResult.length_unit) */
  metrics?: Record<string, number | null>;
};

// 모듈 레벨 캐시 — 같은 base 이미지를 여러 번 디코드하지 않도록.
const _baseImageCache = new Map<string, Promise<HTMLImageElement | null>>();
export function loadImageCached(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  const hit = _baseImageCache.get(src);
  if (hit) return hit;
  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
  _baseImageCache.set(src, p);
  return p;
}

/**
 * 인스턴스 컬러 이미지 위에 입자별 일련번호 (1, 2, ...) 를 캔버스로 그려 반환.
 * scale=1.0 이 기본값. 더 키우면 글자 ↑.  실시간 슬라이더 조절용.
 */
export async function renderNumberedImage(
  baseSrc: string,
  particles: Particle[],
  scale: number,
): Promise<string | null> {
  if (!baseSrc) return null;
  const im = await loadImageCached(baseSrc);
  if (!im) return null;
  const canvas = document.createElement("canvas");
  canvas.width = im.naturalWidth || im.width;
  canvas.height = im.naturalHeight || im.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(im, 0, 0);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  (ctx as any).textRendering = "geometricPrecision";

  for (const p of particles) {
    const eqRadius = Math.sqrt(Math.max(1, p.area_px) / Math.PI);
    // 면적 반경 비례 + 사용자 scale
    const baseSize = Math.max(8, Math.min(72, eqRadius * 0.62));
    const sizePx = baseSize * scale;
    if (sizePx < 5) continue;
    ctx.font = `bold ${sizePx}px Inter, "GmarketSans", "Apple SD Gothic Neo", sans-serif`;
    const txt = String(p.id);
    // 흰 테두리 + 검정 글씨 — 어떤 배경 색에서도 읽힘
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, sizePx * 0.22);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.strokeText(txt, p.cx, p.cy);
    ctx.fillStyle = "#111111";
    ctx.fillText(txt, p.cx, p.cy);
  }
  return canvas.toDataURL("image/png");
}

// 형상 · 입도 지표 (backend particle_morphology.distribution_summary). 길이 단위 = length_unit
export type MorphologySummary = {
  n_particles: number;
  unit: "µm" | "px";
  n_edge_removed?: number;
  crop_bottom_px?: number;
  irregular_threshold?: number;
  [k: string]: number | string | boolean | null | undefined;
};

export type HybridItem = {
  filename: string;
  shape: [number, number];
  n_instances: number;
  n_instances_before_edge?: number;
  n_edge_removed?: number;
  crop_bottom_px?: number;
  morphology?: MorphologySummary;
  n_yolo: number;
  K_unet_anchor: number;
  tau: number;
  overlay_png: string;
  mask_png: string;
  instances_png: string;
  instances_numbered_png?: string;
  particles?: Particle[];
  diag_prob_png: string;
  diag_high_png: string;
  diag_low_png?: string;
  diag_prob_instances_png?: string;
  diag_prob_with_separator_png?: string;
  low_stats?: {
    p_low_px: number;
    converted_px: number;
    converted_pct: number;
    k_at_low: number;
    k_after_separator: number;
    k_delta: number;
  };
  diag_close_png: string;
  diag_boundary_png: string;
  diag_separator_png: string;
  diag_overlap_png: string;
  diag_hist_png?: string;
  hist_csv?: string;
  pixel_csv?: string;
  pixel_csv_rows?: number;
  metrics?: Metrics;
  metrics_yolo?: Metrics;
  metrics_unet_low?: Metrics;
  metrics_hybrid?: Metrics;
  gt_png?: string;
  gt_filename?: string;
};

export type HybridResult = {
  params: string;
  n_images: number;
  total_instances: number;
  n_with_gt: number;
  results: HybridItem[];
  high_thresh?: number;
  low_thresh?: number;
  summary?: Metrics & { n_with_gt: number };
  summary_yolo?: Metrics & { n_with_gt: number };
  summary_unet_low?: Metrics & { n_with_gt: number };
  summary_hybrid?: Metrics & { n_with_gt: number };
  morphology_all?: MorphologySummary;
  particle_columns?: { key: string; ko: string; en: string; unit: string }[];
  run_id?: string;
  um_per_px?: number | null;
  length_unit?: "µm" | "px";
  excel_data_url?: string;
  excel_size_bytes?: number;
  excel_error?: string;
};
