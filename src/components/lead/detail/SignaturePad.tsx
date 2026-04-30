"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Props {
  leadId: number;
  /** Lead column that stores the signature URL (same field reused across steps). */
  fieldName: string;
  /** Initial/existing signature URL from the lead. */
  initialUrl: string | null;
  /** Called after a new signature is saved or cleared. */
  onSaved?: (url: string | null) => void;
}

export default function SignaturePad({ leadId, fieldName, initialUrl, onSaved }: Props) {
  const [signatureUrl, setSignatureUrl] = useState<string | null>(initialUrl);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [sigSaving, setSigSaving] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fsHasDrawn, setFsHasDrawn] = useState(false);

  const inlineCanvasRef = useRef<HTMLCanvasElement>(null);
  const inlineDrawingRef = useRef(false);
  const fsCanvasRef = useRef<HTMLCanvasElement>(null);
  const fsDrawingRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inline canvas setup + load existing signature image
  useEffect(() => {
    const c = inlineCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    if (signatureUrl && !hasDrawn) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        setHasDrawn(true);
      };
      img.src = signatureUrl;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureUrl]);

  const cancelAutoSave = () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  };
  useEffect(() => { return () => cancelAutoSave(); }, []);

  // fieldName looks like "survey_customer_signature_url" — the route key drops
  // the "_signature_url" suffix.
  const fieldKey = fieldName.replace(/_signature_url$/, "");
  const sigEndpoint = `/api/leads/${leadId}/signature/${fieldKey}`;

  const uploadSignature = async (): Promise<string | null> => {
    const c = inlineCanvasRef.current;
    if (!c || !hasDrawn) return signatureUrl;
    return new Promise((resolve) => {
      c.toBlob(async (blob) => {
        if (!blob) return resolve(null);
        const res = await apiFetch(sigEndpoint, {
          method: "PUT",
          headers: { "Content-Type": "image/png" },
          body: blob,
        });
        resolve(res.url || null);
      }, "image/png");
    });
  };

  const autoSaveSignature = async () => {
    if (sigSaving) return;
    setSigSaving(true);
    try {
      const url = await uploadSignature();
      if (url) {
        setSignatureUrl(url);
        onSaved?.(url);
      }
    } finally { setSigSaving(false); }
  };

  const scheduleAutoSave = () => {
    cancelAutoSave();
    autoSaveTimerRef.current = setTimeout(() => { autoSaveSignature(); }, 1200);
  };

  const getInlineCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = inlineCanvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (c.width / rect.width), y: (e.clientY - rect.top) * (c.height / rect.height) };
  };
  const onInlineDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = inlineCanvasRef.current?.getContext("2d"); if (!ctx) return;
    inlineDrawingRef.current = true;
    const { x, y } = getInlineCoords(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const onInlineMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!inlineDrawingRef.current) return;
    const ctx = inlineCanvasRef.current?.getContext("2d"); if (!ctx) return;
    const { x, y } = getInlineCoords(e);
    ctx.lineTo(x, y); ctx.stroke();
    if (!hasDrawn) setHasDrawn(true);
  };
  const onInlineUp = () => {
    inlineDrawingRef.current = false;
    if (hasDrawn && !sigSaving) scheduleAutoSave();
  };
  const clearInline = () => {
    cancelAutoSave();
    const c = inlineCanvasRef.current; if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
    if (signatureUrl) {
      setSignatureUrl(null);
      apiFetch(sigEndpoint, { method: "DELETE" }).catch(console.error);
      onSaved?.(null);
    }
  };

  // Fullscreen setup
  useEffect(() => {
    if (!fullscreen) return;
    const fs = fsCanvasRef.current; if (!fs) return;
    fs.width = window.innerHeight;
    fs.height = window.innerWidth;
    const ctx = fs.getContext("2d"); if (!ctx) return;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    ctx.clearRect(0, 0, fs.width, fs.height);
    setFsHasDrawn(false);
    const inline = inlineCanvasRef.current;
    if (inline && hasDrawn) {
      ctx.drawImage(inline, 0, 0, fs.width, fs.height);
    } else if (signatureUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => ctx.drawImage(img, 0, 0, fs.width, fs.height);
      img.src = signatureUrl;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  const fsCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = fsCanvasRef.current!;
    const parent = c.parentElement!;
    const rect = parent.getBoundingClientRect();
    const wcx = rect.left + rect.width / 2;
    const wcy = rect.top + rect.height / 2;
    const vx = e.clientX - wcx;
    const vy = e.clientY - wcy;
    const lx = vy;
    const ly = -vx;
    const ww = c.offsetWidth;
    const wh = c.offsetHeight;
    return { x: (lx + ww / 2) * (c.width / ww), y: (ly + wh / 2) * (c.height / wh) };
  };
  const onFsDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = fsCanvasRef.current?.getContext("2d"); if (!ctx) return;
    fsDrawingRef.current = true;
    const { x, y } = fsCoords(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const onFsMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!fsDrawingRef.current) return;
    const ctx = fsCanvasRef.current?.getContext("2d"); if (!ctx) return;
    const { x, y } = fsCoords(e);
    ctx.lineTo(x, y); ctx.stroke();
    if (!fsHasDrawn) setFsHasDrawn(true);
  };
  const onFsUp = () => { fsDrawingRef.current = false; };
  const onFsClear = () => {
    const c = fsCanvasRef.current; if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setFsHasDrawn(false);
    if (signatureUrl) {
      setSignatureUrl(null);
      apiFetch(sigEndpoint, { method: "DELETE" }).catch(console.error);
      onSaved?.(null);
    }
  };
  const onFsDone = () => {
    const fs = fsCanvasRef.current;
    const inline = inlineCanvasRef.current;
    let drew = false;
    if (fs && inline && fsHasDrawn) {
      const ctx = inline.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, inline.width, inline.height);
        ctx.drawImage(fs, 0, 0, inline.width, inline.height);
      }
      setHasDrawn(true);
      drew = true;
    }
    setFullscreen(false);
    if (drew) setTimeout(() => { autoSaveSignature(); }, 50);
  };

  return (
    <>
      <div className="space-y-2">
        <div className="relative bg-white border border-gray-200 rounded-lg overflow-hidden" style={{ touchAction: "none" }}>
          <canvas
            ref={inlineCanvasRef}
            width={600}
            height={220}
            className="w-full h-44 cursor-crosshair"
            onPointerDown={onInlineDown}
            onPointerMove={onInlineMove}
            onPointerUp={onInlineUp}
            onPointerLeave={onInlineUp}
          />
          {!hasDrawn && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none">
              ให้ลูกค้าเซ็นชื่อที่นี่
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={clearInline} disabled={!hasDrawn} className="flex-1 h-10 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-40">ล้าง</button>
          <button type="button" onClick={() => setFullscreen(true)} className="flex-1 h-10 rounded-lg text-xs font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50 flex items-center justify-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
            ขยายเต็มจอ
          </button>
        </div>
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-[9999] bg-white overflow-hidden" style={{ touchAction: "none" }}>
          <div className="absolute" style={{ width: "100vh", height: "100vw", top: "50%", left: "50%", transform: "translate(-50%, -50%) rotate(90deg)" }}>
            <canvas ref={fsCanvasRef} className="block w-full h-full cursor-crosshair" style={{ touchAction: "none" }}
              onPointerDown={onFsDown} onPointerMove={onFsMove} onPointerUp={onFsUp} onPointerLeave={onFsUp} />
            {!fsHasDrawn && !signatureUrl && !hasDrawn && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-base pointer-events-none">ให้ลูกค้าเซ็นชื่อที่นี่</div>
            )}
            <div className="absolute top-4 right-4 flex gap-2">
              <button onClick={onFsClear} className="h-10 px-4 rounded-lg text-sm font-semibold text-gray-700 border border-gray-300 bg-white/90 backdrop-blur hover:bg-white">ล้าง</button>
              <button onClick={() => setFullscreen(false)} className="h-10 px-4 rounded-lg text-sm font-semibold text-gray-700 border border-gray-300 bg-white/90 backdrop-blur hover:bg-white">ยกเลิก</button>
              <button onClick={onFsDone} className="h-10 px-4 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark">เสร็จ</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
