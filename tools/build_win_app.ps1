# Particle Lab — Windows 설치 파일을 만든다. 받는 사람은 Python · Node 를 설치할 필요가 없다.
#
#   powershell -ExecutionPolicy Bypass -File tools\build_win_app.ps1
#     → dist\win\ParticleLab\ (설치될 폴더 그대로)  ·  dist\ParticleLab-Setup-<버전>.exe
#
# GitHub Actions(.github/workflows/windows-installer.yml) 가 이 스크립트를 돌린다. Windows PC 에서 직접 돌려도 된다.
# 필요한 것: Node 18+, Visual Studio C++ 빌드 도구(cl · rc 가 PATH 에 — "x64 Native Tools" 프롬프트), Inno Setup 6, 인터넷.
# 묶는 것: 옮겨도 돌아가는 파이썬(python-build-standalone) + pip 로 설치한 패키지 + 분석 코드 + 정적으로 내보낸 화면 + AI 가중치.
# PyTorch 는 CPU 판을 넣는다 (CUDA 판은 2.5GB 라 설치 파일에 넣지 않는다).
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$Root = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $Root

$PySeries = "3.12"
$PyDll    = "312"
$PbsTag   = "20261110"
$PbsFile  = "cpython-3.12.16+$PbsTag-x86_64-pc-windows-msvc-install_only_stripped.tar.gz"
$PbsUrl   = "https://github.com/astral-sh/python-build-standalone/releases/download/$PbsTag/" + $PbsFile.Replace("+", "%2B")

$Version = (Select-String -Path app\backend\app\main.py -Pattern 'version="([0-9.]+)"').Matches[0].Groups[1].Value
$Dist  = Join-Path $Root "dist"
$App   = Join-Path $Dist "win\ParticleLab"
$Cache = Join-Path $Dist ".cache"

function Step($n, $msg) { Write-Host "[$n/7] $msg" }
function Run($exe) { & $exe @args; if ($LASTEXITCODE -ne 0) { throw "$exe 실패 (종료 코드 $LASTEXITCODE)" } }

foreach ($f in "basic_pt\U-net++", "basic_pt\yolo_11") { if (-not (Test-Path $f)) { throw "AI 가중치가 없습니다: $f" } }

Step 1 "화면을 정적 파일로 내보내기"
Push-Location app\frontend
Run npm ci --no-audit --no-fund
if (Test-Path out) { Remove-Item out -Recurse -Force }
$env:BUILD_TARGET = "export"
Run npx next build
Remove-Item Env:BUILD_TARGET
Pop-Location

Step 2 "번들 뼈대"
if (Test-Path $App) { Remove-Item $App -Recurse -Force }
New-Item -ItemType Directory -Force -Path $App, $Cache, "$App\app\app\frontend" | Out-Null

Step 3 "파이썬 런타임"
$Tar = Join-Path $Cache $PbsFile
if (-not (Test-Path $Tar)) { Invoke-WebRequest -Uri $PbsUrl -OutFile $Tar }
Run tar -xzf $Tar -C $Dist\win                      # → dist\win\python
Get-ChildItem "$Dist\win\python" -Force | Move-Item -Destination $App
Remove-Item "$Dist\win\python" -Recurse -Force
$Py = Join-Path $App "python.exe"
Run $Py --version

Step 4 "패키지 설치 (PyTorch CPU 판 포함, 몇 분)"
Run $Py -m pip install --quiet --no-warn-script-location --upgrade pip
Run $Py -m pip install --quiet --no-warn-script-location torch torchvision --index-url https://download.pytorch.org/whl/cpu
Run $Py -m pip install --quiet --no-warn-script-location -r app\backend\requirements.txt
Run $Py -m pip uninstall --quiet -y pip setuptools wheel

Step 5 "프로그램 파일"
$Dest = Join-Path $App "app"
foreach ($f in "launcher.py", "hybrid_core.py", "evaluate.py", "unet_models.py", "unet_module.py", "unet_trainer.py",
               "weight_maps.py", "particle_morphology.py", "arial.ttf", "logo.png", "app.ico") { Copy-Item $f $Dest }
foreach ($d in "particle_core", "basic_pt", "demo_images") { Copy-Item $d $Dest -Recurse }
Copy-Item app\backend "$Dest\app" -Recurse
Copy-Item app\frontend\out "$Dest\app\frontend" -Recurse
Get-ChildItem $Dest -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force
New-Item -ItemType File -Force -Path "$Dest\.bundled" | Out-Null     # launcher.py 가 이 파일로 "설치된 앱"임을 안다
# 설치 폴더에는 .pyc 를 쓰지 않으므로 미리 만들어 둔다 (없으면 켤 때마다 다시 번역해서 느리다)
& $Py -m compileall -q -j 0 --invalidation-mode unchecked-hash "$App\Lib" $Dest | Out-Null

Step 6 "실행 파일"
Push-Location tools\win
Run rc /nologo /fo "$Dist\win\stub.res" stub.rc
Run cl /nologo /O2 /MD /W3 "/DPYVER=$PyDll" stub.c "$Dist\win\stub.res" "/Fo$Dist\win\stub.obj" "/Fe$App\ParticleLab.exe" /link /SUBSYSTEM:WINDOWS
Pop-Location
Remove-Item "$Dist\win\stub.res", "$Dist\win\stub.obj" -ErrorAction SilentlyContinue

# 번들이 스스로 뜨는지: 창 없이 서버만 올려 상태 확인 (launcher.py --selftest)
Push-Location $App
Run $Py -s -B app\launcher.py --selftest
Pop-Location

Step 7 "설치 프로그램"
$Iscc = (Get-Command iscc -ErrorAction SilentlyContinue).Source
if (-not $Iscc) { $Iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" }
if (-not (Test-Path $Iscc)) { throw "Inno Setup 6 이 없습니다 (choco install innosetup)" }
Run $Iscc /Qp "/DAppVersion=$Version" "/DSourceDir=$App" "/DOutDir=$Dist" tools\win\installer.iss

$Setup = Join-Path $Dist "ParticleLab-Setup-$Version.exe"
Write-Host ""
Write-Host ("완료: {0} ({1:N0} MB)" -f $Setup, ((Get-Item $Setup).Length / 1MB))
