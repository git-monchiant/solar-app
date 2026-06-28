"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

// Single entry point for navigating to a lead detail page. Used by every
// "click a lead" affordance in the app so behavior is consistent:
//   • Desktop (≥500px): new tab with ?focus=1 — focus mode hides the back
//     arrow (nothing to go back to in a fresh tab) and shows a profile button
//     in its place.
//   • Mobile  (<500px): in-app router.push — back arrow returns to caller.
//
// Anchor-style call sites should use <LeadLink> instead so the browser keeps
// Cmd+click / middle-click / right-click / copy-link / keyboard semantics;
// LeadLink delegates here for the primary click.
export function useOpenLead() {
  const router = useRouter();
  return useCallback((id: number | string) => {
    const isLarge = typeof window !== "undefined" && window.matchMedia("(min-width: 500px)").matches;
    if (isLarge) window.open(`/leads/${id}?focus=1`, "_blank", "noreferrer");
    else router.push(`/leads/${id}`);
  }, [router]);
}
