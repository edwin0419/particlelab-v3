"""통짜 더빙 파일에서 장면별 시작 시각을 찾는다.

venv/bin/python tools/dub_align.py <voice.wav(16kHz mono)> <더빙_대본.md> <out.json> [고정.json]
- 고정.json (선택): [[장면 번호, 시각(초)], …] — 여러 파일을 이어 붙인 더빙이면 파일이 시작하는 장면과 시각을 넣는다. 그 장면은 반드시 그 시각에서 시작한다.
  [[장면 번호, 시각, 장면 안 글자 위치, 허용 오차(초)], …] — 받아쓴 스크립트의 시간 표시처럼 대략의 시각일 때.
- 목소리를 쉬는 곳(무음)으로 조각내고, 장면을 순서대로 조각에 맞춘다 (장면 글자 수 ↔ 말한 시간, 동적 계획법).
- 결과: 장면마다 목소리가 시작하고 끝나는 시각.
"""
from __future__ import annotations

import json
import re
import sys
import wave

import numpy as np


def load_scenes(md: str):
    out = []
    for line in open(md, encoding="utf-8"):
        m = re.match(r"\|\s*(\d+)\s*\|[^|]*\|[^|]*\|([^|]*)\|(.*)\|\s*$", line)
        if m:
            out.append({"n": int(m.group(1)), "title": m.group(2).strip(), "say": m.group(3).strip()})
    return out


def speech_segments(path: str, min_gap: float, forced=()):
    w = wave.open(path)
    sr = w.getframerate()
    a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float) / 32768
    win = int(sr * 0.02)
    n = len(a) // win
    rms = np.sqrt((a[: n * win].reshape(n, win) ** 2).mean(1))
    sil = rms < max(0.004, np.percentile(rms, 95) * 0.03)
    segs, i = [], 0
    while i < n:
        if not sil[i]:
            j = i
            while j < n and not sil[j]:
                j += 1
            segs.append([i * 0.02, j * 0.02])
            i = j
        else:
            i += 1
    merged = [segs[0]]
    for s in segs[1:]:
        if s[0] - merged[-1][1] < min_gap:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    for t in forced:  # 파일 이음매에서는 쉼이 짧아도 반드시 끊는다
        for k, (b, e) in enumerate(merged):
            if b + 0.05 < t < e - 0.05:
                merged[k:k + 1] = [[b, t], [t, e]]
                break
    return merged, len(a) / sr


def main():
    wav, md, out = sys.argv[1:4]
    anchors = json.load(open(sys.argv[4], encoding="utf-8")) if len(sys.argv) > 4 else []
    scenes = load_scenes(md)
    # 고정점이 장면 중간이면 장면을 그 자리에서 둘로 나눈 "조각"으로 맞춘 뒤 다시 합친다
    cut_at = {}
    for an in anchors:
        if len(an) > 2 and an[2] > 0:
            cut_at.setdefault(an[0], []).append(an[2])
    units, first = [], {}
    for s in scenes:
        pos = [0] + sorted(cut_at.get(s["n"], [])) + [len(s["say"])]
        for k in range(len(pos) - 1):
            first[(s["n"], pos[k])] = len(units)
            units.append({"n": s["n"], "say": s["say"][pos[k]:pos[k + 1]]})
    chars = [max(1, len(re.sub(r"[\s.,?!·]", "", u["say"]))) for u in units]
    segs, total = speech_segments(wav, 0.22, [an[1] for an in anchors if len(an) == 2 and an[1] > 0])
    N, M = len(units), len(segs)
    rate = sum(e - b for b, e in segs) / sum(chars)  # 글자당 초 (쉬는 시간 제외)
    print(f"장면 {len(scenes)} · 조각 {N} · 목소리 조각 {M} · 글자당 {rate:.3f}초")
    voiced = np.concatenate([[0.0], np.cumsum([e - b for b, e in segs])])
    gap_after = [segs[j + 1][0] - segs[j][1] for j in range(M - 1)] + [9.0]
    # 고정: [장면, 시각] = 정확한 시각(파일 이음매) · [장면, 시각, 글자 위치, 허용 오차] = 받아쓴 스크립트의 대략 시각
    fixed = {}
    for an in anchors:
        u = first[(an[0], an[2] if len(an) > 2 else 0)]
        if u == 0:
            continue
        if len(an) == 2:
            fixed[u] = {next(j for j, (b, _e) in enumerate(segs) if b >= an[1] - 0.06)}
        else:
            tol = an[3] if len(an) > 3 else 1.5
            fixed[u] = {j for j, (b, _e) in enumerate(segs) if an[1] - tol <= b <= an[1] + tol + 0.5}
            if not fixed[u]:
                sys.exit(f"고정점 {an} 근처에 말이 시작하는 곳이 없습니다")
    INF = 1e18
    dp = np.full((N + 1, M + 1), INF)
    bk = np.zeros((N + 1, M + 1), int)
    dp[0, 0] = 0
    for i in range(1, N + 1):
        exp = chars[i - 1] * rate
        mid = i < N and units[i]["n"] == units[i - 1]["n"]  # 장면 안에서 나눈 자리: 쉼 벌점 없음
        for b in range(i, M + 1):
            pen = 0.0 if mid else 4.0 * max(0.0, 0.45 - gap_after[b - 1]) ** 2 / 0.04
            for a in range(max(i - 1, b - 30), b):
                if dp[i - 1, a] >= INF:
                    continue
                c = dp[i - 1, a] + (voiced[b] - voiced[a] - exp) ** 2 / exp + pen
                if c < dp[i, b]:
                    dp[i, b], bk[i, b] = c, a
        if i in fixed:
            keep = {j: dp[i, j] for j in fixed[i]}
            dp[i, :] = INF
            for j, v in keep.items():
                dp[i, j] = v
    if dp[N, M] >= INF:
        sys.exit("맞출 수 없습니다 (고정점 사이에 목소리 조각이 모자랍니다)")
    b, cuts = M, []
    for i in range(N, 0, -1):
        a = bk[i, b]
        cuts.append((a, b))
        b = a
    cuts.reverse()
    res, err = [], []
    for s in scenes:
        idx = [k for k, u in enumerate(units) if u["n"] == s["n"]]
        a, b = cuts[idx[0]][0], cuts[idx[-1]][1]
        err.append(voiced[b] - voiced[a] - sum(chars[k] for k in idx) * rate)
        res.append({"n": s["n"], "title": s["title"], "start": round(segs[a][0], 2), "end": round(segs[b - 1][1], 2), "gap": round(gap_after[b - 1], 2)})
    print("장면 길이 오차(초): 평균 %.2f · 최대 %.2f" % (np.mean(np.abs(err)), np.max(np.abs(err))))
    json.dump({"total": total, "scenes": res}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for r, e in zip(res, err):
        print(f"{r['n']:3d} {r['start']:7.2f} ~ {r['end']:7.2f} 오차 {e:+.1f} 뒤 쉼 {r['gap']:.2f}  {r['title']}")


if __name__ == "__main__":
    main()
