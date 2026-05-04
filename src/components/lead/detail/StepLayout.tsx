"use client";

import { ReactNode } from "react";
import type { CardStateKind } from "./steps/types";

// Sub-step label — string for shared label, tuple `[mobile, desktop]` for
// responsive labels (e.g. tighter wording on mobile screens).
export type SubStepLabel = string | readonly [string, string];

interface StepLayoutProps {
  state: CardStateKind;
  /** Sub-step labels. Omit or pass a single-element array to hide the indicator bar. */
  subSteps?: readonly SubStepLabel[];
  /** Current sub-step (controlled by parent via useSubStep). */
  subStep?: number;
  onSubStepChange?: (n: number) => void;
  expanded?: boolean;
  onToggle?: () => void;
  /** Label shown when collapsed in done state. */
  doneHeader: ReactNode;
  /** Content revealed when done state is expanded. */
  renderDone?: () => ReactNode;
  /** Active-state content. Not needed when state is "done" (uses renderDone). */
  children?: ReactNode;
}

function scrollToActive() {
  setTimeout(() => {
    document
      .querySelector("[data-step-active]")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
}

export default function StepLayout({
  state,
  subSteps,
  subStep = 0,
  onSubStepChange,
  expanded,
  onToggle,
  doneHeader,
  renderDone,
  children,
}: StepLayoutProps) {
  const multi = (subSteps?.length ?? 0) > 1;

  if (state === "done") {
    return (
      <div className="text-sm">
        <div onClick={() => onToggle?.()} className="flex items-center gap-2 py-1 cursor-pointer">
          <div className="flex-1 min-w-0 flex items-center gap-2">{doneHeader}</div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
        {expanded && renderDone && (
          <div className="space-y-3 mt-3 pt-3 border-t border-gray-100">{renderDone()}</div>
        )}
      </div>
    );
  }

  if (state !== "active") return null;

  return (
    <div>
      {multi && (
        <div className="flex items-center gap-1 mb-3">
          {subSteps!.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onSubStepChange?.(i);
                scrollToActive();
              }}
              className="flex-1 flex flex-col items-center gap-1 cursor-pointer"
            >
              <div className={`h-1 w-full rounded-full transition-colors ${i <= subStep ? "bg-active" : "bg-gray-200"}`} />
              <span
                className={`text-xs font-semibold transition-colors ${
                  i === subStep ? "text-active" : i < subStep ? "text-gray-500" : "text-gray-300"
                }`}
              >
                {typeof label === "string" ? label : (
                  <>
                    <span className="md:hidden">{label[0]}</span>
                    <span className="hidden md:inline">{label[1]}</span>
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
