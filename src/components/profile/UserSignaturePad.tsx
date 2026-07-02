"use client";

// User-scope signature pad — user draws/clears their own signature.
// Mirrors the lead-scope SignaturePad but uploads under "type=user_sig" and
// PATCHes /api/users/{id} { signature_url } instead of touching a lead.
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import SignatureImportModal from "./SignatureImportModal";

interface Props {
  userId: number;
  initialUrl: string | null;
  onSaved?: (url: string | null) => void;
}

export default function UserSignaturePad({ userId, initialUrl, onSaved }: Props) {
  const [signatureUrl, setSignatureUrl] = useState<string | null>(initialUrl);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
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
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null; }
  };
  useEffect(() => () => cancelAutoSave(), []);

  const upload = async (): Promise<string | null> => {
    const c = canvasRef.current;
    if (!c || !hasDrawn) return signatureUrl;
    return new Promise((resolve) => {
      c.toBlob(async (blob) => {
        if (!blob) return resolve(null);
        const res = await apiFetch(`/api/users/${userId}/signature`, {
          method: "PUT",
          headers: { "Content-Type": "image/png" },
          body: blob,
        });
        resolve(res.url || null);
      }, "image/png");
    });
  };

  const autoSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const url = await upload();
      if (url) {
        setSignatureUrl(url);
        onSaved?.(url);
      }
    } finally { setSaving(false); }
  };

  const scheduleAutoSave = () => {
    cancelAutoSave();
    autoSaveTimerRef.current = setTimeout(autoSave, 1200);
  };

  const getCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = getCoords(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y); ctx.stroke();
    if (!hasDrawn) setHasDrawn(true);
  };
  const onUp = () => {
    drawingRef.current = false;
    if (hasDrawn && !saving) scheduleAutoSave();
  };

  const clear = () => {
    cancelAutoSave();
    const c = canvasRef.current; if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
    if (signatureUrl) {
      setSignatureUrl(null);
      apiFetch(`/api/users/${userId}/signature`, { method: "DELETE" }).catch(console.error);
      onSaved?.(null);
    }
  };

  // Cropped image from the import modal — push straight through the
  // existing signature PUT endpoint and re-paint the preview canvas.
  const handleImport = async (blob: Blob) => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/users/${userId}/signature`, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: blob,
      });
      const url = res.url || null;
      if (url) {
        // Force the effect that paints the canvas to re-run by toggling
        // hasDrawn back to false before setting the new URL.
        setHasDrawn(false);
        setSignatureUrl(url);
        onSaved?.(url);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-lg border border-gray-200 bg-white" style={{ aspectRatio: "3 / 1" }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full h-full touch-none rounded-lg"
          style={{ touchAction: "none" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        />
        {!hasDrawn && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-300 pointer-events-none">
            ลงลายเซ็นที่นี่
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <button type="button" onClick={clear} disabled={!hasDrawn} className="text-gray-500 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed">
            ล้าง
          </button>
          <button type="button" onClick={() => setImportOpen(true)} className="text-primary hover:text-primary-dark font-semibold inline-flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
            </svg>
            นำเข้ารูป
          </button>
        </div>
        <span className={saving ? "text-amber-500" : signatureUrl ? "text-emerald-600" : "text-gray-400"}>
          {saving ? "กำลังบันทึก..." : signatureUrl ? "บันทึกแล้ว" : "ยังไม่บันทึก"}
        </span>
      </div>
      {importOpen && (
        <SignatureImportModal
          onClose={() => setImportOpen(false)}
          onConfirm={handleImport}
        />
      )}
    </div>
  );
}
