"use client";

import { useEffect } from "react";

// Browsers natively change the value of <input type="number"> when the user
// scrolls the wheel while it's focused. That makes scrolling a form a
// landmine — you nudge a value without realising. This listens at document
// level and blurs the focused number input before the wheel event mutates it,
// so the page scrolls instead of the value changing.
export default function DisableNumberInputWheel() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.tagName === "INPUT" && (target as HTMLInputElement).type === "number" && target === document.activeElement) {
        target.blur();
      }
    };
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);
  return null;
}
