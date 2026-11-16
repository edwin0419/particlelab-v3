// Particle Lab.app 의 실행 파일. 번들 안의 파이썬(Resources/python)을 불러 Resources/app/launcher.py 를 실행한다.
// 파이썬 실행 파일을 직접 띄우지 않고 이 파일이 파이썬을 품는 이유: 프로세스가 번들의 실행 파일이어야
// Dock · 메뉴 막대에 앱 이름과 아이콘이 제대로 나온다.
#include <dlfcn.h>
#include <libgen.h>
#include <limits.h>
#include <mach-o/dyld.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(int argc, char **argv) {
    char raw[PATH_MAX], exe[PATH_MAX], res[PATH_MAX], buf[PATH_MAX];
    uint32_t n = sizeof(raw);
    if (_NSGetExecutablePath(raw, &n) != 0 || !realpath(raw, exe)) return 1;
    snprintf(res, sizeof(res), "%s/../Resources", dirname(exe));  // Contents/MacOS → Contents/Resources
    if (!realpath(res, buf)) return 1;
    strlcpy(res, buf, sizeof(res));

    snprintf(buf, sizeof(buf), "%s/python", res);
    setenv("PYTHONHOME", buf, 1);
    setenv("PLAB_BUNDLED", "1", 1);
    setenv("PYTHONDONTWRITEBYTECODE", "1", 1);  // 번들 안에 .pyc 를 쓰지 않는다 (빌드 때 미리 만들어 둔다)
    setenv("PYTHONNOUSERSITE", "1", 1);         // 사용자 컴퓨터의 다른 파이썬 패키지를 섞지 않는다
    unsetenv("PYTHONPATH");

    snprintf(buf, sizeof(buf), "%s/python/lib/libpython" PYVER ".dylib", res);
    void *lib = dlopen(buf, RTLD_NOW | RTLD_GLOBAL);
    if (!lib) { fprintf(stderr, "python 을 불러오지 못했습니다: %s\n", dlerror()); return 1; }
    int (*py_main)(int, char **) = (int (*)(int, char **))dlsym(lib, "Py_BytesMain");
    if (!py_main) return 1;

    static char script[PATH_MAX];
    snprintf(script, sizeof(script), "%s/app/launcher.py", res);
    char *args[] = {argv[0], script, NULL};
    return py_main(2, args);
}
