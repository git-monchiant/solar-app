"use client";

import { useEffect, useState } from "react";

/**
 * Persists the current sub-step index to localStorage and restores it on mount.
 * - `key` is unique per step+lead, e.g. `installSubStep_42`.
 * - `defaultStep` is used when nothing is saved yet.
 * - `maxStep` is total number of sub-steps; values outside [0, maxStep) are ignored.
 */
export function useSubStep(
  key: string,
  defaultStep: number,
  maxStep: number
): [number, (n: number) => void] {
  const [subStep, setSubStepRaw] = useState(defaultStep);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      const n = parseInt(saved);
      if (!isNaN(n) && n >= 0 && n < maxStep) setSubStepRaw(n);
    }
  }, [key, maxStep]);

  const setSubStep = (n: number) => {
    setSubStepRaw(n);
    if (typeof window !== "undefined") {
      localStorage.setItem(key, String(n));
    }
  };

  return [subStep, setSubStep];
}
