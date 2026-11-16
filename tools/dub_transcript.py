"""받아쓴 스크립트(ElevenLabs 의 시간 표시가 있는 .doc/.html/.txt)로 더빙 맞춤을 돕는다.

venv/bin/python tools/dub_transcript.py <스크립트> <더빙_대본.md> <말한_대본.md> <고정.json>
- 목소리가 실제로 한 말(스크립트)을 대본의 장면에 나눠 담은 "말한 대본"과, 시간 표시를 고정점으로 바꾼 파일을 만든다.
  (읽다가 빠뜨린 문장이 있어도 장면 길이를 실제로 말한 양으로 잡을 수 있다.)
- 그 다음: tools/dub_align.py <voice.wav> <말한_대본.md> <맞춤.json> <고정.json>
"""
from __future__ import annotations

import difflib
import html
import json
import re
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from dub_align import load_scenes  # noqa: E402


def norm_map(text: str):
    idx = [i for i, ch in enumerate(text) if re.match(r"[0-9A-Za-z가-힣]", ch)]
    return "".join(text[i] for i in idx).lower(), idx


def main():
    src, md, out_md, out_anchor = sys.argv[1:5]
    raw = open(src, encoding="utf-8-sig").read()
    raw = html.unescape(re.sub(r"<[^>]+>", "", re.sub(r"<br\s*/?>", "\n", raw)))
    paras = [(int(m) * 60 + int(s), t.strip()) for m, s, t in re.findall(r"(\d\d):(\d\d)\s*\n([^\n]+)", raw)]
    spoken, marks = "", []
    for t, txt in paras:
        marks.append((t, len(spoken)))
        spoken += txt + " "
    scenes = load_scenes(md)
    script, bounds = "", []
    for s in scenes:
        bounds.append(len(script))
        script += s["say"] + " "
    a, ai = norm_map(script)
    b, bi = norm_map(spoken)
    ops = difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes()

    def to_spoken(pos_raw: int) -> int:
        """대본의 글자 위치 → 스크립트의 글자 위치"""
        p = next((k for k, i in enumerate(ai) if i >= pos_raw), len(a))
        for _tag, i1, i2, j1, j2 in ops:
            if i1 <= p < i2 or (p == i2 == len(a)):
                q = j1 + (0 if i2 == i1 else round((p - i1) / (i2 - i1) * (j2 - j1)))
                return bi[q] if q < len(bi) else len(spoken)
        return len(spoken)

    cuts = [to_spoken(p) for p in bounds] + [len(spoken)]
    # 장면 경계를 가까운 문장 시작으로 당긴다
    starts = [0] + [m.end() for m in re.finditer(r"[.?!]\s+", spoken)]
    for k in range(1, len(cuts) - 1):
        near = min(starts, key=lambda x: abs(x - cuts[k]))
        if abs(near - cuts[k]) <= 6:
            cuts[k] = near
    lines, said = ["| # | 시작 | 길이 | 화면 | 대본 |", "|---|---|---|---|---|"], []
    for k, s in enumerate(scenes):
        txt = spoken[cuts[k]:cuts[k + 1]]
        said.append(txt)
        lines.append(f"| {s['n']} | - | - | {s['title']} | {txt.strip() or '…'} |")
        d = len(norm_map(s["say"])[0]) - len(norm_map(txt)[0])
        if d > 8:
            print(f"장면 {s['n']} ({s['title']}): 대본보다 약 {d}자 적게 말함")
    open(out_md, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    anchors = []
    for t, pos in marks:
        if t == 0:
            continue
        k = max(i for i in range(len(scenes)) if cuts[i] <= pos)
        off = pos - cuts[k] - (len(said[k]) - len(said[k].lstrip()))
        txt = said[k].strip()
        # 문단이 문장 중간에서 시작하면 (시간 표시가 그 문장 시작이 아님) 쓰지 않는다
        if off > 0 and not re.search(r"[.?!]\s*$", txt[:off]):
            print(f"시간 표시 {t}초: 문장 중간이라 건너뜀")
            continue
        anchors.append([scenes[k]["n"], t, max(0, off), 1.5])
    json.dump(anchors, open(out_anchor, "w", encoding="utf-8"))
    print(f"장면 {len(scenes)} · 시간 표시 {len(marks)} → 고정점 {len(anchors)}")


if __name__ == "__main__":
    main()
