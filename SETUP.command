#!/bin/bash
# ParticleLab — macOS 환경 설정 (SETUP.bat 의 Mac 판). START.command 가 첫 실행 때 자동 호출.
cd "$(dirname "$0")" || exit 1
. ./mac_env.sh

fail() { echo "[에러] $*"; exit 1; }

PY=$(find_python) || fail "Python 3.10–3.13 이 필요합니다. 설치: https://www.python.org/downloads/macos/"
command -v npm >/dev/null 2>&1 || fail "Node.js 18 이상이 필요합니다. 설치: https://nodejs.org/"

echo "[설정] Python 가상환경 생성 ($("$PY" --version))"
if [ ! -x venv/bin/python ]; then
  "$PY" -m venv venv || fail "Python venv 생성 실패."
fi
VPY="$PWD/venv/bin/python"

echo "[설정] pip 업그레이드"
"$VPY" -m pip install --upgrade pip wheel --quiet || fail "pip 업그레이드 실패."

# torch 를 requirements 보다 먼저 설치. macOS 용 PyPI 빌드에 Apple GPU(MPS) 가속이 포함돼 있다.
echo "[설정] PyTorch 설치 (Apple Silicon MPS 포함)"
"$VPY" -m pip install --quiet torch torchvision || fail "PyTorch 설치 실패."

echo "[설정] 백엔드 Python 패키지 설치 (약 2분)"
"$VPY" -m pip install --quiet -r app/backend/requirements.txt || fail "백엔드 패키지 설치 실패."

echo "[설정] Node 패키지 설치"
(
  cd app/frontend || exit 1
  if [ -f package-lock.json ]; then
    npm ci --silent --no-audit --no-fund || npm install --silent --no-audit --no-fund
  else
    npm install --silent --no-audit --no-fund
  fi
) || fail "Node 패키지 설치 실패."

echo "[설정] 프런트엔드 빌드 (약 30초)"
(cd app/frontend && npm run build) || fail "프런트엔드 빌드 실패."

echo
echo "[완료] 설정 끝."
exit 0
