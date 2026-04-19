"use client";

import { RefObject, useEffect, useRef, useState } from "react";

export function usePullToRefresh(
  ref: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<void> | void,
  threshold = 70
) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onRefreshRef = useRef(onRefresh);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  const refreshingRef = useRef(false);
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const pullYRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (el.scrollTop > 0) return;
      startYRef.current = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (startYRef.current == null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy > 0 && el.scrollTop === 0) {
        pullingRef.current = true;
        // rubber-band damping
        const y = Math.min(dy * 0.5, 150);
        pullYRef.current = y;
        setPullY(y);
        if (dy > 10 && e.cancelable) e.preventDefault();
      } else if (dy < 0) {
        // user scrolled up — cancel pull
        pullingRef.current = false;
        pullYRef.current = 0;
        setPullY(0);
        startYRef.current = null;
      }
    };

    const onEnd = async () => {
      if (pullingRef.current && pullYRef.current >= threshold) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullY(threshold);
        try {
          await onRefreshRef.current();
        } catch (err) {
          console.error(err);
        }
        refreshingRef.current = false;
        setRefreshing(false);
      }
      pullYRef.current = 0;
      setPullY(0);
      startYRef.current = null;
      pullingRef.current = false;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [ref, threshold]);

  return { pullY, refreshing };
}
