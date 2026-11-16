#!/bin/bash
# ParticleLab — macOS 종료 (STOP.bat 의 Mac 판)
cd "$(dirname "$0")" || exit 1
. ./mac_env.sh

echo "[정리] ParticleLab 프로세스 종료"
kill_port "$BACKEND_PORT"
kill_port "$FRONTEND_PORT"
echo "[완료]"
