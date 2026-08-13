"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  getModule, matchMenuHref, ACTIVE_MODULE_KEY, ACTIVE_MODULE_EVENT,
  type AppModule, type ModuleMenuItem,
} from "@/lib/modules";

// ค่าโมดูลที่เลือก (sync จาก localStorage + event) — ที่เดียวแทนการก็อป listener
// ไว้ตาม BottomNav / pipeline / today
export function useActiveModuleKey(): string | null {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setKey(localStorage.getItem(ACTIVE_MODULE_KEY));
    read();
    window.addEventListener(ACTIVE_MODULE_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(ACTIVE_MODULE_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return key;
}

// โมดูลปัจจุบัน + เมนูที่ active (เทียบ path+query กับ href ของเมนู) — หน้า list
// ใช้ทำหัวเรื่องตามชื่อเมนูโดยไม่ต้องรู้จัก tab เอง
export function useActiveMenuItem(): { module: AppModule | null; item: ModuleMenuItem | null } {
  const key = useActiveModuleKey();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mod = getModule(key);
  if (!mod) return { module: null, item: null };
  for (const mi of mod.menu) {
    if (matchMenuHref(mi.href, pathname, searchParams)) return { module: mod, item: mi };
    for (const c of mi.children ?? []) {
      if (matchMenuHref(c.href, pathname, searchParams)) return { module: mod, item: c };
    }
  }
  return { module: mod, item: null };
}
