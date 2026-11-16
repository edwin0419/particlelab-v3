"use client";

export function InferenceProgressCard({
  label, total, startMs, tick, firstCallNote,
}: {
  label: string;
  total: number;
  startMs: number | null;
  tick: number;
  firstCallNote: string | null;
}) {
  void tick; // tick prop triggers re-render every 300ms
  const start = startMs ?? Date.now();
  const elapsed = Math.max(0, (Date.now() - start) / 1000);
  // 휴리스틱: 첫 호출 모델 로드 ~6s + 이미지당 ~3.5s
  const perImage = 3.5;
  const warmup = 6.0;
  const totalEst = Math.max(warmup + (total || 1) * perImage, 8);
  // 점근식 진행 — 응답 도착 전까지 95% 에서 멈춤
  const raw = elapsed / totalEst;
  const progress = Math.min(0.96, 1 - Math.exp(-raw * 0.9));
  const etaSec = Math.max(0, totalEst - elapsed);
  const overTime = elapsed > totalEst * 1.05;

  const fmt = (s: number) => {
    if (!Number.isFinite(s)) return "—";
    if (s < 60) return `${s.toFixed(0)}초`;
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}분 ${sec.toString().padStart(2,"0")}초`;
  };
  const doneEst = Math.min(total, Math.round(progress * (total || 1)));

  return (
    <div className="app-card p-5 fade-in">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[13px] font-semibold text-fg">{label} 진행 중</div>
          <div className="text-[11px] text-fg-faint mt-0.5">
            {total > 0
              ? <>약 <b className="text-fg">{doneEst}</b> / {total}장 처리 추정</>
              : <>서버 응답 대기 중</>
            }
          </div>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-bold text-fg leading-none tabular-nums">
            {(progress * 100).toFixed(0)}<span className="text-[12px] text-fg-faint font-medium ml-0.5">%</span>
          </div>
          <div className="text-[10px] text-fg-faint mt-0.5">예상 진행률</div>
        </div>
      </div>

      <div className="mt-3 h-1.5 bg-edge rounded-full overflow-hidden relative">
        <div
          className="h-full bg-fg transition-all duration-200"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div>
          <div className="text-[9.5px] uppercase tracking-wider text-fg-faint font-semibold">경과</div>
          <div className="text-[14px] font-semibold text-fg font-mono mt-0.5 tabular-nums">{fmt(elapsed)}</div>
        </div>
        <div>
          <div className="text-[9.5px] uppercase tracking-wider text-fg-faint font-semibold">남은 시간 (예상)</div>
          <div className={"text-[14px] font-semibold font-mono mt-0.5 tabular-nums " + (overTime ? "text-warn" : "text-fg")}>
            {overTime ? "곧 완료..." : `약 ${fmt(etaSec)}`}
          </div>
        </div>
        <div>
          <div className="text-[9.5px] uppercase tracking-wider text-fg-faint font-semibold">전체 예상</div>
          <div className="text-[14px] font-semibold text-fg font-mono mt-0.5 tabular-nums">{fmt(totalEst)}</div>
        </div>
      </div>

      {firstCallNote && (
        <div className="text-[10.5px] text-fg-faint mt-3 leading-snug">
          {firstCallNote}
        </div>
      )}
      <div className="text-[10px] text-[#cbd0d6] mt-2">
        ※ 서버 단일 응답 방식 — 진행률·남은 시간은 이미지 수와 경과시간 기반 추정값입니다.
      </div>
    </div>
  );
}


export function RunButton({
  onClick, disabled, busy, label, icon,
}: {
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
  label: string;
  icon: "play" | "train" | "download";
}) {
  const Icon = () => {
    if (icon === "play") {
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      );
    }
    if (icon === "train") {
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v6m0 8v6M4.93 4.93l4.24 4.24m5.66 5.66 4.24 4.24M2 12h6m8 0h6M4.93 19.07l4.24-4.24m5.66-5.66 4.24-4.24"/>
        </svg>
      );
    }
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    );
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        "w-full py-3 rounded-md font-semibold text-[13px] flex items-center justify-center gap-2 relative overflow-hidden " +
        (disabled ? "btn-primary" : "btn-primary")
      }
    >
      {busy ? (
        <span
          aria-hidden
          className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white"
          style={{ animation: "spinBtn 0.7s linear infinite" }}
        />
      ) : (
        <Icon />
      )}
      <span>{label}</span>
      <style jsx>{`@keyframes spinBtn { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
