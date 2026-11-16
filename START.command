#!/bin/bash
# ParticleLab — macOS 실행 (START.bat 의 Mac 판). Finder 에서 더블클릭하거나 터미널에서 ./START.command
# 이 창이 열려 있는 동안 서버가 돌고, 창을 닫거나 Ctrl+C 를 누르면 둘 다 종료된다.
cd "$(dirname "$0")" || exit 1
. ./mac_env.sh
ROOT="$PWD"

pause_exit() { echo "$*"; read -r -p "Enter 를 누르면 닫힙니다." _; exit 1; }

echo
echo "==========================================="
echo "   ParticleLab - 자동 실행 중..."
echo "==========================================="
echo

command -v node >/dev/null 2>&1 || pause_exit "[에러] Node.js 가 설치되어 있지 않습니다. 설치: https://nodejs.org/"

# 첫 실행이면 setup
if [ ! -x venv/bin/python ] || [ ! -d app/frontend/node_modules ] || [ ! -d app/frontend/.next ]; then
  echo "[정보] 처음 실행 - 환경 설정 (약 5분)"
  bash ./SETUP.command || pause_exit "설정 실패."
fi

[ -f basic_pt/U-net++ ] && [ -f basic_pt/yolo_11 ] \
  || echo "[주의] basic_pt/ 에 U-net++, yolo_11 가중치가 없어 AI Hybrid 엔진은 쓸 수 없습니다 (Watershed 는 동작)."

# 기존 프로세스 정리
kill_port "$BACKEND_PORT"
kill_port "$FRONTEND_PORT"
mkdir -p logs

BACK_PID=""
FRONT_PID=""
cleanup() {
  trap - EXIT INT TERM HUP
  echo
  echo "[정리] 서버 종료"
  [ -n "$FRONT_PID" ] && kill "$FRONT_PID" 2>/dev/null
  [ -n "$BACK_PID" ] && kill "$BACK_PID" 2>/dev/null
  kill_port "$FRONTEND_PORT"
  kill_port "$BACKEND_PORT"
  exit 0
}
trap cleanup EXIT INT TERM HUP

echo "[시작] 백엔드 (포트 $BACKEND_PORT)"
(
  cd app/backend || exit 1
  export PYTHONPATH="$ROOT:$ROOT/app/backend"
  exec "$ROOT/venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT"
) > logs/backend.log 2>&1 &
BACK_PID=$!

echo "  대기 중..."
for i in $(seq 1 60); do
  curl -sf -o /dev/null "http://127.0.0.1:$BACKEND_PORT/api/health" && break
  kill -0 "$BACK_PID" 2>/dev/null || pause_exit "[에러] 백엔드 시작 실패. logs/backend.log 확인."
  [ "$i" -eq 60 ] && pause_exit "[에러] 백엔드가 60초 안에 응답하지 않습니다. logs/backend.log 확인."
  sleep 1
done

echo "[시작] 프런트엔드 (포트 $FRONTEND_PORT)"
(
  cd app/frontend || exit 1
  exec ./node_modules/.bin/next start -p "$FRONTEND_PORT"
) > logs/frontend.log 2>&1 &
FRONT_PID=$!

echo "  대기 중..."
for i in $(seq 1 30); do
  curl -sf -o /dev/null "http://127.0.0.1:$FRONTEND_PORT" && break
  kill -0 "$FRONT_PID" 2>/dev/null || pause_exit "[에러] 프런트엔드 시작 실패. logs/frontend.log 확인."
  [ "$i" -eq 30 ] && pause_exit "[에러] 프런트엔드가 30초 안에 응답하지 않습니다. logs/frontend.log 확인."
  sleep 1
done

# 기본 브라우저로 열기 (PLAB_NO_BROWSER=1 이면 생략)
[ -z "$PLAB_NO_BROWSER" ] && open "http://localhost:$FRONTEND_PORT/home"

echo
echo "==========================================="
echo "   ParticleLab 실행 중"
echo "   접속: http://localhost:$FRONTEND_PORT"
echo "==========================================="
echo
echo " 이 창을 닫거나 Ctrl+C, 또는 STOP.command 를 실행하면"
echo " 서버가 종료됩니다."
echo
echo " 로그: logs/backend.log  logs/frontend.log"
echo

wait
