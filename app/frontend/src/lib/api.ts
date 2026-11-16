// Backend HTTP client. NEXT_PUBLIC_API_BASE 환경변수로 base URL 지정.
// DESIGN.md §3 의 엔드포인트 래퍼.

import type {
  AnalysisParams,
  BasicPtResponse,
  BatchJob,
  BatchJobSummary,
  CreateJobResponse,
  FsList,
  HealthResponse,
  TunerPreprocessResponse,
  TunerSegmentResponse,
} from "./types";

// 기본값 = 빈 문자열(같은 origin 상대 경로). FastAPI 가 정적 프런트 + API 를
// 같은 포트에서 서빙하므로, 런처 포트가 8765→8766 으로 밀려도 자동으로 맞는다.
// 별도 백엔드(standalone/dev)를 쓸 때만 NEXT_PUBLIC_API_BASE 로 절대 URL 지정.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    // 화면에는 서버가 준 설명만 보여 준다 ("404: 경로 없음 …" 대신 "경로 없음 …"). 설명이 없을 때만 HTTP 코드.
    super(body.trim() ? body : `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let text = "";
    try {
      text = await res.text();
      // FastAPI 는 {"detail": "..."} 형태로 에러 반환
      const j = JSON.parse(text) as { detail?: unknown };
      if (j && j.detail !== undefined) {
        text = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
      }
    } catch {
      /* text 그대로 */
    }
    throw new ApiError(res.status, text || res.statusText);
  }
  return (await res.json()) as T;
}

function get<T>(path: string, init?: RequestInit): Promise<T> {
  return fetch(`${API_BASE}${path}`, { cache: "no-store", ...init }).then((r) => jsonOrThrow<T>(r));
}

function postForm<T>(path: string, fd: FormData, signal?: AbortSignal): Promise<T> {
  return fetch(`${API_BASE}${path}`, { method: "POST", body: fd, signal }).then(
    (r) => jsonOrThrow<T>(r),
    (e: unknown) => {
      // 요청을 아예 보내지 못한 경우 브라우저는 'Failed to fetch' 만 준다 → 흔한 원인을 알려 준다 (취소는 그대로 전달)
      if (e instanceof TypeError) {
        throw new Error("요청을 보내지 못했습니다 — 올린 파일을 읽을 수 없거나(옮김 · 삭제 · 전체 경로 260자 초과) 앱 서버가 응답하지 않습니다.");
      }
      throw e;
    },
  );
}

// ───────────────────────── 기존 유지 ─────────────────────────

export function health(signal?: AbortSignal): Promise<HealthResponse> {
  return get<HealthResponse>("/api/health", { signal });
}

export function basicPt(signal?: AbortSignal): Promise<BasicPtResponse> {
  return get<BasicPtResponse>("/api/basic_pt", { signal });
}

// ───────────────────────── §3.1 튜너 ─────────────────────────

/** POST /api/tuner/preprocess — sem + watershed.blur_kernel 미리보기 */
/** 이미지 소스: 업로드 File 또는 서버 절대경로 */
export type ImageSource = File | string;

function appendSource(fd: FormData, src: ImageSource) {
  if (typeof src === "string") fd.append("server_path", src);
  else fd.append("image", src, src.name);
}

export function tunerPreprocess(file: ImageSource, params: AnalysisParams, signal?: AbortSignal): Promise<TunerPreprocessResponse> {
  const fd = new FormData();
  appendSource(fd, file);
  fd.append("params", JSON.stringify(params));
  return postForm<TunerPreprocessResponse>("/api/tuner/preprocess", fd, signal);
}

/** POST /api/tuner/segment — 전체 분할 + 측정 */
export function tunerSegment(file: ImageSource, params: AnalysisParams, signal?: AbortSignal): Promise<TunerSegmentResponse> {
  const fd = new FormData();
  appendSource(fd, file);
  fd.append("params", JSON.stringify(params));
  return postForm<TunerSegmentResponse>("/api/tuner/segment", fd, signal);
}

// ───────────────────────── §3.2 배치 ─────────────────────────

export type InputMode = "server_path" | "upload";

export interface CreateBatchJobArgs {
  params: AnalysisParams;
  inputMode: InputMode;
  inputPath?: string;
  outputDir?: string;
  jobName?: string;
  files?: File[];
  /** server_path 모드에서 분석할 파일명 (체크한 것만). 비우면 폴더 전체 */
  include?: string[];
}

export function createBatchJob(args: CreateBatchJobArgs, signal?: AbortSignal): Promise<CreateJobResponse> {
  const fd = new FormData();
  fd.append("params", JSON.stringify(args.params));
  fd.append("input_mode", args.inputMode);
  fd.append("input_path", args.inputMode === "server_path" ? (args.inputPath ?? "") : "");
  fd.append("output_dir", args.outputDir ?? "");
  fd.append("job_name", args.jobName ?? "");
  if (args.include && args.include.length) fd.append("include", JSON.stringify(args.include));
  if (args.inputMode === "upload") {
    for (const f of args.files ?? []) {
      // webkitdirectory 로 받은 파일은 webkitRelativePath 가 있지만 서버는 평평하게 저장하므로 basename 만 보냄
      fd.append("files", f, f.name);
    }
  }
  return postForm<CreateJobResponse>("/api/batch/jobs", fd, signal);
}

export function listJobs(signal?: AbortSignal): Promise<BatchJobSummary[]> {
  return get<BatchJobSummary[]>("/api/batch/jobs", { signal });
}

export function getJob(jobId: string, signal?: AbortSignal): Promise<BatchJob> {
  return get<BatchJob>(`/api/batch/jobs/${encodeURIComponent(jobId)}`, { signal });
}

export function cancelJob(jobId: string): Promise<{ ok: boolean }> {
  return fetch(`${API_BASE}/api/batch/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" }).then((r) =>
    jsonOrThrow<{ ok: boolean }>(r),
  );
}

/** 출력 파일 URL. relpath 는 output_dir 기준 상대경로 (백슬래시 허용 → 슬래시로 통일). */
export function jobFileUrl(jobId: string, relpath: string): string {
  const norm = relpath.replace(/\\/g, "/").replace(/^\/+/, "");
  const encoded = norm
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${API_BASE}/api/batch/jobs/${encodeURIComponent(jobId)}/files/${encoded}`;
}

export function jobZipUrl(jobId: string): string {
  return `${API_BASE}/api/batch/jobs/${encodeURIComponent(jobId)}/zip`;
}

// ───────────────────────── §3.3 서버 폴더 ─────────────────────────

export function fsList(path: string, signal?: AbortSignal, limit?: number): Promise<FsList> {
  const qs: string[] = [];
  if (path) qs.push(`path=${encodeURIComponent(path)}`);
  if (limit !== undefined) qs.push(`limit=${limit}`);
  const q = qs.length ? `?${qs.join("&")}` : "";
  return get<FsList>(`/api/fs/list${q}`, { signal });
}

export function fsThumbUrl(path: string, size = 160): string {
  return `${API_BASE}/api/fs/thumb?path=${encodeURIComponent(path)}&size=${size}`;
}

export function fsFileUrl(path: string): string {
  return `${API_BASE}/api/fs/file?path=${encodeURIComponent(path)}`;
}

export function fsDrives(signal?: AbortSignal): Promise<string[]> {
  return get<string[]>("/api/fs/drives", { signal });
}

/** 절대경로에서 파일명(basename) 추출 — Windows/POSIX 둘 다 */
export function basename(p: string): string {
  const s = p.replace(/[\\/]+$/, "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return i >= 0 ? s.slice(i + 1) : s;
}
