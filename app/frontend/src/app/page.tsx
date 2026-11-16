"use client";

// 분석 (/) — 튜너 + 배치 통합.
//   이미지 목록(폴더 또는 업로드) → 한 장 골라 미리보기로 설정 맞추기 → 체크한 이미지 전체 분석.
//   Watershed 는 설정을 바꾸면 미리보기가 자동 갱신, AI Hybrid 는 "미리보기" 버튼으로 실행.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  ArrowRight,
  CheckSquare,
  Download,
  FolderSearch,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Upload,
} from "lucide-react";

import type { AnalysisParams, BatchJob, BatchJobSummary, DValues, TunerSegmentResponse, TunerViewKey } from "@/lib/types";
import {
  cancelJob,
  createBatchJob,
  fsFileUrl,
  fsList,
  fsThumbUrl,
  health,
  getJob,
  jobFileUrl,
  listJobs,
  tunerPreprocess,
  tunerSegment,
  type ImageSource,
  type InputMode,
} from "@/lib/api";
import { setHandoffImages } from "@/lib/handoff";
import { downloadParamsJson, importParamsJson, saveParams, useAnalysisParams } from "@/lib/params";
import { TERMS as T } from "@/lib/terms";
import { useRightPanelWidth } from "@/lib/useRightPanelWidth";
import ParticleTableCard from "@/components/analysis/ParticleTableCard";
import ResultsPanel from "@/components/analysis/ResultsPanel";
import { BigStat, PILL, fmt } from "@/components/analysis/parts";
import ParamsPanel from "@/components/params/ParamsPanel";
import ImageViewer from "@/components/ui/ImageViewer";
import EngineSwitch from "@/components/ui/EngineSwitch";
import Dropzone, { isImageFile, splitReadable } from "@/components/ui/Dropzone";
import Chip from "@/components/ui/Chip";
import ProgressBar from "@/components/ui/ProgressBar";
import {
  FolderBrowser,
  POLL_MS,
  STATUS_KO,
  fmtTime,
  statusTone,
} from "@/components/batch/parts";

// ───────────────────────── 상수 ─────────────────────────

type ViewKey = TunerViewKey | "ai_prob" | "ai_yolo" | "ai_separator" | "result_after" | "result_comparison";

const VIEWS: { key: ViewKey; label: string; wsOnly?: boolean; aiOnly?: boolean; result?: boolean; title?: string }[] = [
  { key: "original", label: "원본" },
  { key: "preprocessed", label: "전처리" },
  { key: "binary", label: "이진화", wsOnly: true },
  { key: "distance", label: "거리맵", wsOnly: true },
  { key: "markers", label: "마커", wsOnly: true },
  { key: "ai_prob", label: "U-Net 확률맵", aiOnly: true, title: "밝을수록 입자일 확률이 높음" },
  { key: "ai_yolo", label: "YOLO 검출", aiOnly: true, title: "YOLO 가 찾은 입자 (둥글림 · 겹침 처리 후)" },
  { key: "ai_separator", label: "분리선", aiOnly: true, title: "붙은 입자를 나눈 최종 분리선 (빨강)" },
  { key: "labels", label: "입자 (색)" },
  { key: "labeled_before", label: `라벨 (${T.before.label})` },
  { key: "labeled_after", label: `라벨 (${T.after.label})` },
  { key: "contour_before", label: "윤곽선" },
  { key: "result_after", label: "분석 결과: 라벨", result: true },
  { key: "result_comparison", label: "분석 결과: 비교", result: true },
];


interface Item {
  key: string;
  name: string;
  path?: string; // 서버 폴더 이미지
  file?: File; // 업로드 이미지
  thumb: string;
  checked: boolean;
}

function joinPath(dir: string, name: string) {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.replace(/[\\/]+$/, "") + sep + name;
}

// 미리보기 결과에 영향을 주는 설정만 직렬화 (출력·공간분석 옵션 변경은 재계산 안 함)
function previewKey(p: AnalysisParams) {
  return JSON.stringify([p.engine, p.sem, p.scale, p.watershed, p.hybrid, p.measure, p.after_filter]);
}

// ───────────────────────── 페이지 ─────────────────────────

export default function AnalysisPage() {
  const router = useRouter();
  const { params, setParams, loaded } = useAnalysisParams();
  const isWs = params.engine === "watershed";

  // ── 입력
  const [source, setSource] = useState<InputMode>("upload");
  const [inputPath, setInputPath] = useState("");
  const [skipped, setSkipped] = useState<string[]>([]); // 읽을 수 없어 목록에서 뺀 업로드 파일 이름
  // 폴더 경로 예시는 운영체제에 맞춘다 (정적 페이지라 화면이 뜬 뒤에 바꾼다)
  const [pathHint, setPathHint] = useState("/Volumes/드라이브/sem_images");
  useEffect(() => {
    if (/Windows/i.test(navigator.userAgent)) setPathHint("D:\\SEM\\sem_images");
  }, []);
  const [pathErr, setPathErr] = useState<string | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [selKey, setSelKey] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState("");
  const [jobName, setJobName] = useState("");

  // ── 미리보기
  const [result, setResult] = useState<TunerSegmentResponse | null>(null);
  const [resultKey, setResultKey] = useState<string>("");
  const [previewPng, setPreviewPng] = useState<string | null>(null);
  const [origUrl, setOrigUrl] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("original");
  const [segBusy, setSegBusy] = useState(false);
  const [segStage, setSegStage] = useState(""); // 미리보기 진행 단계 (AI: 모델 불러오기 → 추론)
  const [segSec, setSegSec] = useState(0);
  const [preBusy, setPreBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ── 전체 분석 (배치 job)
  const [tab, setTab] = useState<"preview" | "results">("preview");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobOpenTick, setJobOpenTick] = useState(0);
  const [job, setJob] = useState<BatchJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<BatchJobSummary[]>([]);

  const jsonInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const preTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preAbort = useRef<AbortController | null>(null);
  const segTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segAbort = useRef<AbortController | null>(null);

  const sel = useMemo(() => items.find((i) => i.key === selKey) ?? null, [items, selKey]);
  const selSrc: ImageSource | null = sel ? (sel.file ?? sel.path ?? null) : null;
  const nChecked = items.filter((i) => i.checked).length;
  const curKey = previewKey(params);
  const stale = !!result && resultKey !== `${selKey}|${curKey}`;

  // ── 업로드 파일 object URL 정리
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((i) => i.file && URL.revokeObjectURL(i.thumb));
    };
  }, []);

  // ── 서버 폴더 → 이미지 목록
  useEffect(() => {
    if (source !== "server_path") return;
    const dir = inputPath.trim();
    if (!dir) {
      setItems((prev) => (prev.some((i) => i.path) ? [] : prev));
      setPathErr(null);
      return;
    }
    let alive = true; // 경로나 입력 방식이 바뀐 뒤 늦게 도착한 목록은 버린다
    const t = setTimeout(async () => {
      try {
        const r = await fsList(dir, undefined, 0);
        if (!alive) return;
        setPathErr(null);
        const next: Item[] = r.images.map((n) => {
          const p = joinPath(r.path, n);
          return { key: p, name: n, path: p, thumb: fsThumbUrl(p), checked: true };
        });
        setItems(next);
        setSelKey(next[0]?.key ?? null);
      } catch (e) {
        if (!alive) return;
        setPathErr((e as Error).message);
        setItems([]);
        setSelKey(null);
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [inputPath, source]);

  const onUpload = async (fs: File[]) => {
    // 창 안의 브라우저가 디스크에서 읽지 못하는 파일은 미리 뺀다 (전체 경로가 260자를 넘는 깊은 폴더, 고른 뒤 옮기거나 지운 파일 등).
    // 섞여 있으면 미리보기가 'Failed to fetch' 로 실패하고, 전체 분석은 요청 자체가 실패해 나머지 사진까지 분석되지 않는다.
    const { ok: imgs, bad } = await splitReadable(fs.filter(isImageFile));
    // 오류 칸(error)은 이미지 선택이 바뀔 때 지워지므로, 업로드 칸 아래에 따로 남긴다
    setSkipped(bad);
    items.forEach((i) => i.file && URL.revokeObjectURL(i.thumb));
    const batchId = Date.now();
    const next = imgs.map((f, idx) => ({
      key: `${f.name}-${f.size}-${idx}-${batchId}`,
      name: f.name,
      file: f,
      thumb: URL.createObjectURL(f),
      checked: true,
    }));
    setItems(next);
    setSelKey(next[0]?.key ?? null);
  };

  const switchSource = (s: InputMode) => {
    if (s === source) return;
    items.forEach((i) => i.file && URL.revokeObjectURL(i.thumb));
    setSkipped([]);
    setSource(s);
    setItems([]);
    setSelKey(null);
  };

  // ── 선택 이미지 바뀌면 미리보기 초기화
  useEffect(() => {
    // 진행 중이던 미리보기는 취소 — 늦게 도착한 이전 이미지의 결과가 새 이미지 것으로 표시되지 않게
    segAbort.current?.abort();
    preAbort.current?.abort();
    if (segTimer.current) clearTimeout(segTimer.current);
    setSegBusy(false);
    setResult(null);
    setResultKey("");
    setPreviewPng(null);
    setError(null);
    setView("original");
    if (!sel) {
      setOrigUrl(null);
      return;
    }
    // 브라우저가 TIFF 를 그리지 못하므로, 업로드한 TIFF 의 원본 보기는 서버가 만든 이미지를 쓴다
    const tiff = !!sel.file && /\.tiff?$/i.test(sel.name);
    setOrigUrl(sel.file ? (tiff ? null : sel.thumb) : fsThumbUrl(sel.path!, 2048));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey]);

  // ── 전처리 미리보기 (전처리 설정이 바뀌면 300ms 후)
  const requestPreprocess = useCallback((p: AnalysisParams, src: ImageSource | null) => {
    if (!src) return;
    if (preTimer.current) clearTimeout(preTimer.current);
    preTimer.current = setTimeout(async () => {
      preAbort.current?.abort();
      const ctrl = new AbortController();
      preAbort.current = ctrl;
      setPreBusy(true);
      try {
        const r = await tunerPreprocess(src, p, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setPreviewPng(r.preview_png);
        setView((v) => (v === "original" ? "preprocessed" : v));
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(`전처리 미리보기 실패: ${(e as Error).message}`);
      } finally {
        if (!ctrl.signal.aborted) setPreBusy(false);
      }
    }, 300);
  }, []);

  const onSemChange = useCallback((next: AnalysisParams) => requestPreprocess(next, selSrc), [requestPreprocess, selSrc]);

  // ── 미리보기 진행 표시: 경과 시간 + AI 는 모델을 불러오는 중인지 추론 중인지
  useEffect(() => {
    if (!segBusy) return;
    const t0 = Date.now();
    setSegSec(0);
    let alive = true;
    const tick = setInterval(() => setSegSec(Math.floor((Date.now() - t0) / 1000)), 500);
    let poll: ReturnType<typeof setInterval> | null = null;
    if (params.engine === "ai_hybrid") {
      setSegStage("AI 준비 중");
      const check = () =>
        health()
          .then((h) => {
            if (!alive) return;
            if (h.ai_loaded) {
              setSegStage("AI 추론 중");
              if (poll) clearInterval(poll);
            } else setSegStage("AI 모델 불러오는 중 (첫 실행은 10~20초)");
          })
          .catch(() => {});
      check();
      poll = setInterval(check, 1500);
    } else setSegStage("분할 · 측정 중");
    return () => {
      alive = false;
      clearInterval(tick);
      if (poll) clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segBusy]);

  // ── 미리보기 (분할 + 측정)
  const runPreview = useCallback(
    async (p: AnalysisParams = params) => {
      if (!selSrc) return;
      segAbort.current?.abort();
      const ctrl = new AbortController();
      segAbort.current = ctrl;
      setSegBusy(true);
      setError(null);
      try {
        const r = await tunerSegment(selSrc, p, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setResult(r);
        setResultKey(`${selKey}|${previewKey(p)}`);
        const def: ViewKey = p.engine === "ai_hybrid" ? "labeled_before" : "labeled_after";
        setView((v) => (v === "original" || v === "preprocessed" || v.startsWith("result_") || (v === "labeled_after" && def === "labeled_before") ? def : v));
        setTab("preview");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(`미리보기 실패: ${(e as Error).message}`);
      } finally {
        if (!ctrl.signal.aborted) setSegBusy(false);
      }
    },
    [params, selSrc, selKey],
  );

  // 이미지 선택 시: 전처리 미리보기 + (Watershed 면) 분할 미리보기
  useEffect(() => {
    if (!loaded || !selSrc) return;
    requestPreprocess(params, selSrc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey, loaded]);

  // Watershed: 설정이 바뀌면 자동 미리보기 (700ms 디바운스)
  useEffect(() => {
    if (!loaded || !selSrc || !isWs) return;
    if (segTimer.current) clearTimeout(segTimer.current);
    segTimer.current = setTimeout(() => runPreview(params), 700);
    return () => {
      if (segTimer.current) clearTimeout(segTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curKey, selKey, loaded, isWs]);

  useEffect(
    () => () => {
      if (preTimer.current) clearTimeout(preTimer.current);
      if (segTimer.current) clearTimeout(segTimer.current);
      preAbort.current?.abort();
      segAbort.current?.abort();
    },
    [],
  );

  // ── 작업 목록 · 폴링
  const refreshJobs = useCallback(async () => {
    try {
      const list = await listJobs();
      setJobs([...list].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))));
    } catch {
      /* 백엔드 미기동 */
    }
  }, []);
  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let fails = 0;
    const tick = async () => {
      try {
        const j = await getJob(jobId);
        if (!alive) return;
        fails = 0;
        setJob(j);
        if (j.status === "done" || j.status === "error" || j.status === "cancelled") {
          refreshJobs();
          return;
        }
      } catch (e) {
        if (!alive) return;
        // 한 번 실패했다고 멈추지 않는다 (서버가 잠깐 바쁠 수 있음). 계속 실패하면 알리고 멈춘다.
        if (++fails >= 5) {
          setError(`작업 조회 실패: ${(e as Error).message}`);
          return;
        }
      }
      if (alive) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, jobOpenTick, refreshJobs]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [job?.log?.length]);

  const running = job?.status === "running" || job?.status === "queued";
  const canRunAll = loaded && !submitting && !running && nChecked > 0 && !pathErr;

  const runAll = async () => {
    if (!canRunAll) return;
    setSubmitting(true);
    setError(null);
    setJob(null);
    try {
      const checked = items.filter((i) => i.checked);
      const r = await createBatchJob({
        params,
        inputMode: source,
        inputPath: inputPath.trim(),
        outputDir: outputDir.trim(),
        jobName: jobName.trim(),
        files: source === "upload" ? checked.map((i) => i.file!).filter(Boolean) : [],
        include: source === "server_path" && checked.length < items.length ? checked.map((i) => i.name) : undefined,
      });
      setJobId(r.job_id);
      setTab("results");
      refreshJobs();
    } catch (e) {
      setError(`분석 시작 실패: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    if (!jobId) return;
    try {
      await cancelJob(jobId);
    } catch (e) {
      setError(`취소 실패: ${(e as Error).message}`);
    }
  };

  const openJob = (id: string) => {
    setError(null);
    if (id !== jobId) setJob(null);
    setJobId(id);
    setJobOpenTick((n) => n + 1); // 같은 작업을 다시 눌러도 새로 불러온다
    setTab("results");
  };

  // ── 결과
  const batch = job?.result ?? null;
  const selBatch = useMemo(() => (sel && batch ? batch.images.find((im) => im.filename === sel.name) ?? null : null), [sel, batch]);
  const doneNames = useMemo(() => new Set((batch?.images ?? []).map((im) => im.filename)), [batch]);


  // ── 뷰어
  const viewSrc = useMemo((): string | null => {
    const v = result?.views;
    switch (view) {
      case "original":
        return origUrl ?? v?.original ?? previewPng ?? null;
      case "preprocessed":
        return previewPng ?? v?.preprocessed ?? null;
      case "result_after":
        return selBatch?.files.labeled_after && jobId ? jobFileUrl(jobId, selBatch.files.labeled_after) : null;
      case "result_comparison":
        return selBatch?.files.comparison && jobId ? jobFileUrl(jobId, selBatch.files.comparison) : null;
      default:
        return (v as Record<string, string | null | undefined> | undefined)?.[view] ?? null;
    }
  }, [view, origUrl, previewPng, result, selBatch, jobId]);

  const viewAvailable = (k: ViewKey): boolean => {
    // 업로드한 TIFF 는 브라우저가 그리지 못해 origUrl 이 없다 → 미리보기 결과의 원본(서버가 그린 것)이 있으면 쓸 수 있다
    if (k === "original") return !!origUrl || !!result?.views.original;
    if (k === "preprocessed") return !!previewPng || !!result?.views.preprocessed;
    if (k === "result_after") return !!selBatch?.files.labeled_after;
    if (k === "result_comparison") return !!selBatch?.files.comparison;
    return !!(result?.views as Record<string, string | null | undefined> | undefined)?.[k];
  };

  // ── JSON · 화면 이동
  const onImportJson = async (f: File) => {
    try {
      const { params: p, source: src } = importParamsJson(await f.text(), params);
      setParams(p);
      setNotice(src === "legacy" ? "레거시 데스크톱 설정을 변환해 불러왔습니다." : "설정을 불러왔습니다.");
      requestPreprocess(p, selSrc);
      setTimeout(() => setNotice(null), 3500);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const goAiLab = async () => {
    saveParams(params);
    if (sel?.file) setHandoffImages([sel.file]);
    else if (sel?.path) {
      try {
        const blob = await fetch(fsFileUrl(sel.path)).then((r) => r.blob());
        setHandoffImages([new File([blob], sel.name, { type: blob.type || "application/octet-stream" })]);
      } catch {
        /* 이미지 없이 이동 */
      }
    }
    router.push("/hybrid-lab");
  };

  const setAllChecked = (v: boolean) => setItems((prev) => prev.map((i) => ({ ...i, checked: v })));
  const toggleItem = (key: string) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, checked: !i.checked } : i)));

  const dBefore: DValues | undefined = result?.d_values_before;
  const dAfter: DValues | undefined = result?.d_values_after;

  // ── 우측 설정 패널 폭 (AI 진단과 같은 키로 공유, 드래그 조절)
  const { rightW, startResize } = useRightPanelWidth();

  const meta = ((result as unknown as { engine_meta?: Record<string, number> } | null)?.engine_meta ?? {}) as { n_yolo?: number; K_unet_anchor?: number; tau?: number };
  const cropPx = (result as unknown as { crop_bottom_px?: number } | null)?.crop_bottom_px;

  return (
    <div className="min-h-screen text-text font-sans overflow-x-hidden">
      {/* ── 상단 안내 바 (AI 진단과 같은 형식) ── */}
      <div className="w-full px-4 lg:px-6 pt-3 flex items-center gap-2 text-[11px] text-text-mute">
        <span className="font-semibold text-text text-[12px] whitespace-nowrap flex-shrink-0">분석</span>
        <span className="truncate">이미지 목록에서 한 장 골라 미리보기로 설정을 맞추고, 체크한 이미지 전체를 분석해 Excel · PPT 를 만듭니다. 설정은 AI 진단과 공유됩니다.</span>
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          <button type="button" className={PILL(false) + " inline-flex items-center gap-1"} onClick={() => downloadParamsJson(params)} title="설정 JSON 저장">
            <Download size={11} /> 설정 저장
          </button>
          <button type="button" className={PILL(false) + " inline-flex items-center gap-1"} onClick={() => jsonInputRef.current?.click()} title="설정 JSON 불러오기">
            <Upload size={11} /> 불러오기
          </button>
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportJson(f);
              e.target.value = "";
            }}
          />
          <button type="button" className="btn-primary h-7 px-3 text-[11px] inline-flex items-center gap-1" onClick={goAiLab} title="선택한 이미지와 설정으로 AI 진단 열기">
            AI 진단으로 <ArrowRight size={12} />
          </button>
        </div>
      </div>

      <div
        className="w-full px-4 lg:px-6 py-4 lg:py-5 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_var(--right-w)] gap-4 lg:gap-5"
        style={{ ["--right-w" as string]: `${rightW}px` } as React.CSSProperties}
      >
        {/* ── 좌측: 입력 · 목록 · 실행 ── */}
        <section className="space-y-3 min-w-0">
          <div className="app-card p-4 space-y-3">
            <h2 className="text-sm font-semibold">입력 파일</h2>
            <div className="grid grid-cols-2 gap-1">
              {(
                [
                  { v: "upload", l: "업로드" },
                  { v: "server_path", l: "폴더 경로" },
                ] as { v: InputMode; l: string }[]
              ).map((o) => (
                <button key={o.v} type="button" className={PILL(source === o.v)} onClick={() => switchSource(o.v)}>
                  {o.l}
                </button>
              ))}
            </div>
            {source === "server_path" ? (
              <>
                <div className="flex gap-1">
                  <input
                    type="text"
                    className="flex-1 min-w-0 border border-line rounded-md px-2 py-1.5 text-xs bg-white font-mono"
                    placeholder={pathHint}
                    value={inputPath}
                    onChange={(e) => setInputPath(e.target.value)}
                  />
                  <button type="button" className={PILL(false) + " inline-flex items-center"} onClick={() => setBrowserOpen(true)} title="폴더 탐색">
                    <FolderSearch size={13} />
                  </button>
                </div>
                {pathErr && <div className="text-[10.5px] text-danger">{pathErr}</div>}
              </>
            ) : (
              <>
                <Dropzone multiple onFiles={onUpload} filled={items.length > 0} compact accept=".jpg,.jpeg,.png,.tif,.tiff,.bmp,image/*" />
                {skipped.length > 0 && (
                  <div className="text-[11px] text-danger bg-danger-soft border border-danger-line rounded-md px-3 py-2 break-words" data-testid="skipped-files">
                    읽을 수 없는 파일 {skipped.length}개를 목록에서 뺐습니다: {skipped.slice(0, 3).join(", ")}
                    {skipped.length > 3 ? " …" : ""} — 폴더 경로가 너무 길거나(260자 초과) 파일을 옮겼을 수 있습니다. 짧은 경로로 옮기거나 &apos;폴더 경로&apos; 방식을 쓰세요.
                  </div>
                )}
                <p className="text-[10.5px] text-text-faint leading-snug">
                  올린 이미지는 새로고침하면 사라지고, 전체 분석 때 서버로 다시 전송됩니다. 이미지가 많으면 <b className="font-semibold text-text-mute">폴더 경로</b>가 더 빠릅니다.
                </p>
              </>
            )}
          </div>

          <div className="app-card p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="text-sm font-semibold">
                이미지 목록 <span className="text-[11px] text-fg-faint font-medium ml-0.5">{nChecked}/{items.length}</span>
              </h2>
              {items.length > 0 && (
                <div className="flex gap-1">
                  <button type="button" className="text-[10.5px] px-1.5 py-0.5 rounded text-fg-mute hover:text-fg hover:bg-edge-soft" onClick={() => setAllChecked(true)}>
                    전체 선택
                  </button>
                  <button type="button" className="text-[10.5px] px-1.5 py-0.5 rounded text-fg-mute hover:text-fg hover:bg-edge-soft" onClick={() => setAllChecked(false)}>
                    해제
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-y-auto -mx-1.5" style={{ maxHeight: "calc(100vh - 540px)", minHeight: 110 }}>
              {items.length === 0 && <div className="px-1.5 py-3 text-[11px] text-fg-faint">폴더 경로를 입력하거나 이미지를 올리세요.</div>}
              {items.map((it) => (
                <div
                  key={it.key}
                  className={clsx(
                    "flex items-center gap-2 px-1.5 py-1 rounded-md cursor-pointer border",
                    it.key === selKey ? "border-fg bg-surface-soft" : "border-transparent hover:bg-edge-soft",
                  )}
                  onClick={() => setSelKey(it.key)}
                >
                  <button
                    type="button"
                    className="text-fg-mute flex-shrink-0"
                    title="전체 분석에 포함"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleItem(it.key);
                    }}
                  >
                    {it.checked ? <CheckSquare size={14} className="text-fg" /> : <Square size={14} />}
                  </button>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.thumb} alt="" loading="lazy" className="w-10 h-8 object-cover rounded border border-edge-strong bg-black flex-shrink-0" />
                  <span className={clsx("text-[11px] truncate flex-1", it.checked ? "text-fg" : "text-fg-faint line-through")} title={it.name}>
                    {it.name}
                  </span>
                  {doneNames.has(it.name) && <span className="w-1.5 h-1.5 rounded-full bg-[#009f50] flex-shrink-0" title="분석 결과 있음" />}
                </div>
              ))}
            </div>
          </div>

          <div className="app-card p-4 space-y-2">
            <h2 className="text-sm font-semibold">{T.engine.label}</h2>
            <EngineSwitch value={params.engine} onChange={(v) => setParams({ ...params, engine: v })} />
            <div className="text-[10.5px] text-fg-faint leading-snug">
              {isWs ? `${T.engineWatershed.hint} · 설정을 바꾸면 미리보기 자동 갱신` : `${T.engineAi.hint} · 설정을 바꾼 뒤 미리보기 버튼`}
            </div>
          </div>

          <button
            type="button"
            className="w-full py-2.5 rounded-md border border-edge-strong bg-white text-[12.5px] font-semibold text-fg hover:border-fg flex items-center justify-center gap-2 disabled:opacity-50"
            disabled={!sel || segBusy}
            onClick={() => runPreview()}
            title={T.preview.hint}
          >
            {segBusy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {segBusy ? `${segStage || "계산 중"}… ${segSec}초` : `${T.preview.label}${sel ? " (선택 1장)" : ""}`}
          </button>
          <button
            type="button"
            className="btn-primary w-full py-3 rounded-md font-semibold text-[13px] flex items-center justify-center gap-2"
            disabled={!canRunAll}
            onClick={runAll}
            title={T.runAll.hint}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {T.runAll.label} {nChecked > 0 && `(${nChecked}장)`}
          </button>
          {running && (
            <button type="button" className="w-full py-2 rounded-md border border-danger-line text-danger text-[11.5px] hover:bg-danger-soft inline-flex items-center justify-center gap-1" onClick={cancel}>
              <Square size={11} /> 분석 취소
            </button>
          )}

          {error && <div className="text-[11px] text-danger bg-danger-soft border border-danger-line rounded-md px-3 py-2 break-words">{error}</div>}
          {notice && <div className="text-[11px] text-[#007a3d] bg-[#f0fdf4] border border-[#bbf7d0] rounded-md px-3 py-2 fade-in">{notice}</div>}

          <details className="app-card p-4 text-[11px] group">
            <summary className="cursor-pointer text-sm font-semibold select-none">저장 옵션</summary>
            <div className="mt-3 space-y-2">
              <label className="block text-xs">
                <div className="mb-1 text-text-mute">출력 폴더</div>
                <input type="text" className="w-full border border-line rounded-md px-2 py-1.5 text-xs bg-white font-mono" placeholder="비우면 runs/<일시>_<이름>" value={outputDir} onChange={(e) => setOutputDir(e.target.value)} />
              </label>
              <label className="block text-xs">
                <div className="mb-1 text-text-mute">작업 이름</div>
                <input type="text" className="w-full border border-line rounded-md px-2 py-1.5 text-xs bg-white" placeholder="예: 샘플A 1차" value={jobName} onChange={(e) => setJobName(e.target.value)} />
              </label>
            </div>
          </details>

          <details className="app-card p-4 text-[11px]">
            <summary className="cursor-pointer text-sm font-semibold select-none flex items-center">
              최근 분석 <span className="text-[11px] text-fg-faint font-medium ml-1">{jobs.length}</span>
              <button
                type="button"
                className="ml-auto w-6 h-6 rounded-md hover:bg-edge-soft inline-flex items-center justify-center text-fg-faint"
                title="새로고침"
                onClick={(e) => {
                  e.preventDefault();
                  refreshJobs();
                }}
              >
                <RefreshCw size={11} />
              </button>
            </summary>
            <div className="mt-2 max-h-[220px] overflow-y-auto -mx-1.5">
              {jobs.length === 0 && <div className="px-1.5 py-2 text-fg-faint">아직 없습니다 (서버 재시작 시 초기화)</div>}
              {jobs.map((j) => (
                <button
                  key={j.job_id}
                  type="button"
                  className={clsx("w-full text-left px-1.5 py-1.5 rounded-md hover:bg-edge-soft flex items-center gap-2", j.job_id === jobId && "bg-surface-soft")}
                  onClick={() => openJob(j.job_id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate text-fg">{j.name || j.job_id}</div>
                    <div className="text-[10px] text-fg-faint truncate font-mono">
                      {j.n_images}장 · {fmtTime(j.created_at)}
                    </div>
                  </div>
                  <Chip tone={statusTone(j.status)} className="!py-0 !px-1.5 !text-[9px]">
                    {STATUS_KO[j.status] ?? j.status}
                    {j.status === "running" ? ` ${Math.round(j.progress)}%` : ""}
                  </Chip>
                </button>
              ))}
            </div>
          </details>
        </section>

        {/* ── 중앙: 미리보기 / 분석 결과 ── */}
        <section className="space-y-3 min-w-0">
          <div className="app-card p-4 min-w-0">
            {/* 간결한 헤더 — 큰 숫자 위주 */}
            <div className="flex items-end justify-between gap-4 flex-wrap mb-3">
              <div className="flex items-end gap-5 flex-wrap">
                <BigStat label="이미지" value={items.length} unit="장" sub={items.length ? `체크 ${nChecked}` : undefined} />
                <BigStat label={T.nParticles.label} value={result ? result.n_after : "–"} unit="개" sub={result ? `${T.before.label} ${result.n_before}` : undefined} dim={!result} />
                <BigStat label="D50" value={result ? fmt(dAfter?.d50, 2) : "–"} unit="μm" sub={result ? `${T.before.label} ${fmt(dBefore?.d50, 2)}` : undefined} dim={!result} />
                <BigStat label="엔진" value={isWs ? "Watershed" : "AI Hybrid"} small />
              </div>
              <div className="flex gap-1">
                <button type="button" className={PILL(tab === "preview")} onClick={() => setTab("preview")}>
                  {T.preview.label}
                </button>
                <button type="button" className={PILL(tab === "results")} onClick={() => setTab("results")}>
                  분석 결과{job ? ` · ${STATUS_KO[job.status] ?? job.status}${running ? ` ${Math.round(job.progress)}%` : ""}` : ""}
                </button>
              </div>
            </div>

            {tab === "preview" ? (
              <>
                {/* 뷰 selector */}
                <div className="flex flex-wrap gap-1 mb-3 items-center">
                  {VIEWS.filter((v) => (!v.result || viewAvailable(v.key)) && !(v.wsOnly && !isWs) && !(v.aiOnly && isWs)).map((v) => {
                    const disabled = !viewAvailable(v.key);
                    return (
                      <button key={v.key} type="button" className={PILL(view === v.key) + " disabled:opacity-40 disabled:cursor-not-allowed"} disabled={disabled} onClick={() => setView(v.key)} title={v.title}>
                        {v.label}
                      </button>
                    );
                  })}
                  {(segBusy || preBusy) && (
                    <span className="ml-auto text-[10.5px] text-fg-faint inline-flex items-center gap-1">
                      <Loader2 size={11} className="animate-spin" /> {segBusy ? `${segStage || "미리보기 계산 중"} · ${segSec}초` : "전처리"}
                    </span>
                  )}
                  {stale && !segBusy && !preBusy && (
                    <span className="ml-auto text-[10.5px] text-warn bg-warn-soft border border-warn-line rounded-md px-2 py-0.5">
                      {isWs ? "갱신 대기" : "설정 변경됨 — 미리보기를 다시 실행하세요"}
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-fg-mute mb-2 flex flex-wrap gap-x-4 gap-y-0.5 min-h-[16px]">
                  {sel && <span className="truncate max-w-[260px]" title={sel.name}>파일 <b className="text-fg">{sel.name}</b></span>}
                  {result && (
                    <>
                      <span>
                        {T.nParticles.label} <b className="text-fg">{result.n_after}</b>
                        <span className="text-fg-faint"> / {T.before.label} {result.n_before}</span>
                      </span>
                      {!isWs && typeof meta.n_yolo === "number" && (
                        <span>YOLO 검출 <b className="text-fg">{meta.n_yolo}</b></span>
                      )}
                      {!isWs && typeof meta.K_unet_anchor === "number" && (
                        <span>U-Net anchor <b className="text-fg">{meta.K_unet_anchor}</b></span>
                      )}
                      {!isWs && typeof meta.tau === "number" && (
                        <span>τ (Otsu) <b className="text-fg">{meta.tau.toFixed(2)}</b></span>
                      )}
                      {typeof cropPx === "number" && cropPx > 0 && (
                        <span>하단 크롭 <b className="text-fg">{cropPx}px</b></span>
                      )}
                      <span>스케일 <b className="text-fg">{result.pixel_to_micro.toFixed(4)}</b> μm/px</span>
                      <span className="text-fg-faint">
                        {result.timing_ms.segment?.toFixed(0)}ms
                      </span>
                    </>
                  )}
                </div>

                <div className={clsx("rounded-md border border-edge bg-surface-soft", stale && "opacity-80")} style={{ height: "calc(100vh - 360px)", minHeight: 380 }}>
                  <ImageViewer
                    src={viewSrc}
                    label={`${VIEWS.find((v) => v.key === view)?.label ?? view}${sel ? ` — ${sel.name}` : ""}`}
                    downloadName={sel ? `${sel.name.replace(/\.[^.]+$/, "")}_${view}.png` : undefined}
                    emptyText={sel ? (isWs ? "계산 중…" : "미리보기를 누르세요") : "왼쪽에서 폴더를 열거나 이미지를 올리세요"}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-3">
                {!jobId && (
                  <div className="py-10 text-center text-[12px] text-fg-faint">
                    이미지를 체크하고 <b className="text-fg">{T.runAll.label}</b>을 누르면 결과가 여기에 표시됩니다.
                  </div>
                )}
                {jobId && !job && (
                  <div className="py-6 text-[12px] text-fg-faint flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin" /> 불러오는 중…
                  </div>
                )}
                {job && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Chip tone={statusTone(job.status)} dot>
                        {STATUS_KO[job.status] ?? job.status}
                      </Chip>
                      <span className="text-[12px] font-semibold truncate text-fg">{job.name || job.job_id}</span>
                      <span className="text-[10.5px] text-fg-faint ml-auto">{job.n_images}장</span>
                    </div>
                    <ProgressBar value={job.progress} indeterminate={job.status === "queued"} tone={job.status === "error" ? "bad" : job.status === "done" ? "good" : "dark"} />
                    <div className="text-[11px] text-fg-mute truncate">{job.message}</div>
                    {job.error && <div className="text-[11px] text-danger bg-danger-soft border border-danger-line rounded-md px-3 py-2 whitespace-pre-wrap break-words">{job.error}</div>}
                    {job.log?.length > 0 && (
                      <details open={running} className="text-[10.5px] text-fg-faint group">
                        <summary className="cursor-pointer select-none hover:text-fg-mute">로그 ({job.log.length})</summary>
                        <div ref={logRef} className="mt-1.5 max-h-40 overflow-y-auto font-mono text-[10px] text-fg-mute bg-surface-soft border border-edge rounded px-2 py-1.5 space-y-0.5">
                          {job.log.map((l, i) => (
                            <div key={i} className="whitespace-pre-wrap break-all">
                              {l}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
                {batch && jobId && (
                  <div className="text-[10.5px] text-fg-faint">
                    왼쪽 목록에서 이미지를 고르면 {T.preview.label} 탭에서 그 이미지의 분석 결과(라벨 · 비교)를 볼 수 있습니다.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 미리보기: 입도 · 입자 표 */}
          {tab === "preview" && <ParticleTableCard result={result} />}

          {tab === "results" && batch && jobId && <ResultsPanel key={jobId} batch={batch} jobId={jobId} />}
        </section>

        {/* ── 우측: 설정 (가로 폭 드래그 조절) ── */}
        <aside className={clsx("relative min-w-0 lg:max-h-[calc(100vh-90px)] lg:overflow-y-auto lg:sticky lg:top-[68px] pr-1", !loaded && "opacity-50")}>
          <div
            className="resize-handle hidden lg:flex"
            title="드래그로 너비 조절"
            onMouseDown={startResize}
          />
          <ParamsPanel params={params} onChange={setParams} mode="batch" onSemChange={onSemChange} disabled={running} />
        </aside>
      </div>

      {browserOpen && (
        <FolderBrowser
          initial={inputPath}
          onClose={() => setBrowserOpen(false)}
          onSelect={(p) => {
            setInputPath(p);
            setBrowserOpen(false);
          }}
        />
      )}

    </div>
  );
}
