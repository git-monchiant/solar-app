"use client";
import { MouseEvent, ReactNode, AnchorHTMLAttributes } from "react";
import { useOpenLead } from "@/lib/hooks/useOpenLead";

// Anchor-style entry point to a lead detail page. Renders a real <a> so
// Cmd+click / middle-click / right-click "open in new tab" / copy-link /
// keyboard activation all behave normally. The primary click is intercepted
// and routed through useOpenLead so behavior matches button-style call sites
// (desktop = new tab + focus=1, mobile = router.push).
// Omit `id` from the inherited anchor attributes — that one is `string` (the
// HTML id attribute) and would intersect with our `number | string`, silently
// narrowing it back to `string`.
type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "id"> & {
  id: number | string;
  children: ReactNode;
};

export function LeadLink({ id, onClick, children, ...rest }: Props) {
  const openLead = useOpenLead();
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    // Defer to the browser for modifier-key / non-primary clicks so users
    // can still force a new tab / new window the way they expect.
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openLead(id);
  };
  return (
    <a href={`/leads/${id}`} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
