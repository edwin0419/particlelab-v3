"use client";

// 하단 바 — 모든 화면 공통. 색은 상단바와 같다 (흰 바탕 + 같은 구분선). 연구실 사이트(BRCL)의 하단 바와 같은 구성: 세종대 로고 · 연구실 · 주소 / BRCL 로고 · 저작권.
// 화면 내용 뒤에 덧붙을 뿐이라 각 화면의 배치(고정 패널 · 스크롤)에는 영향을 주지 않는다.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { health } from "@/lib/api";

/** BRCL 로고 — 연구실 사이트(홈페이지 테스트/assets/js/core.js 의 B.brcl)와 같은 그림. C 는 한 바퀴 도는 초록 화살표. */
function BrclLogo() {
  return (
    <span role="img" aria-label="BRCL" className="inline-flex items-center text-fg-mute">
      <svg viewBox="-2 -6 370 112" aria-hidden="true" className="block h-[15px] w-auto overflow-visible">
        <defs>
          <clipPath id="brcl-clip">
            <rect x="-20" y="0" width="420" height="100" />
          </clipPath>
        </defs>
        <g clipPath="url(#brcl-clip)" fill="none" stroke="currentColor" strokeWidth="22" strokeLinejoin="round">
          <path d="M11 -10V110M11 11H46A19.5 19.5 0 0 1 46 50H11M11 50H52A19.5 19.5 0 0 1 52 89H11" />
          <path transform="translate(96)" d="M11 110V11H46A19.5 19.5 0 0 1 46 50H11M42 50L74 112" />
          <path transform="translate(304)" d="M11 -10V89H62" />
        </g>
        <g transform="translate(190)" fill="#12a66d" stroke="#12a66d">
          <path d="M80.73 74.01A39 39 0 1 1 68.31 15.57" fill="none" strokeWidth="22" />
          <path d="M77.7 -2.1 91.3 27.8 58.9 33.2Z" stroke="none" />
        </g>
      </svg>
    </span>
  );
}

export default function SiteFooter() {
  const pathname = usePathname() ?? "/";
  const [version, setVersion] = useState("");
  useEffect(() => {
    health()
      .then((h) => setVersion(String((h as unknown as { version?: string }).version ?? "")))
      .catch(() => {});
  }, []);
  // 홈은 가운데 정렬된 폭, 나머지 화면은 본문과 같은 좌우 여백
  const wrap = pathname.startsWith("/home") ? "mx-auto w-full max-w-[1340px] px-6 lg:px-12" : "w-full px-4 lg:px-6";

  return (
    <footer className="bg-bg1 border-t border-line pt-8 pb-9 text-[12.5px] text-fg-faint">
      <div className={wrap}>
        <div className="flex items-center gap-[18px] min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/sejong-ko.svg" alt="세종대학교" width={261} height={55} className="h-10 w-auto flex-none" />
          <div className="grid gap-0.5 border-l border-line pl-[18px] font-light leading-[1.5]">
            <b className="text-[14px] font-bold text-fg">에너지자원공학과 배터리자원순환연구실</b>
            <span>05006 서울특별시 광진구 능동로 209 세종대학교</span>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-line-soft pt-[18px]">
          <BrclLogo />
          <span>© {new Date().getFullYear()} Battery Resource Circularity Lab, Sejong University</span>
          <span className="ml-auto">Particle Lab{version && ` ${version}`}</span>
        </div>
      </div>
    </footer>
  );
}
