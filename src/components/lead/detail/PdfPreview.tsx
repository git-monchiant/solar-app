"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  pdfUrl: string;
}

// Inline PDF preview that works in iOS PWA standalone mode. Uses pdfjs-dist to
// render each page as a canvas (multi-page scroll). Desktop falls back to a
// native iframe (Chrome renders multi-page PDFs fine).
export default function PdfPreview({ pdfUrl }: Props) {
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument(pdfUrl).promise;
        if (cancelled) return;
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";
        const cssWidth = Math.min(container.clientWidth, 794);
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          const scale = cssWidth / viewport.width;
          const scaled = page.getViewport({ scale });
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(scaled.width * dpr);
          canvas.height = Math.floor(scaled.height * dpr);
          canvas.style.width = `${scaled.width}px`;
          canvas.style.height = `${scaled.height}px`;
          canvas.className = "rounded-lg bg-white shadow-xl mb-3";
          container.appendChild(canvas);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport: scaled, transform: [dpr, 0, 0, dpr, 0, 0], canvas }).promise;
          if (cancelled) return;
        }
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("เปิดเอกสารไม่สำเร็จ");
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isMobile, pdfUrl]);

  if (!isMobile) {
    return (
      <div className="h-full flex items-stretch justify-center">
        <iframe src={pdfUrl} title="PDF" className="w-full max-w-[794px] h-full rounded-lg bg-white shadow-xl border-0" />
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} className="w-full max-w-[794px] mx-auto flex flex-col items-center" />
      {loading && (
        <div className="flex items-center justify-center py-10 text-white/80 text-sm gap-2">
          <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          กำลังโหลด…
        </div>
      )}
      {error && <div className="text-white/80 text-sm text-center py-10">{error}</div>}
    </>
  );
}
