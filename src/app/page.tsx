"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// หน้าแรก = hub เลือกโมดูล (/home) — hub กรองการ์ดตาม role เองอยู่แล้ว
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const authed = typeof window !== "undefined" && !!localStorage.getItem("userId");
    router.replace(authed ? "/home" : "/login");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
    </div>
  );
}
