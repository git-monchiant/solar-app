"use client";

// User-scope signature pad — user draws/clears their own signature.
// Mirrors the lead-scope SignaturePad but uploads under "type=user_sig" and
// PATCHes /api/users/{id} { signature_url } instead of touching a lead.
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Props {
  userId: number;
  initialUrl: string | null;
  onSaved?: (url: string | null) => void;
}

export default function UserSignaturePad({ userId, initialUrl, onSaved }: Props) {
  const [signatureUrl, setSignatureUrl] = useState<string | null>(initialUrl);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [saving, setSaving] = useState(false);
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
        const fd = new FormData();
        fd.append("file", new File([blob], `usersig_${userId}.png`, { type: "image/png" }));
        fd.append("type", "user_signature");
        fd.append("filename", `user${userId}_sig_${Date.now()}`);
        const res = await apiFetch("/api/upload", { method: "POST", body: fd });
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
        await apiFetch(`/api/users/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signature_url: url }),
        });
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
      apiFetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature_url: null }),
      }).catch(console.error);
      onSaved?.(null);
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
        <button type="button" onClick={clear} disabled={!hasDrawn} className="text-gray-500 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed">
          ล้าง
        </button>
        <span className={saving ? "text-amber-500" : signatureUrl ? "text-emerald-600" : "text-gray-400"}>
          {saving ? "กำลังบันทึก..." : signatureUrl ? "บันทึกแล้ว" : "ยังไม่บันทึก"}
        </span>
      </div>
    </div>
  );
}
