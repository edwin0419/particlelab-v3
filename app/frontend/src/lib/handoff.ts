// 화면 간 이미지 넘기기 (튜너 → AI 진단). 앱 안에서 링크로 이동하면 모듈 상태가 유지된다.
let pending: File[] | null = null;

export function setHandoffImages(files: File[]) {
  pending = files.length ? files : null;
}

export function takeHandoffImages(): File[] | null {
  const f = pending;
  pending = null;
  return f;
}
