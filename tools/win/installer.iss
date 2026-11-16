; Particle Lab — Windows 설치 프로그램 (Inno Setup 6). tools\build_win_app.ps1 이 호출한다.
;   iscc /DAppVersion=3.0.0 /DSourceDir=...\dist\win\ParticleLab /DOutDir=...\dist tools\win\installer.iss
; 관리자 권한 없이 사용자 폴더(%LOCALAPPDATA%\Programs)에 설치한다.
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6F0B1D52-7C1E-4B56-9B0A-PARTICLELAB01}
AppName=Particle Lab
AppVersion={#AppVersion}
AppPublisher=Battery Resource Circularity Lab, Sejong University
DefaultDirName={autopf}\Particle Lab
DefaultGroupName=Particle Lab
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutDir}
OutputBaseFilename=ParticleLab-Setup-{#AppVersion}
SetupIconFile={#SourceDir}\app\app.ico
UninstallDisplayIcon={app}\ParticleLab.exe
Compression=lzma2/normal
SolidCompression=no
WizardStyle=modern

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[UninstallDelete]
; AI Hybrid 를 처음 쓸 때 앱이 가중치의 .pt 사본을 만든다 (app\backend\app\engines_ai.py ensure_pt_suffix). 설치 목록에 없으니 따로 지운다.
Type: files; Name: "{app}\app\basic_pt\*.pt"

[Icons]
Name: "{group}\Particle Lab"; Filename: "{app}\ParticleLab.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Particle Lab"; Filename: "{app}\ParticleLab.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\ParticleLab.exe"; Description: "{cm:LaunchProgram,Particle Lab}"; Flags: nowait postinstall skipifsilent
