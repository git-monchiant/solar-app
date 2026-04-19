"use client";

import { useRouter, usePathname } from "next/navigation";
import { useRef } from "react";

const ORDER = ["/today", "/pipeline", "/packages", "/dashboard"];

export default function SwipeNav({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const start = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!start.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    start.current = null;

    // Only horizontal, must be significant, mostly horizontal not vertical
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;

    const idx = ORDER.findIndex(p => pathname === p || pathname.startsWith(p + "/"));
    const isMainNav = ORDER.includes(pathname);

    if (isMainNav && idx !== -1) {
      // Main nav page → cycle through nav menu
      if (dx < 0 && idx < ORDER.length - 1) router.push(ORDER[idx + 1]);
      else if (dx > 0 && idx > 0) router.push(ORDER[idx - 1]);
    } else {
      // Detail page → swipe right = back
      if (dx > 0) router.back();
    }
  };

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="h-full">
      {children}
    </div>
  );
}
