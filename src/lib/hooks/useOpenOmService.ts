"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

// ทางเข้าหน้ารายละเอียดงานบริการ O&M — พฤติกรรมเดียวกับ useOpenLead ของฝั่งขายเป๊ะ
//   • จอกว้าง (≥500px): เปิดแท็บใหม่ ?focus=1 — layout ซ่อนเมนูซ้าย/แถบล่าง
//     หน้ารายละเอียดซ่อนปุ่มย้อนกลับ และบันทึกแล้วอยู่หน้าเดิม (ไม่เด้งไปรายการในแท็บใหม่)
//   • มือถือ (<500px): router.push ในแท็บเดิม — ปุ่ม ‹ กลับไปรายการได้
export function useOpenOmService() {
  const router = useRouter();
  return useCallback((houseId: number | string) => {
    const isLarge = typeof window !== "undefined" && window.matchMedia("(min-width: 500px)").matches;
    if (isLarge) window.open(`/om/services/${houseId}?focus=1`, "_blank", "noreferrer");
    else router.push(`/om/services/${houseId}`);
  }, [router]);
}
