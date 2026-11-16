#!/bin/bash
# Particle Lab — macOS 앱(.app)과 dmg 를 만든다. 받는 사람은 파이썬 · Node 를 설치할 필요가 없다.
#
#   tools/build_mac_app.sh            → dist/Particle Lab.app, dist/ParticleLab-<버전>-arm64.dmg
#
# 필요한 것 (만드는 Mac 에만): SETUP.command 를 마친 venv · node_modules, Xcode 명령줄 도구(clang), 인터넷(파이썬 런타임 1회 내려받기).
# 묶는 것: 옮겨도 돌아가는 파이썬(python-build-standalone) + venv 의 패키지 + 분석 코드 + 정적으로 내보낸 화면 + AI 가중치.
# 실행 흐름: Contents/MacOS/ParticleLab(tools/mac/stub.c) → Resources/python → Resources/app/launcher.py (창 + 서버).
# 서명: 임시(ad-hoc) 서명만 한다. 다른 Mac 에서 처음 열 때는 우클릭 → 열기가 필요하다 (Apple 개발자 서명 · 공증은 따로).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

PY_SERIES="3.13"                      # venv 와 같은 3.x 여야 패키지를 그대로 쓸 수 있다
PBS_TAG="20261110"
PBS_FILE="cpython-3.13.18+${PBS_TAG}-aarch64-apple-darwin-install_only_stripped.tar.gz"
PBS_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${PBS_FILE//+/%2B}"

VERSION=$(sed -n 's/.*version="\([0-9.]*\)".*/\1/p' app/backend/app/main.py | head -1)
DIST="$ROOT/dist"
APP="$DIST/Particle Lab.app"
RES="$APP/Contents/Resources"
DMG="$DIST/ParticleLab-${VERSION}-arm64.dmg"
SITE="venv/lib/python${PY_SERIES}/site-packages"

[ "$(uname -m)" = "arm64" ] || { echo "[에러] Apple Silicon Mac 에서만 만들 수 있습니다."; exit 1; }
[ -d "$SITE" ] || { echo "[에러] $SITE 가 없습니다. 먼저 SETUP.command 를 실행하세요."; exit 1; }
[ -d basic_pt ] || { echo "[에러] basic_pt (AI 가중치) 가 없습니다."; exit 1; }

echo "[1/7] 화면을 정적 파일로 내보내기"
(cd app/frontend && rm -rf out && BUILD_TARGET=export npx next build > "$DIST.front.log" 2>&1) || { tail -20 "$DIST.front.log"; exit 1; }
rm -f "$DIST.front.log"

echo "[2/7] 번들 뼈대"
rm -rf "$APP" "$DMG"
mkdir -p "$APP/Contents/MacOS" "$RES/app/app/frontend" "$DIST/.cache"

echo "[3/7] 파이썬 런타임"
if [ ! -f "$DIST/.cache/$PBS_FILE" ]; then
  curl -fL --retry 3 -o "$DIST/.cache/$PBS_FILE.part" "$PBS_URL" && mv "$DIST/.cache/$PBS_FILE.part" "$DIST/.cache/$PBS_FILE"
fi
tar -xzf "$DIST/.cache/$PBS_FILE" -C "$RES"          # → Resources/python
PYBIN="$RES/python/bin/python${PY_SERIES}"
"$PYBIN" -c "import sys; print('   ', sys.version.split()[0])"

echo "[4/7] 패키지 (venv → 번들)"
rsync -a \
  --exclude '__pycache__' --exclude 'pip' --exclude 'pip-*' --exclude 'setuptools' --exclude 'setuptools-*' \
  --exclude 'pkg_resources' --exclude '_distutils_hack' --exclude 'distutils-precedence.pth' \
  --exclude 'PyObjCTest' --exclude 'pyflakes' --exclude 'pyflakes-*' \
  "$SITE/" "$RES/python/lib/python${PY_SERIES}/site-packages/"

echo "[5/7] 프로그램 파일"
rsync -a --exclude '__pycache__' launcher.py hybrid_core.py evaluate.py unet_models.py unet_module.py unet_trainer.py \
  weight_maps.py particle_morphology.py arial.ttf logo.png particle_core basic_pt demo_images "$RES/app/"
rsync -a --exclude '__pycache__' app/backend "$RES/app/app/"
rsync -a app/frontend/out "$RES/app/app/frontend/"
cp AppIcon.icns "$RES/AppIcon.icns"
# 번들은 읽기 전용으로 쓰이므로 .pyc 를 미리 만들어 둔다 (없으면 켤 때마다 다시 번역해서 느리다)
"$PYBIN" -m compileall -q -j 0 --invalidation-mode unchecked-hash "$RES/python/lib/python${PY_SERIES}" "$RES/app" > /dev/null || true

echo "[6/7] 실행 파일 · Info.plist · 서명"
clang -O2 -arch arm64 -mmacosx-version-min=12.0 -DPYVER="\"${PY_SERIES}\"" -o "$APP/Contents/MacOS/ParticleLab" tools/mac/stub.c
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Particle Lab</string>
  <key>CFBundleDisplayName</key><string>Particle Lab</string>
  <key>CFBundleIdentifier</key><string>com.particlelab.desktop</string>
  <key>CFBundleExecutable</key><string>ParticleLab</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.education</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSHumanReadableCopyright</key><string>© $(date +%Y) Battery Resource Circularity Lab, Sejong University</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
xattr -cr "$APP"
codesign --force --deep --sign - "$APP" 2>&1 | tail -2
codesign --verify --deep "$APP" && echo "    서명 확인"

echo "[7/7] dmg"
STAGE="$DIST/.dmg"
rm -rf "$STAGE"; mkdir -p "$STAGE"
mv "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -quiet -volname "Particle Lab ${VERSION}" -srcfolder "$STAGE" -fs HFS+ -format UDZO -imagekey zlib-level=9 "$DMG"
mv "$STAGE/Particle Lab.app" "$APP"; rm -rf "$STAGE"

# START.command 가 쓰는 평소 빌드(.next)를 되돌려 놓는다
(cd app/frontend && npm run build > /dev/null 2>&1) || echo "[주의] 평소 빌드를 되돌리지 못했습니다. app/frontend 에서 npm run build 를 실행하세요."

echo
echo "완료: $APP ($(du -sh "$APP" | cut -f1))"
echo "      $DMG ($(du -sh "$DMG" | cut -f1))"
