"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

// เตือนก่อนออกจากหน้าเมื่อมีงานที่ยังไม่บันทึก (ทบทวน BOQ 15 ต.ค. — เดิมกันแค่ปิดแท็บ/รีโหลด)
//   ① ปิดแท็บ / รีโหลด → beforeunload ของเบราว์เซอร์
//   ② คลิกลิงก์ในแอป (เมนูซ้าย · แถบล่าง · ปุ่มกลับของ Header · ลิงก์ในหน้า) → ดักที่ document ช่วง capture ก่อน React/Link
//      ถามด้วยป๊อปอัปของแอป ตกลงแล้วค่อย router.push
//   ③ นำทางด้วยโค้ด → ใช้ guardedPush ที่ hook คืนให้
// ไม่ครอบปุ่มย้อนกลับของเบราว์เซอร์ (app router ไม่มีจุดดัก)
export function useUnsavedGuard(dirty: boolean, ask: () => Promise<boolean>) {
  const router = useRouter();

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;   // ลิงก์ในหน้าเดียวกัน (#)
      e.preventDefault();
      e.stopPropagation();   // ไม่ให้ถึง onClick ของ Link
      void ask().then((ok) => { if (ok) router.push(url.pathname + url.search + url.hash); });
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, ask, router]);

  return useCallback(async (href: string) => {
    if (!dirty || (await ask())) router.push(href);
  }, [dirty, ask, router]);
}
