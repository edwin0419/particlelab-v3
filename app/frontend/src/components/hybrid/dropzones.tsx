"use client";

import { useRef, useState } from "react";

import { splitReadable } from "@/components/ui/Dropzone";


export function MultiFileDropzone({
  files, setFiles, label, emptyText, emptyHint,
}: {
  files: File[];
  setFiles: (fs: File[]) => void;
  label: string;
  emptyText: string;
  emptyHint?: string;
}) {
  const [hover, setHover] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function add(newFiles: FileList | File[] | null) {
    if (!newFiles) return;
    // 브라우저가 디스크에서 읽지 못하는 파일(전체 경로 260자 초과, 옮긴 파일 등)은 빼고 알린다
    const { ok: arr, bad } = await splitReadable(Array.from(newFiles).filter((f) => f.type.startsWith("image/")));
    setSkipped(bad);
    if (arr.length === 0) return;
    const merged = [...files];
    for (const f of arr) {
      if (!merged.some((g) => g.name === f.name && g.size === f.size)) {
        merged.push(f);
      }
    }
    setFiles(merged);
  }

  function remove(i: number) {
    setFiles(files.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="text-[11.5px] font-medium mb-1.5 flex items-center justify-between">
        <span className="text-text">{label}</span>
        {files.length > 0 && (
          <span className="text-[10px] text-text-mute bg-[#f0f0e8] px-1.5 py-0.5 rounded-full font-mono">
            {files.length}장
          </span>
        )}
      </div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHover(false);
          add(e.dataTransfer.files);
        }}
        className={
          "dropzone cursor-pointer text-center text-xs px-3 py-4 " +
          (hover ? "dropzone-active " : "") +
          (files.length > 0 ? "dropzone-filled " : "")
        }
      >
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <div className="font-semibold">{emptyText}</div>
            {emptyHint && <div className="text-[10.5px] opacity-75">{emptyHint}</div>}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-good font-semibold">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            더 추가 — 클릭 / 드래그
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => add(e.target.files)}
        />
      </div>

      {skipped.length > 0 && (
        <div className="mt-1.5 text-[10.5px] text-bad leading-snug break-words">
          읽을 수 없는 파일 {skipped.length}개를 뺐습니다: {skipped.slice(0, 3).join(", ")}{skipped.length > 3 ? " …" : ""} — 폴더 경로가 너무 길거나(260자 초과) 파일을 옮겼을 수 있습니다.
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto pr-0.5">
          {files.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="flex items-center justify-between gap-2 text-[11px]
                         px-2 py-1 bg-white border border-line-soft rounded-md
                         hover:border-line-strong transition"
            >
              <span className="truncate text-text" title={f.name}>{f.name}</span>
              <span className="text-text-faint flex-shrink-0 font-mono text-[10px]">
                {(f.size / 1024).toFixed(0)} KB
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); remove(i); }}
                className="text-text-faint hover:text-bad flex-shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-[#fff1f1] text-base leading-none"
                aria-label="제거"
              >
                ×
              </button>
            </div>
          ))}
          {files.length > 1 && (
            <button
              onClick={() => setFiles([])}
              className="text-[10px] text-text-faint hover:text-bad underline decoration-dotted"
            >
              모두 비우기 ({files.length}장)
            </button>
          )}
        </div>
      )}
    </div>
  );
}


export function SingleFileDropzone({
  label, hint, file, onChange, accept, isDefault, onRevertToDefault,
}: {
  label: string;
  hint?: string;
  file: File | null;
  onChange: (f: File | null) => void;
  accept?: string;
  /** 현재 file 이 자동 로드된 기본 모델일 때 true → "기본" 배지 표시 */
  isDefault?: boolean;
  /** 사용자가 교체한 상태에서 기본 모델로 되돌릴 수 있을 때 콜백 */
  onRevertToDefault?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(fs: FileList | File[] | null) {
    if (!fs) return;
    const arr = Array.from(fs);
    if (arr.length === 0) return;
    onChange(arr[0]);
  }

  return (
    <div>
      <div className="text-[11.5px] font-medium mb-1.5 text-text">{label}</div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHover(false);
          pick(e.dataTransfer.files);
        }}
        className={
          "dropzone cursor-pointer text-center px-3 py-3 min-w-0 " +
          (hover ? "dropzone-active " : "") +
          (file ? "dropzone-filled " : "")
        }
      >
        {file ? (
          <div className="min-w-0 flex items-center gap-2 text-left">
            <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                 style={{ background: isDefault ? "rgba(25,25,25,0.08)" : "rgba(18,138,79,0.12)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isDefault ? "#191919" : "#128a4f"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className={"text-[11.5px] font-semibold truncate " + (isDefault ? "text-fg" : "text-[#0d6e3f]")} title={file.name}>
                  {file.name}
                </div>
                {isDefault && (
                  <span className="text-[8.5px] font-bold px-1.5 py-[1px] rounded-full bg-fg text-white tracking-wider flex-shrink-0">
                    기본
                  </span>
                )}
              </div>
              <div className="text-[10px] text-text-mute mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="font-mono">{(file.size / 1024).toFixed(1)} KB</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onChange(null); }}
                  className="text-text-faint hover:text-bad underline decoration-dotted"
                >
                  교체
                </button>
                {onRevertToDefault && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRevertToDefault(); }}
                    className="text-text-faint hover:text-fg underline decoration-dotted"
                  >
                    기본값으로
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-[11.5px] text-text-mute">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="opacity-70 flex-shrink-0">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <div className="text-left min-w-0">
              <div className="font-semibold">파일을 끌어다 놓거나 클릭</div>
              {hint && <div className="text-[10px] opacity-75 truncate">{hint}</div>}
              {onRevertToDefault && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRevertToDefault(); }}
                  className="text-[10px] text-fg underline decoration-dotted mt-0.5"
                >
                  기본 모델 다시 불러오기
                </button>
              )}
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => pick(e.target.files)}
        />
      </div>
    </div>
  );
}
