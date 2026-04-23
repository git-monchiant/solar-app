"use client";

import { useEffect, useState } from "react";

// True on iOS / Android via UA sniff. Used to switch PDF/preview buttons
// between an in-app modal (mobile — inline PDF render) and a new tab
// (desktop — native PDF viewer). Returns false during SSR + first client
// tick to avoid hydration mismatch.
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);
  return isMobile;
}
