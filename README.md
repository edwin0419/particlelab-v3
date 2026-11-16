# ParticleLab — SEM 입자 분석 (웹)

기존 두 프로그램을 하나로 합친 웹앱입니다.

| 기능 | 출처 |
|---|---|
| 배치 분석 (폴더 → 라벨 이미지 · 히스토그램 · 요약카드 · 경계/응집도/DBSCAN · Excel 11시트 · PPT) | `particle_analyzer` (PyQt 데스크톱) |
| 파라미터 튜너 (단일 이미지, SEM 전처리 실시간 미리보기, 분할 미리보기, 파라미터 JSON) | `particle_parameter_tuner` |
| **AI Hybrid 분할 엔진** (U-Net × YOLO) — 위 두 기능에서 watershed 대신 선택 가능 | `LIB-Particle_Lab_v2` |
| AI 모델 진단 콘솔 (정답 마스크 대비 7지표, 12개 진단 뷰) | `LIB-Particle_Lab_v2` (그대로 포함, `/hybrid-lab`) |

분할(segmentation) 단계만 **엔진**으로 교체되고, 그 뒤의 특성 추출 → Before/After 필터 → 통계 → Excel/PPT 는 두 엔진이 공유합니다.

## 실행 (Windows)

사전 설치: Python 3.10+ (PATH 등록), Node.js 18+.

0. **기본 가중치 받기** (저장소에는 포함되지 않음, 약 90MB). 이 저장소의 [Releases](https://github.com/bjade11/ParticleLab/releases) 또는 원본 [LIB-Particle_Lab_v2 v2.0.0 릴리스](https://github.com/edwin0419-ko/LIB-Particle_Lab_v2/releases/tag/v2.0.0)에서 `U-net++.pt`, `yolo_11.pt` 를 내려받아 프로젝트 루트의 `basic_pt/` 폴더에 **확장자를 뗀 이름**으로 넣습니다.
   ```
   basic_pt/U-net++
   basic_pt/yolo_11
   ```
   없어도 Watershed 엔진은 동작하며, AI Hybrid 엔진만 사용할 수 없습니다.
1. `START.bat` 더블클릭. 처음이면 `SETUP.bat` 이 자동 실행되어 venv 생성, PyTorch(NVIDIA GPU 있으면 CUDA 12.1), 패키지 설치, 프런트 빌드까지 약 5~10분.
2. 브라우저가 `http://localhost:3001` 로 열립니다.
3. 종료: `STOP.bat`.

수동 실행:

```powershell
# 백엔드 (포트 8765)
.\venv\Scripts\Activate.ps1
$env:PYTHONPATH = "$PWD;$PWD\app\backend"
cd app\backend; python -m uvicorn app.main:app --host 127.0.0.1 --port 8765

# 프런트 (포트 3001)
cd app\frontend; npm run dev
```

코드를 수정한 뒤에는 `SETUP.bat` 을 다시 실행해 패키지와 프런트 빌드를 갱신하세요.

## 실행 (macOS)

사전 설치: Python 3.10–3.13, Node.js 18+. Apple Silicon 에서는 AI Hybrid 엔진이 Apple GPU(MPS)로 돌아갑니다.

0. 가중치는 Windows 와 같이 `basic_pt/U-net++`, `basic_pt/yolo_11` (확장자 없음).
1. Finder 에서 `START.command` 더블클릭 (또는 터미널에서 `./START.command`). 처음이면 `SETUP.command` 가 자동 실행되어 `venv` 생성, PyTorch, 패키지 설치, 프런트 빌드까지 약 5~10분.
2. 기본 브라우저가 `http://localhost:3001` 로 열립니다.
3. 종료: 실행 중인 터미널 창을 닫거나 Ctrl+C, 또는 `STOP.command`.

코드를 수정한 뒤에는 `SETUP.command` 를 다시 실행하세요. 로그는 `logs/backend.log`, `logs/frontend.log`.

## macOS 앱 (dmg) 만들기

`tools/build_mac_app.sh` 를 실행하면 `dist/Particle Lab.app` 과 `dist/ParticleLab-<버전>-arm64.dmg` 가 나옵니다 (Apple Silicon 전용, 약 700MB). 받는 사람은 dmg 를 열어 앱을 응용 프로그램으로 끌어다 놓기만 하면 되고, Python · Node 를 설치할 필요가 없습니다.

- 앱은 창 하나로 뜨고 (`launcher.py`), 분석 결과는 `~/Documents/Particle Lab/runs`, 로그는 `~/Library/Logs/Particle Lab/app.log` 에 저장됩니다. (Windows 는 아래 "Windows 설치 파일 만들기" 참고)
- 서명은 임시 서명입니다. 다른 Mac 에서 처음 열 때는 우클릭 → 열기가 필요합니다 (Apple 개발자 서명 · 공증은 포함되어 있지 않습니다).
- 만드는 Mac 에는 `SETUP.command` 를 마친 환경, Xcode 명령줄 도구, 인터넷(파이썬 런타임을 한 번 내려받음)이 필요합니다.

## Windows 설치 파일 만들기

GitHub 저장소의 **Actions → Windows installer → Run workflow** 를 누르면 GitHub 의 Windows 서버가 `ParticleLab-Setup-<버전>.exe` 를 만들고, 실행 기록의 Artifacts 에서 내려받을 수 있습니다 (`.github/workflows/windows-installer.yml`). Windows PC 에서 직접 만들려면 `tools\build_win_app.ps1` 을 실행합니다.

- 받는 사람은 설치 파일만 실행하면 됩니다 (관리자 권한 · Python · Node 불필요). PyTorch 는 CPU 판이 들어가므로 AI Hybrid 는 GPU 판보다 느립니다.
- 서명하지 않은 설치 파일이라 처음 실행할 때 Windows SmartScreen 경고가 뜹니다 ("추가 정보 → 실행").
- 설치 위치는 `%LOCALAPPDATA%\Programs\Particle Lab`, 결과는 Windows 의 실제 문서 폴더(OneDrive 로 옮겨졌으면 그쪽)의 `Particle Lab\runs`, 로그는 `%LOCALAPPDATA%\Particle Lab\Logs\app.log` 입니다. 제거해도 결과 폴더는 남습니다.
- 화면 글꼴(G마켓 산스)은 앱에 들어 있어 인터넷이 없어도 같은 화면이 나옵니다 (`app/frontend/public/fonts`).

Windows PC 에서 직접 만들기 (Windows 10/11, 기본 PowerShell 5.1 로 동작 확인):

1. 준비물 설치 — 한 번만. C++ 빌드 도구는 수 GB 이고 관리자 확인 창이 뜹니다.
   ```powershell
   winget install --id OpenJS.NodeJS.LTS -e
   winget install --id JRSoftware.InnoSetup -e
   winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
   ```
2. "x64 Native Tools Command Prompt for VS 2022" 를 열고 (또는 `vcvars64.bat` 을 부른 cmd 에서) 저장소 폴더에서:
   ```bat
   powershell -ExecutionPolicy Bypass -File tools\build_win_app.ps1
   ```
   약 15~25분 걸리고, 마지막에 번들이 스스로 뜨는지 점검(`launcher.py --selftest`)한 뒤 `dist\ParticleLab-Setup-<버전>.exe` 를 만듭니다.

`tools\build_win_app.ps1` 은 한글 주석 때문에 UTF-8 (BOM 포함) 으로 저장되어 있어야 PowerShell 5.1 이 제대로 읽습니다. 고칠 때 인코딩을 바꾸지 마세요.

## 화면

- **홈** `/home` — 프로그램을 켜면 처음 열리는 화면. 원본과 분할 결과 비교 그림, 각 화면으로 가는 카드.
- **분석** `/` — 이미지를 올리거나 서버 폴더 경로를 입력하고, 엔진(Watershed / AI Hybrid)과 설정을 맞춥니다. 한 장을 골라 **미리보기**로 결과(전처리 · 라벨 · 입도 표)를 확인한 뒤 **전체 분석**을 누르면 체크한 이미지 전체가 분석되어 Excel / PPT / zip 과 결과 갤러리가 나옵니다. 결과는 기본으로 `runs/<시각>_<이름>/` 에 저장됩니다. (예전의 튜너와 배치 분석을 합친 화면이며 `/batch` 는 이곳으로 이동합니다.)
- **AI 진단** `/hybrid-lab` — 정답 마스크와 비교해 AI 분할을 평가하고 진단 뷰 · 형상 지표를 봅니다. 설정은 분석 화면과 공유합니다.

- **소개** `/intro` — 장면이 자동으로 넘어가는 안내. "프로그램 소개"와 "설정 항목" 두 편이며 더빙이 함께 나옵니다 (`public/intro/voice/`).

분석과 AI 진단의 AI Hybrid 는 같은 모델 · 같은 설정을 쓰며, 같은 조건이면 같은 입자가 나옵니다 (분석 화면의 "필터 전" = AI 진단의 입자 수).

개발용 점검: `app/frontend` 에서 `npm run check` (타입 검사 + ESLint), 루트에서 `python tests/smoke_core.py`.

## 폴더 구조

```
particle_core/        분석 코어 (헤드리스). params / io_utils / preprocess / segment / engines /
                      measure / filters / stats / spatial / viz / report / pipeline / morphology
hybrid_core.py, unet_*.py, evaluate.py   AI 코어
basic_pt/             기본 가중치 (U-net++, yolo_11 — 확장자 없음)
app/backend/app/      FastAPI: main.py, jobs.py, engines_ai.py, api/{tuner,batch,fs,hybrid}.py
app/frontend/         Next.js 14 — src/app (홈 · 분석 · AI 진단 · 소개), src/components/{analysis,hybrid,params,ui,batch}, src/lib
runs/                 배치 결과 (자동 생성)
tools/                소개 자료를 만드는 스크립트 (아래 "소개 자료 만들기")
소개자료/             내보낸 영상 · 더빙 대본 · 자막
DESIGN.md             설계 명세 (파라미터 스키마, API, 모듈 계약)
```

## 소개 자료 만들기

앱을 켠 상태에서 `venv/bin/python` 으로 실행합니다. 장면 내용은 `app/frontend/src/lib/introScenes.ts` (소개) 와 `paramScenes.ts` (설정 항목) 에 있습니다.

| 스크립트 | 하는 일 |
|---|---|
| `tools/intro_capture.py` | 소개 편에 쓰는 화면 캡처와 알고리즘 단계 그림 |
| `tools/param_examples.py` · `tools/param_capture.py` | 설정 항목 편의 값 비교 그림과 설정 패널 캡처 |
| `tools/intro_video.py [--set params]` | 4K 영상(무음 · 자막 포함), 더빙 대본, 자막 → `소개자료/` |
| `tools/dub_transcript.py` · `tools/dub_align.py` | 더빙 파일에서 장면별 목소리 시각 찾기 |
| `tools/intro_video.py --voice …` → `tools/mux_audio.swift` | 장면 길이를 목소리에 맞춘 영상에 소리 입히기 |
| `tools/intro_voice.py` | 소개 탭에서 같은 더빙이 나오게 하기 |

자세한 순서는 `tools/intro_video.py` 맨 위 설명에 있습니다. (macOS 전용: `afconvert`, `swift` 사용)

## 원본 대비 수정된 동작

데스크톱 버전의 다음 문제를 고쳤습니다. 수치가 원본과 미세하게 다를 수 있습니다.

- 하단 크롭과 Gaussian 블러가 두 번 적용되던 것을 한 번으로 수정. 경계 분석 이미지가 크기 불일치로 저장되지 않던 문제도 함께 해결.
- 윤곽선 맵이 비어 있어 Boundary Stats 가 항상 0이고 contour-only 이미지가 빈 배경이던 문제 수정.
- `min_size`(작은 객체 제거 임계)가 UI 값과 무관하게 30 으로 고정되던 문제 수정.
- PPT 생성 시 샘플 `S1` 이 `S10` 이미지까지 끌어오던 접두 매칭 수정.
- 최신 matplotlib 에서 `seaborn` 스타일 오류로 정규분포 그림이 생성되지 않던 문제 수정.

## API

`http://localhost:8765/docs` 에서 전체 스키마를 볼 수 있습니다. 주요 엔드포인트와 파라미터 스키마는 `DESIGN.md` 참고.
