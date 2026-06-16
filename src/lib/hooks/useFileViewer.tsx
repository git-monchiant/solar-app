"use client";

import { useState, useCallback } from "react";
import PdfViewerModal from "@/components/ui/PdfViewerModal";
import { isMobileDevice, openInNewTab } from "@/lib/utils/device";

// Reusable file-preview hook. Wires up the modal state + render so each
// caller just does:
//
//   const viewer = useFileViewer();
//   ...
//   <a href={url} onClick={viewer.handler(url, "label")}>...</a>
//   ...
//   {viewer.modal}
//
// Replaces raw <a target="_blank"> on file/PDF links — those open fullscreen
// in iOS PWA standalone with no way back. PdfViewerModal gives a real X.
//
// Mobile only: on desktop there's a real browser chrome (tabs, back button),
// so we keep the old behaviour and just open the file in a new tab.
export function useFileViewer() {
  const [v, setV] = useState<{ url: string; label: string } | null>(null);

  // Mobile → in-app modal; desktop → new tab.
  const open = useCallback((url: string, label: string) => {
    if (isMobileDevice()) setV({ url, label });
    else openInNewTab(url);
  }, []);
  const close = useCallback(() => setV(null), []);

  // Return a click handler factory — keeps call sites short and stops both
  // default navigation and bubbling (most anchors sit inside clickable cards).
  const handler = useCallback((url: string, label: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    open(url, label);
  }, [open]);

  const modal = v ? (
    <PdfViewerModal url={v.url} label={v.label} onClose={close} />
  ) : null;

  return { open, close, handler, modal };
}
