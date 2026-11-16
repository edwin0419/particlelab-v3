"use client";

// 오른쪽 설정 패널 폭 — 분석 · AI 진단이 같은 값(localStorage "plab.rightW")을 쓰고, 손잡이를 끌어 조절한다.

import { useEffect, useRef, useState } from "react";

const KEY = "plab.rightW";
const MIN = 320;
const MAX = 820;

export function useRightPanelWidth(initial = 420) {
  const [rightW, setRightW] = useState(initial);
  const resizing = useRef(false);

  useEffect(() => {
    try {
      const v = parseInt(localStorage.getItem(KEY) ?? "", 10);
      if (Number.isFinite(v) && v >= MIN && v <= MAX) setRightW(v);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      setRightW(Math.max(MIN, Math.min(MAX, window.innerWidth - e.clientX - 4)));
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      document.body.classList.remove("is-resizing");
      try {
        localStorage.setItem(KEY, String(rightW));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [rightW]);

  /** 손잡이의 onMouseDown 에 연결 */
  const startResize = () => {
    resizing.current = true;
    document.body.classList.add("is-resizing");
  };

  return { rightW, startResize };
}
