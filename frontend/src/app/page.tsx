"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getToken } from "@/lib/session";

// URL gốc: có phiên → hội thoại (router chọn môn, D-28), chưa có → UI-01.
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getToken() ? "/chat" : "/login");
  }, [router]);
  return null;
}
