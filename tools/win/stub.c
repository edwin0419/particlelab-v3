// ParticleLab.exe — Windows 앱의 실행 파일. 같은 폴더의 파이썬(python3xx.dll)을 불러 app\launcher.py 를 실행한다.
// python.exe 를 직접 띄우지 않는 이유: 작업 표시줄에 파이썬이 아니라 Particle Lab 이름과 아이콘이 나오게 하려고.
// 이 파일은 파이썬 런타임과 같은 폴더에 놓인다 (python3xx.dll · vcruntime140.dll · Lib 를 따로 지정하지 않아도 찾는다).
#include <windows.h>
#include <wchar.h>

#define N 4096
#define W2(x) L## #x
#define W(x) W2(x)   // PYVER=312 → L"312"

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE prev, PWSTR cmd, int show) {
    static wchar_t exe[N], dir[N], dll[N], script[N];
    (void)inst; (void)prev; (void)cmd; (void)show;
    if (!GetModuleFileNameW(NULL, exe, N)) return 1;
    wcscpy_s(dir, N, exe);
    wchar_t *slash = wcsrchr(dir, L'\\');
    if (!slash) return 1;
    *slash = 0;

    swprintf(dll, N, L"%ls\\python" W(PYVER) L".dll", dir);
    HMODULE lib = LoadLibraryExW(dll, NULL, LOAD_WITH_ALTERED_SEARCH_PATH);
    if (!lib) {
        MessageBoxW(NULL, L"프로그램 파일이 손상되었습니다 (python DLL 을 찾을 수 없음). 다시 설치해 주세요.", L"Particle Lab", MB_ICONERROR);
        return 1;
    }
    typedef int (*py_main_t)(int, wchar_t **);
    py_main_t py_main = (py_main_t)GetProcAddress(lib, "Py_Main");
    if (!py_main) return 1;

    swprintf(script, N, L"%ls\\app\\launcher.py", dir);
    // -s: 사용자 컴퓨터의 다른 파이썬 패키지를 섞지 않는다 · -B: 설치 폴더에 .pyc 를 쓰지 않는다 (빌드 때 미리 만들어 둔다)
    wchar_t *args[] = {exe, L"-s", L"-B", script, NULL};
    return py_main(4, args);
}
