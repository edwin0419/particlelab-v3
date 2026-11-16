"use client";

// 배치 분석은 통합 "분석" 화면(/)으로 합쳐졌다. 예전 주소로 들어오면 이동.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BatchRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
