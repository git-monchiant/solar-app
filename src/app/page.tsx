"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Loading from "@/components/ui/Loading";

// หน้าแรก = hub เลือกโมดูล (/home) — hub กรองการ์ดตาม role เองอยู่แล้ว
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const authed = typeof window !== "undefined" && !!localStorage.getItem("userId");
    router.replace(authed ? "/home" : "/login");
  }, [router]);

  return (
    <Loading />
  );
}
