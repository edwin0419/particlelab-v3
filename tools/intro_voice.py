"""소개 탭에서 더빙이 나오게 한다: 목소리 파일과 장면 시작 시각을 app/frontend/public/intro/voice/ 에 넣는다.

venv/bin/python tools/intro_voice.py <intro|params> <목소리 파일(mp3/m4a)> <더빙_맞춤.json>
- 장면 경계는 tools/intro_video.py 의 fit_to_voice 와 같다 (앞 장면의 말이 끝난 때와 다음 장면의 말이 시작하는 때의 가운데).
"""
import json
import subprocess
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "app/frontend/public/intro/voice"


def main():
    key, audio, align = sys.argv[1:4]
    v = json.loads(Path(align).read_text(encoding="utf-8"))
    sc = v["scenes"]
    cuts = [0.0] + [round((sc[i - 1]["end"] + sc[i]["start"]) / 2, 2) for i in range(1, len(sc))]
    OUT.mkdir(parents=True, exist_ok=True)
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", "-c", "1", audio, str(OUT / f"{key}.m4a")], check=True)
    (OUT / f"{key}.json").write_text(json.dumps({"total": round(v["total"], 2), "cuts": cuts}), encoding="utf-8")
    print(f"{key}: 장면 {len(cuts)} · {v['total']:.0f}초 · {(OUT / f'{key}.m4a').stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
