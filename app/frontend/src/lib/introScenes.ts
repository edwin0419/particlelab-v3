// 소개(쇼릴) 장면 목록 — 소개 페이지(/intro), 영상 내보내기(tools/intro_video.py), 더빙 대본이 모두 이 파일을 쓴다.
// say = 자막이자 더빙 대본. 화면 그림은 tools/intro_capture.py 가 실제 프로그램을 조작해 캡처한다.
// 예시 데이터: 반응 시간 12h · 13h · 14h · 15h 전구체 SEM 사진 14장 (1,000배).

export type IntroVisual =
  | { kind: "title"; big: string; sub?: string }
  | { kind: "points"; heading: string; items: string[] }
  /** 실제 화면 캡처. box = shots.json 의 강조 영역 이름 (다른 캡처의 좌표를 쓰려면 "캡처.이름") */
  | { kind: "shot"; shot: string; box?: string }
  /** 단계 그림 — upto 번째까지 보여 주고 마지막 것을 강조 */
  | { kind: "steps"; items: { src: string; label: string }[]; upto: number }
  | { kind: "image"; src: string; label?: string; src2?: string; label2?: string }
  /** 설정 항목 하나 — 패널에서의 위치(panel · row) + 기본값 등(facts) + 값을 바꾸면 생기는 일(effects)
   *  + 실제 계산 예시(ex = examples.json 의 비교 쌍, img = 그림 한 장). tools/param_capture.py · param_examples.py 가 만든다. */
  | { kind: "param"; panel: string; row: string; facts: string[]; effects: [string, string][]; ex?: string; img?: { src: string; label: string } };

export interface IntroScene {
  chapter: string;
  title: string;
  say: string;
  visual: IntroVisual;
}

const WS = [
  { src: "/intro/steps/ws_original.png", label: "① 원본 사진" },
  { src: "/intro/steps/ws_binary.png", label: "② 입자(흰색)와 배경(검정)으로 나누기" },
  { src: "/intro/steps/ws_distance.png", label: "③ 가운데일수록 높은 '산' 지도" },
  { src: "/intro/steps/ws_markers.png", label: "④ 봉우리마다 씨앗(빨간 점)" },
  { src: "/intro/steps/ws_labeled_after.png", label: "⑤ 물이 만나는 선 = 입자 경계" },
];
const AI = [
  { src: "/intro/steps/ws_original.png", label: "① 원본 사진" },
  { src: "/intro/steps/ai_ai_prob.png", label: "② AI 1: 입자 영역 칠하기" },
  { src: "/intro/steps/ai_ai_yolo.png", label: "③ AI 2: 입자를 하나씩 찾기" },
  { src: "/intro/steps/ai_ai_separator.png", label: "④ 둘을 합쳐 분리선 긋기" },
  { src: "/intro/steps/ai_labeled_before.png", label: "⑤ 결과: 색 하나 = 입자 하나" },
];

export const INTRO_SCENES: IntroScene[] = [
  // ── 1. 시작 ──
  {
    chapter: "시작",
    title: "Particle Lab 소개",
    say: "안녕하세요. Particle Lab을 소개합니다. Particle Lab은 전자현미경 사진 속 입자를 하나하나 찾아서, 크기와 모양을 자동으로 재 주는 프로그램입니다.",
    visual: { kind: "title", big: "Particle Lab", sub: "SEM 사진 한 장에서 입도 분포까지" },
  },
  {
    chapter: "시작",
    title: "왜 필요한가",
    say: "전구체나 양극재 입자의 크기 분포를 알고 싶을 때, 지금까지는 사진 위에서 입자를 하나씩 손으로 재야 했습니다. 사진 한 장에 입자가 200개가 넘으면, 손으로는 하루가 걸립니다.",
    visual: {
      kind: "points",
      heading: "지금까지의 입도 측정",
      items: ["사진 위에서 입자를 하나씩 손으로 측정", "사진 한 장에 입자 200개 이상", "사람마다, 날마다 달라지는 기준", "샘플이 늘면 감당하기 어려운 시간"],
    },
  },
  {
    chapter: "시작",
    title: "몇 분 만에 나오는 결과",
    say: "Particle Lab은 이 일을 몇 분 안에 끝냅니다. 오늘 예시는 반응 시간을 12시간부터 15시간까지 바꿔 만든 전구체 사진 14장입니다. 버튼 한 번으로, 샘플마다 입자 수와 D10, D50, D90이 표로 나옵니다.",
    visual: { kind: "shot", shot: "results", box: "summary" },
  },
  {
    chapter: "시작",
    title: "오늘 볼 순서",
    say: "순서는 이렇습니다. 화면을 둘러보고, 사진을 넣고, 입자를 찾는 방법을 고릅니다. 한 장으로 미리 확인한 다음 전체를 분석하고, 결과 파일을 읽는 방법과 자주 겪는 문제의 해결법까지 보겠습니다.",
    visual: {
      kind: "points",
      heading: "오늘 볼 순서",
      items: ["1. 화면 둘러보기", "2. 사진 넣기", "3. 입자를 찾는 두 가지 방법", "4. 한 장 미리보기", "5. 설정", "6. 전체 분석과 결과 파일", "7. AI 진단 화면, 자주 겪는 문제"],
    },
  },
  {
    chapter: "시작",
    title: "켜고 끄는 방법",
    say: "켜는 방법은 간단합니다. 프로그램 폴더에서 START 파일을 두 번 누르면, 잠시 뒤 브라우저에 화면이 열립니다. 끌 때는 STOP 파일을 누릅니다. 모든 계산은 이 컴퓨터 안에서 이루어지고, 사진은 밖으로 나가지 않습니다.",
    visual: { kind: "points", heading: "켜고 끄는 방법", items: ["START 파일을 두 번 누르기 → 브라우저에 화면이 열림", "끌 때는 STOP 파일", "모든 계산은 이 컴퓨터 안에서 — 사진이 밖으로 나가지 않음"] },
  },

  // ── 2. 화면 둘러보기 ──
  {
    chapter: "화면 둘러보기",
    title: "왼쪽: 사진 넣기와 실행",
    say: "프로그램을 켜면 이 화면이 나옵니다. 화면은 세 칸으로 되어 있습니다. 왼쪽은 사진을 넣고 분석을 시작하는 곳입니다.",
    visual: { kind: "shot", shot: "home", box: "left" },
  },
  {
    chapter: "화면 둘러보기",
    title: "가운데: 결과 확인",
    say: "가운데는 결과를 눈으로 확인하는 곳입니다. 찾은 입자가 사진 위에 표시되고, 아래에는 수치가 나옵니다.",
    visual: { kind: "shot", shot: "home", box: "center" },
  },
  {
    chapter: "화면 둘러보기",
    title: "오른쪽: 세부 설정",
    say: "오른쪽은 세부 설정입니다. 항목이 많아 보이지만, 처음에는 건드리지 않아도 됩니다. 기본값 그대로 시작하면 됩니다.",
    visual: { kind: "shot", shot: "home", box: "right" },
  },
  {
    chapter: "화면 둘러보기",
    title: "맨 위: 화면 바꾸기",
    say: "맨 위에는 화면을 바꾸는 메뉴가 있습니다. 분석은 평소에 쓰는 화면이고, AI 진단은 인공지능을 점검하는 화면입니다. 소개는 지금 보고 계신 안내입니다.",
    visual: { kind: "shot", shot: "home", box: "nav" },
  },

  // ── 3. 사진 넣기 ──
  {
    chapter: "사진 넣기",
    title: "두 가지 방법",
    say: "먼저 사진을 넣습니다. 방법은 두 가지입니다. 사진 파일을 끌어다 놓거나, 사진이 들어 있는 폴더의 경로를 적습니다. 사진이 수십 장이면 폴더 경로가 더 빠릅니다.",
    visual: { kind: "shot", shot: "home", box: "upload" },
  },
  {
    chapter: "사진 넣기",
    title: "파일 이름이 샘플 이름",
    say: "사진 14장이 목록에 올라왔습니다. 파일 이름을 봐 주세요. 샘플 이름, 배율, 번호 순서로 적혀 있습니다. 이름 앞부분이 같은 사진은 같은 샘플로 묶여서, 통계가 함께 나옵니다.",
    visual: { kind: "shot", shot: "loaded", box: "list" },
  },
  {
    chapter: "사진 넣기",
    title: "분석할 사진 고르기",
    say: "목록의 체크 표시는 분석에 넣을 사진을 뜻합니다. 초점이 나간 사진처럼 빼고 싶은 것은 체크를 풀면 됩니다. 목록에서 사진을 누르면, 가운데에 그 사진이 나타납니다.",
    visual: { kind: "shot", shot: "loaded", box: "list" },
  },
  {
    chapter: "사진 넣기",
    title: "배율과 스케일",
    say: "배율도 파일 이름에서 읽습니다. 이름에 1k가 있으면 1,000배로 보고, 한 픽셀이 몇 μm인지 자동으로 계산합니다. 이름에 배율이 없다면, 스케일바 길이를 직접 넣을 수도 있습니다.",
    visual: { kind: "shot", shot: "loaded", box: "stats" },
  },
  {
    chapter: "사진 넣기",
    title: "아래 정보 띠는 자동으로 제외",
    say: "사진 아래쪽의 검은 정보 띠는 입자가 아닙니다. 프로그램이 이 부분을 자동으로 잘라내고 분석합니다.",
    visual: { kind: "image", src: "/intro/steps/ws_original.png", label: "아래의 검은 정보 띠(배율 · 스케일바)는 분석에서 제외됩니다" },
  },
  {
    chapter: "사진 넣기",
    title: "좋은 사진의 조건",
    say: "결과는 사진의 품질을 따라갑니다. 입자와 배경의 밝기 차이가 분명하고, 초점이 맞은 사진이 좋습니다. 그리고 한 샘플을 같은 배율로 서너 장 찍어 두면, 입자 수백 개가 모여 통계가 안정됩니다.",
    visual: { kind: "points", heading: "좋은 사진의 조건", items: ["입자와 배경의 밝기 차이가 분명할 것", "초점이 맞을 것", "한 샘플을 같은 배율로 3~4장 → 입자 수백 개로 통계가 안정"] },
  },

  // ── 4. 입자를 찾는 두 가지 방법 ──
  {
    chapter: "입자를 찾는 방법",
    title: "Watershed 와 AI Hybrid",
    say: "이제 입자를 찾는 방법을 고릅니다. Watershed와 AI Hybrid, 두 가지입니다. 원리를 몰라도 쓸 수 있지만, 어떤 차이가 있는지만 간단히 보겠습니다.",
    visual: { kind: "shot", shot: "engine", box: "engine" },
  },
  {
    chapter: "입자를 찾는 방법",
    title: "Watershed ① 흑백으로 나누기",
    say: "Watershed는 밝기를 이용하는 전통적인 방법입니다. 먼저 밝은 입자와 어두운 배경을, 흰색과 검정으로 나눕니다.",
    visual: { kind: "steps", items: WS, upto: 1 },
  },
  {
    chapter: "입자를 찾는 방법",
    title: "Watershed ② 산 지도 만들기",
    say: "그다음, 입자의 가운데일수록 높은 산처럼 보이는 지도를 만듭니다. 붙어 있는 두 입자는 봉우리가 두 개인 산이 됩니다.",
    visual: { kind: "steps", items: WS, upto: 2 },
  },
  {
    chapter: "입자를 찾는 방법",
    title: "Watershed ③ 씨앗과 물 채우기",
    say: "봉우리마다 씨앗을 하나씩 놓고 물을 채워 나갑니다. 서로 다른 봉우리에서 온 물이 만나는 선이 입자의 경계가 됩니다. 그래서 이름이 분수령(Watershed)입니다.",
    visual: { kind: "steps", items: WS, upto: 4 },
  },
  {
    chapter: "입자를 찾는 방법",
    title: "Watershed 의 장단점",
    say: "Watershed는 빠릅니다. 설정을 바꾸면 결과가 바로 바뀝니다. 다만 입자가 심하게 겹치거나 표면이 울퉁불퉁하면, 입자 하나를 여러 개로 쪼개기도 합니다.",
    visual: { kind: "shot", shot: "loaded", box: "viewer" },
  },
  {
    chapter: "입자를 찾는 방법",
    title: "Watershed 단계 직접 보기",
    say: "Watershed를 고르면 방금 본 단계들을 직접 볼 수 있습니다. 그림 위의 단추로 이진화, 거리 지도, 씨앗, 최종 결과를 차례로 눌러 보면, 어느 단계에서 잘못됐는지 알 수 있습니다.",
    visual: { kind: "shot", shot: "ws_view", box: "pills" },
  },
  {
    chapter: "입자를 찾는 방법",
    title: "AI Hybrid ① 입자 영역 칠하기",
    say: "AI Hybrid는, 사람이 직접 입자를 표시한 사진으로 미리 학습시킨 인공지능 두 개를 함께 씁니다. 첫 번째 인공지능은 사진의 각 점이 입자인지 배경인지를 칠합니다. 입자의 전체 영역을 잘 잡습니다.",
    visual: { kind: "steps", items: AI, upto: 1 },
  },
  {
    chapter: "입자를 찾는 방법",
    title: "AI Hybrid ② 입자를 하나씩 찾기",
    say: "두 번째 인공지능은 입자를 하나씩 따로 찾아냅니다. 서로 붙어 있는 입자를 구분하는 데 강합니다.",
    visual: { kind: "steps", items: AI, upto: 2 },
  },
  {
    chapter: "입자를 찾는 방법",
    title: "AI Hybrid ③ 둘을 합치기",
    say: "Particle Lab은 이 둘을 합칩니다. 첫 번째가 칠한 영역 위에, 두 번째가 찾은 경계로 분리선을 그어서, 붙어 있는 입자를 나눕니다.",
    visual: { kind: "steps", items: AI, upto: 3 },
  },
  {
    chapter: "입자를 찾는 방법",
    title: "AI Hybrid 의 장단점",
    say: "그 결과, 입자가 많이 겹친 사진에서도 하나씩 잘 나눕니다. 대신 사진 한 장에 몇 초가 걸립니다.",
    visual: { kind: "steps", items: AI, upto: 4 },
  },
  {
    chapter: "입자를 찾는 방법",
    title: "무엇을 고를까",
    say: "정리하면 이렇습니다. 입자가 잘 떨어져 있고 빨리 보고 싶으면 Watershed. 입자가 서로 붙어 있거나 정확도가 중요하면 AI Hybrid. 잘 모르겠으면 AI Hybrid로 시작하세요.",
    visual: {
      kind: "points",
      heading: "무엇을 고를까",
      items: ["Watershed — 입자가 잘 떨어져 있을 때, 빠르게 볼 때", "AI Hybrid — 입자가 붙어 있을 때, 정확도가 중요할 때", "잘 모르겠으면 AI Hybrid 로 시작"],
    },
  },

  // ── 5. 미리보기 ──
  {
    chapter: "한 장 미리보기",
    title: "전체를 돌리기 전에 한 장만",
    say: "방법을 골랐으면, 전체를 돌리기 전에 한 장만 먼저 확인합니다. 목록에서 사진을 하나 고르고, 미리보기 버튼을 누릅니다.",
    visual: { kind: "shot", shot: "loaded", box: "preview" },
  },
  {
    chapter: "한 장 미리보기",
    title: "색 하나가 입자 하나",
    say: "찾은 입자가 색으로 칠해져 나옵니다. 색 하나가 입자 하나입니다. 여기서 볼 것은 두 가지입니다. 입자 하나가 여러 색으로 쪼개지지 않았는지, 그리고 붙은 입자 둘이 한 색으로 합쳐지지 않았는지입니다.",
    visual: { kind: "shot", shot: "ai_before", box: "viewer" },
  },
  {
    chapter: "한 장 미리보기",
    title: "확대해서 확인하기",
    say: "그림은 확대하고 옮겨 볼 수 있습니다. 작은 입자나 붙어 있는 입자는 확대해서 확인하세요. 지금 보는 그림을 파일로 저장할 수도 있습니다.",
    visual: { kind: "shot", shot: "ai_before", box: "viewer" },
  },
  {
    chapter: "한 장 미리보기",
    title: "입자 수와 D50 이 바로",
    say: "위쪽에는 이 사진의 입자 수와 D50이 바로 나옵니다. 이 사진에서는 입자 214개, D50은 5.04 μm입니다.",
    visual: { kind: "shot", shot: "ai_before", box: "loaded.stats" },
  },
  {
    chapter: "한 장 미리보기",
    title: "필터 전과 필터 후",
    say: "보기에는 필터 전과 필터 후가 있습니다. 필터 전은 찾은 입자 전부이고, 필터 후는 통계에 실제로 들어가는 입자입니다. 사진 가장자리에 걸려 잘린 입자와 모양이 지나치게 찌그러진 입자는 통계에서 빠지고, 회색 테두리로만 표시됩니다.",
    visual: { kind: "shot", shot: "ai_after", box: "viewer" },
  },
  {
    chapter: "한 장 미리보기",
    title: "입도와 입자 표",
    say: "아래 표에는 D10, D50, D90과 입자 하나하나의 지름, 원형도, 종횡비가 나옵니다. 표의 번호는 사진 위의 입자 번호와 같아서, 이상한 값이 보이면 어느 입자인지 바로 찾을 수 있습니다.",
    visual: { kind: "shot", shot: "table", box: "table" },
  },
  {
    chapter: "한 장 미리보기",
    title: "크기 숫자 읽는 법",
    say: "숫자를 읽는 법을 짧게 정리합니다. D50은 입자를 작은 것부터 줄 세웠을 때 한가운데 입자의 지름입니다. D10과 D90은 각각 10퍼센트와 90퍼센트 지점입니다. Span은 D90에서 D10을 뺀 값을 D50으로 나눈 것으로, 작을수록 크기가 고릅니다.",
    visual: { kind: "points", heading: "크기 숫자 읽는 법", items: ["D50 — 작은 것부터 줄 세웠을 때 한가운데 입자의 지름", "D10 · D90 — 10% · 90% 지점의 지름", "Span = (D90 − D10) ÷ D50 — 작을수록 크기가 고름"] },
  },
  {
    chapter: "한 장 미리보기",
    title: "모양 숫자 읽는 법",
    say: "모양을 나타내는 숫자도 두 가지만 알면 됩니다. 원형도는 완전한 원이면 1이고, 찌그러지거나 표면이 거칠수록 작아집니다. 종횡비는 긴 쪽 길이를 짧은 쪽 길이로 나눈 값으로, 1이면 둥글고 클수록 길쭉합니다.",
    visual: { kind: "points", heading: "모양 숫자 읽는 법", items: ["원형도 — 완전한 원이면 1, 찌그러지거나 거칠수록 작아짐", "종횡비 — 긴 쪽 ÷ 짧은 쪽, 1이면 둥글고 클수록 길쭉함"] },
  },
  {
    chapter: "한 장 미리보기",
    title: "설정을 바꾼 뒤에는",
    say: "Watershed를 쓸 때는 설정을 바꾸면 미리보기가 자동으로 다시 계산됩니다. AI Hybrid는 시간이 걸리므로, 설정을 바꾼 뒤 미리보기를 다시 눌러야 합니다.",
    visual: { kind: "shot", shot: "engine", box: "engine" },
  },

  // ── 6. 설정 ──
  {
    chapter: "설정은 세 가지만",
    title: "결과가 마음에 들지 않을 때만",
    say: "결과가 마음에 들지 않을 때만 오른쪽 설정을 봅니다. 항목은 많지만, 자주 만지는 것은 세 가지뿐입니다.",
    visual: { kind: "shot", shot: "params_top", box: "right" },
  },
  {
    chapter: "설정은 세 가지만",
    title: "① 하단 정보 띠 자르기",
    say: "첫째, 하단 정보 띠 자르기입니다. 사진 아래의 글자 부분이 입자로 잡히면, 자르는 비율을 조금 늘립니다.",
    visual: { kind: "shot", shot: "params_top", box: "sem" },
  },
  {
    chapter: "설정은 세 가지만",
    title: "사진이 어둡거나 흐릴 때",
    say: "사진이 어둡거나 흐릴 때는 같은 칸에서 밝기와 대비를 조정할 수 있습니다. 바꾸는 즉시 가운데 그림에 반영되므로, 눈으로 보면서 맞추면 됩니다.",
    visual: { kind: "shot", shot: "params_top", box: "sem" },
  },
  {
    chapter: "설정은 세 가지만",
    title: "② 스케일",
    say: "둘째, 스케일입니다. 크기가 실제와 다르게 나오면, 여기서 스케일바의 픽셀 길이와 실제 길이를 직접 넣습니다.",
    visual: { kind: "shot", shot: "params_filter", box: "scale" },
  },
  {
    chapter: "설정은 세 가지만",
    title: "③ 형상 필터",
    say: "셋째, 형상 필터입니다. 기본값은 원형도 0.7 미만과 종횡비 2 초과인 입자를 빼는 것입니다. 깨진 입자나 길쭉한 입자도 통계에 넣고 싶다면, 이 필터를 끕니다.",
    visual: { kind: "shot", shot: "params_filter", box: "filter" },
  },
  {
    chapter: "설정은 세 가지만",
    title: "더 보기: 모서리 입자",
    say: "여기부터는 필요할 때만 보세요. 특성 필터의 맨 위, 모서리 입자 제거는 켜 두는 것을 권합니다. 사진 가장자리에서 잘린 입자는 실제보다 작게 재지기 때문입니다.",
    visual: { kind: "shot", shot: "params_measure", box: "measure" },
  },
  {
    chapter: "설정은 세 가지만",
    title: "더 보기: Watershed 설정",
    say: "Watershed 설정에서는 두 가지를 기억하세요. 입자 하나가 여러 조각으로 쪼개지면 씨앗 사이의 최소 거리를 늘리고, 붙은 입자가 나뉘지 않으면 줄입니다. 먼지 같은 작은 조각이 입자로 잡히면 최소 크기를 올립니다.",
    visual: { kind: "shot", shot: "params_ws", box: "ws" },
  },
  {
    chapter: "설정은 세 가지만",
    title: "더 보기: AI Hybrid 설정",
    say: "AI Hybrid 설정도 대부분 그대로 두면 됩니다. 작은 조각이 잡히면 최소 입자 크기를 올리고, 흐릿한 입자를 놓치면 YOLO 신뢰도를 조금 낮춥니다.",
    visual: { kind: "shot", shot: "params_ai", box: "ai" },
  },
  {
    chapter: "설정은 세 가지만",
    title: "설정 저장과 불러오기",
    say: "맞춘 설정은 파일로 저장해 두었다가 다음에 불러올 수 있습니다. 같은 조건으로 계속 분석하려면 꼭 저장해 두세요.",
    visual: { kind: "shot", shot: "params_top", box: "save" },
  },
  {
    chapter: "전체 분석",
    title: "분석 이름 적어 두기",
    say: "전체 분석 전에, 저장 옵션을 열어 분석 이름을 적어 두면 좋습니다. 결과 폴더가 날짜와 이 이름으로 만들어져서 나중에 찾기 쉽습니다. 저장 위치를 따로 정할 수도 있습니다.",
    visual: { kind: "shot", shot: "save_opts", box: "save" },
  },

  // ── 7. 전체 분석 ──
  {
    chapter: "전체 분석",
    title: "전체 분석 버튼",
    say: "한 장으로 확인이 끝났으면, 전체 분석을 누릅니다. 체크한 사진 전부를 같은 설정으로 분석합니다.",
    visual: { kind: "shot", shot: "loaded", box: "run" },
  },
  {
    chapter: "전체 분석",
    title: "진행 상황",
    say: "진행 상황이 막대로 표시됩니다. 사진 14장을 인공지능으로 분석하는 데 보통 1~2분이 걸립니다.",
    visual: { kind: "shot", shot: "running", box: "progress" },
  },
  {
    chapter: "전체 분석",
    title: "결과 내려받기",
    say: "끝나면 결과를 내려받을 수 있습니다. Excel, 발표용 PPT, 그리고 모든 그림을 묶은 압축 파일입니다.",
    visual: { kind: "shot", shot: "results", box: "download" },
  },
  {
    chapter: "전체 분석",
    title: "샘플 요약",
    say: "샘플 요약 표입니다. 12시간 샘플의 D50은 5.04, 13시간은 5.34, 14시간은 5.52, 15시간은 5.39 μm입니다. 반응 시간에 따라 입자 크기가 어떻게 달라지는지 한눈에 비교됩니다.",
    visual: { kind: "shot", shot: "results", box: "summary" },
  },
  {
    chapter: "전체 분석",
    title: "결과 그림 모음",
    say: "아래에는 사진마다 입자를 표시한 그림과 크기 분포 히스토그램, 요약 카드가 모여 있습니다. 눌러서 크게 볼 수 있습니다.",
    visual: { kind: "shot", shot: "gallery", box: "gallery" },
  },
  {
    chapter: "전체 분석",
    title: "사진별 결과 다시 보기",
    say: "분석이 끝난 사진은 목록에 초록 점이 붙습니다. 사진을 누르면, 가운데에서 그 사진의 결과 그림을 바로 볼 수 있습니다.",
    visual: { kind: "shot", shot: "results", box: "list" },
  },
  {
    chapter: "전체 분석",
    title: "이전 분석 다시 열기",
    say: "이전에 한 분석은 왼쪽 아래 최근 분석에 남아 있어, 눌러서 다시 열 수 있습니다. 프로그램을 껐다 켜면 이 목록은 비워지지만, 결과 파일은 폴더에 그대로 남아 있습니다.",
    visual: { kind: "shot", shot: "save_opts", box: "recent" },
  },
  {
    chapter: "결과 파일 읽기",
    title: "결과 폴더 구성",
    say: "결과 파일을 보겠습니다. 결과 폴더에는 Excel과 PPT 파일, 입자를 표시한 그림, 비교 그림, 히스토그램, 요약 카드, 그리고 분석에 쓴 설정 파일이 들어 있습니다. 설정 파일이 함께 남기 때문에, 나중에 어떤 조건으로 분석했는지 확인할 수 있습니다.",
    visual: { kind: "points", heading: "결과 폴더 구성", items: ["particle_analysis_result.xlsx · .pptx", "labeled_images — 입자를 표시한 그림", "comparison_images · histograms · summary_images", "params.json — 분석에 쓴 설정 (재현용)"] },
  },

  // ── 8. 결과 파일 ──
  {
    chapter: "결과 파일 읽기",
    title: "비교 그림",
    say: "비교 그림은 원본과 분석 결과를 나란히 놓은 것입니다. 입자가 제대로 잡혔는지 보여 주는 근거로, 보고서에 그대로 쓸 수 있습니다.",
    visual: { kind: "image", src: "/intro/steps/result_compare.jpg", label: "비교 그림 — 원본 · 필터 전 · 필터 후" },
  },
  {
    chapter: "결과 파일 읽기",
    title: "히스토그램과 요약 카드",
    say: "히스토그램과 요약 카드입니다. 샘플별 지름 분포와 주요 수치가 한 장에 정리됩니다.",
    visual: { kind: "image", src: "/intro/steps/result_hist.png", label: "지름 분포 히스토그램 (필터 전 · 후)", src2: "/intro/steps/result_card.jpg", label2: "샘플 요약 카드" },
  },
  {
    chapter: "결과 파일 읽기",
    title: "엑셀 시트 구성",
    say: "Excel에는 시트가 여러 개 있습니다. 샘플 이름으로 된 시트에는 입자 하나하나의 측정값이 있고, Summary 시트에는 샘플별 요약이 있습니다. 형상요약 시트에는 원형도 같은 모양 지표 60여 가지가 한글과 영어로 정리되어 있고, 지표정의 시트에서 각 지표의 계산식을 확인할 수 있습니다.",
    visual: {
      kind: "points",
      heading: "particle_analysis_result.xlsx",
      items: ["12h · 13h · 14h · 15h — 입자 하나하나의 측정값", "Summary — 샘플별 입자 수, D10 · D50 · D90, Span", "형상요약 · 이미지별 · 입자별 — 모양 지표 60여 가지", "지표정의 — 각 지표의 계산식과 설명 (한글 · 영어)"],
    },
  },
  {
    chapter: "결과 파일 읽기",
    title: "PPT 구성",
    say: "PPT는 샘플마다 한 장씩 만들어집니다. 샘플 이름과 필터 전후 요약 카드, 비교 그림이 들어 있어, 회의 자료로 바로 쓸 수 있습니다.",
    visual: { kind: "points", heading: "particle_analysis_result.pptx", items: ["샘플마다 슬라이드 1장", "샘플 이름 + 필터 전 · 후 요약 카드", "비교 그림 최대 3장"] },
  },
  {
    chapter: "결과 파일 읽기",
    title: "필터 전 값과 필터 후 값",
    say: "Excel에는 필터 전 값과 필터 후 값이 모두 들어 있습니다. 보고에는 보통 필터 후 값을 씁니다. 다만 깨진 입자처럼 모양이 나쁜 입자 자체가 관심사라면, 필터 전 값을 보세요.",
    visual: { kind: "points", heading: "어느 값을 쓸까", items: ["필터 후 — 보통의 보고용 (잘린 입자 · 찌그러진 입자 제외)", "필터 전 — 깨진 입자 등 모양이 나쁜 입자까지 볼 때"] },
  },

  // ── 9. AI 진단 ──
  {
    chapter: "AI 진단 화면",
    title: "인공지능이 정확한지 확인할 때",
    say: "두 번째 화면인 AI 진단은, 인공지능이 얼마나 정확한지 확인하고 싶을 때 씁니다. 사람이 직접 입자를 칠한 정답 그림이 있으면, 함께 넣어 점수를 매길 수 있습니다. 정답이 없어도 쓸 수 있습니다.",
    visual: { kind: "shot", shot: "diag_empty", box: "input" },
  },
  {
    chapter: "AI 진단 화면",
    title: "판단 과정을 단계별로",
    say: "진단 화면에서는 인공지능이 판단한 과정을 단계별로 볼 수 있습니다. 어디를 입자로 보았는지, 어디에 분리선을 그었는지, 하나씩 눌러 확인합니다.",
    visual: { kind: "shot", shot: "diag_result", box: "views" },
  },
  {
    chapter: "AI 진단 화면",
    title: "첫 번째 AI가 본 영역",
    say: "U-Net prob은 첫 번째 인공지능이 입자라고 본 영역입니다. 흰색이 입자입니다.",
    visual: { kind: "shot", shot: "diag_prob" },
  },
  {
    chapter: "AI 진단 화면",
    title: "두 번째 AI가 찾은 테두리",
    say: "YOLO 경계는 두 번째 인공지능이 찾은, 입자 하나하나의 테두리입니다.",
    visual: { kind: "shot", shot: "diag_yolo" },
  },
  {
    chapter: "AI 진단 화면",
    title: "분리선 보기",
    say: "예를 들어 이 그림은, 붙어 있는 입자를 나누려고 그은 분리선입니다. 입자가 잘못 나뉘었다면 여기서 원인을 찾을 수 있습니다.",
    visual: { kind: "shot", shot: "diag_separator" },
  },
  {
    chapter: "AI 진단 화면",
    title: "입자 번호",
    say: "번호 보기에서는 입자마다 번호가 붙습니다. 이 번호는 Excel의 입자 번호와 같습니다.",
    visual: { kind: "shot", shot: "diag_number" },
  },
  {
    chapter: "AI 진단 화면",
    title: "정답과 비교한 점수",
    say: "정답 그림을 함께 넣으면 점수가 나옵니다. 정밀도는 찾은 것 중 진짜 입자의 비율이고, 재현율은 진짜 입자 중 찾아낸 비율입니다. IoU는 정답과 겹치는 정도로, 1에 가까울수록 좋습니다. 입자 수 오차는 개수를 얼마나 틀렸는지를 나타냅니다.",
    visual: { kind: "points", heading: "정답과 비교한 점수", items: ["정밀도(Precision) — 찾은 것 중 진짜 입자의 비율", "재현율(Recall) — 진짜 입자 중 찾아낸 비율", "IoU — 정답과 겹치는 정도, 1에 가까울수록 좋음", "입자 수 오차 — 개수를 얼마나 틀렸는지"] },
  },
  {
    chapter: "AI 진단 화면",
    title: "모양과 크기 지표",
    say: "아래에는 이 사진의 모양과 크기 지표가 정리되어 나옵니다.",
    visual: { kind: "shot", shot: "diag_morph" },
  },
  {
    chapter: "AI 진단 화면",
    title: "내려받기와 설정 공유",
    say: "결과는 그림, PDF, PPT, Excel로 내려받을 수 있습니다. 두 화면은 설정을 함께 쓰기 때문에, 여기서 맞춘 값이 분석 화면에도 그대로 적용됩니다.",
    visual: { kind: "shot", shot: "diag_download", box: "right" },
  },
  {
    chapter: "주의할 점",
    title: "자주 겪는 문제와 해결",
    say: "자주 겪는 문제와 해결법입니다. 입자 하나가 여러 개로 쪼개지면, AI Hybrid로 바꾸거나 Watershed의 씨앗 최소 거리를 늘리세요. 붙은 입자가 하나로 잡히면 AI Hybrid를 쓰세요. 먼지 같은 작은 조각이 잡히면 최소 크기를 올리세요. 크기가 이상하면 스케일부터 확인하세요.",
    visual: { kind: "points", heading: "자주 겪는 문제와 해결", items: ["입자가 쪼개진다 → AI Hybrid, 또는 씨앗 최소 거리 늘리기", "붙은 입자가 하나로 잡힌다 → AI Hybrid", "작은 조각이 잡힌다 → 최소 크기 올리기", "크기가 이상하다 → 스케일부터 확인"] },
  },

  // ── 10. 주의할 점 · 마무리 ──
  {
    chapter: "주의할 점",
    title: "세 가지만 기억하세요",
    say: "마지막으로 주의할 점 세 가지입니다. 하나. 크기 값은 스케일이 맞아야 의미가 있습니다. 처음 한 번은 사진의 스케일바와 비교해 확인하세요. 둘. 인공지능은 학습한 사진과 비슷한 배율에서 가장 잘 맞습니다. 배율이 높아 입자 몇 개만 크게 보이는 사진은, 미리보기로 먼저 확인하세요. 셋. 사진에서 잰 값은 입자 개수 기준입니다. 부피 기준인 레이저 입도 분석기 값과는 다를 수 있으니, 같은 방법으로 잰 값끼리 비교하세요.",
    visual: {
      kind: "points",
      heading: "주의할 점",
      items: ["스케일 — 처음 한 번은 스케일바와 비교해 확인", "배율 — 입자가 몇 개만 크게 보이는 사진은 미리보기 먼저", "기준 — 사진 측정은 개수 기준, 레이저 입도 분석기는 부피 기준"],
    },
  },
  {
    chapter: "마무리",
    title: "정리",
    say: "정리합니다. 사진을 넣고, 한 장을 미리 보고, 전체 분석을 누르면 됩니다. Particle Lab으로 입도 분석에 드는 시간을 줄여 보세요. 감사합니다.",
    visual: { kind: "title", big: "사진 넣기 → 미리보기 → 전체 분석", sub: "Particle Lab" },
  },
];

/** 더빙을 넣을 수 있도록 넉넉히 잡은 장면 길이(초): 한국어 낭독 약 5글자/초 + 앞뒤 여유 */
export function sceneSeconds(s: IntroScene): number {
  const chars = s.say.replace(/\s/g, "").length;
  return Math.max(6, Math.round((chars / 5 + 2) * 2) / 2);
}

export function introTotalSeconds(): number {
  return INTRO_SCENES.reduce((a, s) => a + sceneSeconds(s), 0);
}
