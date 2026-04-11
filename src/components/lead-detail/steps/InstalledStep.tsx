"use client";

import type { StepCommonProps } from "./types";

export default function InstalledStep({ state }: StepCommonProps) {
  if (state === "done") {
    return <div className="text-sm text-emerald-700 font-semibold">Installation complete</div>;
  }

  if (state !== "active") return null;

  return (
    <div className="text-sm text-gray-500">Installation in progress by install team</div>
  );
}
