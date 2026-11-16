# ParticleLab — macOS 스크립트 공통 설정 (SETUP/START/STOP.command 가 source 함)

# Finder 에서 .command 를 더블클릭하면 ~/.zshrc 가 읽히지 않아 Homebrew / nvm 경로가 빠진다.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  fi
fi

BACKEND_PORT=8765
FRONTEND_PORT=3001

# Python 3.10–3.13 중 가장 먼저 찾은 것 (macOS 기본 /usr/bin/python3 는 3.9 라 제외됨)
find_python() {
  local c
  for c in python3.13 python3.12 python3.11 python3.10 \
           /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 \
           /Library/Frameworks/Python.framework/Versions/3.12/bin/python3 \
           /Library/Frameworks/Python.framework/Versions/3.11/bin/python3 \
           /Library/Frameworks/Python.framework/Versions/3.10/bin/python3 \
           python3; do
    if command -v "$c" >/dev/null 2>&1 \
       && "$c" -c 'import sys; sys.exit(0 if (3, 10) <= sys.version_info[:2] <= (3, 13) else 1)' 2>/dev/null; then
      command -v "$c"
      return 0
    fi
  done
  return 1
}

# 해당 포트에서 LISTEN 중인 프로세스 종료
kill_port() {
  local pids
  pids=$(lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null)
  [ -z "$pids" ] && return 0
  kill $pids 2>/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 0.3
    pids=$(lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null)
    [ -z "$pids" ] && return 0
  done
  kill -9 $pids 2>/dev/null
}
