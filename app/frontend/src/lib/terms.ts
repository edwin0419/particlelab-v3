// 공용 용어집 — 분석 화면(ParamsPanel)과 AI 진단 화면이 같은 이름을 쓰도록 한 곳에서 정의.
// label = 화면 표시명 (한국어), hint = 설명 + 코드상 파라미터 이름(검색·JSON 대조용).

export interface Term {
  label: string;
  hint?: string;
}

export const TERMS = {
  // ── 공통 ──
  engine: { label: "분할 엔진" },
  engineWatershed: { label: "Watershed", hint: "Otsu 이진화 + 거리변환 + 마커 기반 분할" },
  engineAi: { label: "AI Hybrid", hint: "U-Net++ × YOLO11 하이브리드 분할 (서버 기본 모델)" },
  model: { label: "모델", hint: "서버 basic_pt 의 U-Net++ · YOLO11 — 분석·AI 진단 공용" },

  preview: { label: "미리보기", hint: "선택한 이미지 1장에 현재 설정 적용" },
  runAll: { label: "전체 분석", hint: "체크한 이미지 전체를 분석해 Excel · PPT 생성" },
  runDiagnosis: { label: "진단 실행", hint: "정답 마스크와 비교해 AI 분할 평가" },

  before: { label: "필터 전", hint: "Before — 측정 필터만 통과한 입자" },
  after: { label: "필터 후", hint: "After — 원형도 · 종횡비 · 직경 필터까지 통과한 입자" },
  nParticles: { label: "입자 수" },

  // ── 전처리 · 스케일 ──
  crop: { label: "하단 정보바 자르기", hint: "SEM 하단의 배율 · 스케일바 표시줄 제거" },
  cropRatio: { label: "비율" },
  cropAuto: { label: "자동 감지" },
  cropPx: { label: "높이 (px)" },
  cropNone: { label: "안 자름" },
  cropRatioValue: { label: "자를 비율", hint: "이미지 높이 대비 (0~0.3)" },
  cropPxValue: { label: "자를 높이", hint: "하단에서 잘라낼 픽셀 수" },

  scale: { label: "스케일", hint: "μm / px 환산" },
  scaleAuto: { label: "파일명 배율", hint: "파일명의 배율(예: 5.0k)에서 계산" },
  scaleManual: { label: "직접 입력", hint: "μm/px 값을 직접 입력" },
  scaleBar: { label: "스케일바 입력", hint: "스케일바 길이(px)와 실제 길이(μm)" },
  scaleBarPx: { label: "스케일바 길이", hint: "px" },
  scaleBarUm: { label: "스케일바 실제 길이", hint: "μm" },
  scaleUmPerPx: { label: "μm/px", hint: "직접 입력 · 스케일바 미입력 시 사용 · pixel_to_micro" },
  scaleAutoDefault: { label: "배율 인식 실패 시", hint: "파일명에서 배율을 못 찾을 때 쓸 μm/px · auto_default" },

  edgeRemove: { label: "모서리 입자 제거", hint: "이미지 테두리에 닿은 입자 제외 (잘려서 작게 측정됨)" },
  irregular: { label: "불규칙 입자 기준 (원형도 <)", hint: "이 값보다 원형도가 낮으면 불규칙 입자로 집계" },

  // ── AI Hybrid 파라미터 ──
  hySection: { label: "분할 — AI Hybrid", hint: "U-Net 확률맵 × YOLO 인스턴스" },
  hyUnet: { label: "U-Net 임계" },
  hySplit: { label: "분리 · 후처리" },
  hyYolo: { label: "YOLO 추론" },
  hyRuntime: { label: "실행 환경" },
  high_thresh: { label: "확정 임계 (high)", hint: "U-Net 확률 ≥ 이 값 = 확실한 입자 (anchor) · high_thresh" },
  low_thresh: { label: "보강 임계 (low)", hint: "좁은 틈에서만 살리는 후보 영역 · low_thresh" },
  boundary_thickness: { label: "분리선 두께 (px)", hint: "YOLO 경계로 그리는 분리선. 1=얇음, 3~5=안정 · boundary_thickness" },
  min_anchor_area: { label: "최소 입자 크기 (px²)", hint: "이보다 작은 조각 제거 · min_anchor_area" },
  balance_floor: { label: "분리 균형 (d₁≈d₂)", hint: "0=느슨 / 0.25 권장 / 0.5=엄격 · balance_floor" },
  tau_scale: { label: "틈 검출 범위 (τ* 배수)", hint: "1.0=Otsu 자동값. 틈이 안 잡히면 1.3~2.0 · tau_scale" },
  yolo_conf: { label: "YOLO 신뢰도", hint: "이 값 미만 검출 무시 · conf" },
  yolo_iou: { label: "YOLO 중복 제거 IoU", hint: "NMS IoU" },
  yolo_imgsz: { label: "YOLO 입력 크기 (px)", hint: "32의 배수 · imgsz" },
  yolo_round_strength: { label: "마스크 둥글림 (σ)", hint: "0=끔, 3~5 권장. 클수록 둥글게 · yolo_round_strength" },
  yolo_remove_overlaps: { label: "겹친 영역 → 배경", hint: "겹친 픽셀을 양쪽에서 지워 분리선으로 · yolo_remove_overlaps" },
  yolo_remove_enclosed: { label: "포위된 객체 제거", hint: "큰 입자 안에 갇힌 작은 검출 삭제 · yolo_remove_enclosed" },
  enclosed_ratio: { label: "포위 판정 비율", hint: "작은 입자의 이 비율 이상이 큰 입자 안이면 제거 (0.9 권장)" },
  unet_imgsz: { label: "U-Net 입력 크기 (px)", hint: "비우면 모델 기본값" },
  device: { label: "추론 장치", hint: "auto = Apple GPU › NVIDIA GPU › CPU 순" },
} satisfies Record<string, Term>;

export const DEVICE_OPTIONS = [
  { value: "auto", label: "자동" },
  { value: "mps", label: "Apple GPU (mps)" },
  { value: "cuda", label: "NVIDIA GPU (cuda)" },
  { value: "cpu", label: "CPU" },
];
