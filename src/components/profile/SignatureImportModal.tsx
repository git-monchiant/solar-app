"use client";

// Import-and-crop dialog for the profile signature. Lets the user pick a
// photo (e.g. scanned/snap-shot signature on paper), pan + zoom it inside a
// fixed 3:1 crop frame, then composite onto a 600×200 white canvas so the
// resulting signature has a clean white background regardless of the
// original photo (which can be warm-paper / shadowy / off-white).
//
// Output matches what the drawing pad uploads — a PNG blob — and is
// returned via onConfirm so the parent can run its existing upload path.
import { useEffect, useRef, useState } from "react";

interface Props {
  onClose: () => void;
  onConfirm: (blob: Blob) => Promise<void> | void;
}

const OUT_W = 600;
const OUT_H = 200;

export default function SignatureImportModal({ onClose, onConfirm }: Props) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState(false);
  // Set true once the picked image has loaded so we can fit it to the
  // crop frame and centre it.
  const [imgReady, setImgReady] = useState(false);
  // Background-white check on the source image. Red banner shows when the
  // four corners average to non-white — staff usually photograph the
  // signature on a notebook page or coloured paper, which composites
  // onto a grey/cream patch even after the forced white BG (because we
  // draw the full image, not just the ink strokes).
  const [bgWarning, setBgWarning] = useState<string | null>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      setImgSrc(String(fr.result));
      setTx(0); setTy(0); setScale(1); setImgReady(false);
    };
    fr.readAsDataURL(f);
    e.target.value = "";
  };

  // After load: scale the image so its longer side fills the crop frame
  // (cover-style). Keeps the signature visible even if the photo is huge.
  // Also samples 4 corners off-screen to gauge whether the BG is white.
  useEffect(() => {
    if (!imgSrc) return;
    const img = imgRef.current;
    const frame = frameRef.current;
    if (!img || !frame) return;
    const handle = () => {
      const fw = frame.clientWidth;
      const fh = frame.clientHeight;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      if (!iw || !ih || !fw || !fh) return;
      const s = Math.max(fw / iw, fh / ih);
      setScale(s);
      setTx(0); setTy(0);
      setImgReady(true);
      // Sample 4 corners (12×12 patches) to estimate the background tone.
      try {
        const probe = document.createElement("canvas");
        probe.width = iw; probe.height = ih;
        const pctx = probe.getContext("2d", { willReadFrequently: true });
        if (!pctx) return;
        pctx.drawImage(img, 0, 0);
        const p = 12;
        const corners: ImageData[] = [
          pctx.getImageData(0, 0, p, p),
          pctx.getImageData(iw - p, 0, p, p),
          pctx.getImageData(0, ih - p, p, p),
          pctx.getImageData(iw - p, ih - p, p, p),
        ];
        let r = 0, g = 0, b = 0, n = 0;
        for (const d of corners) {
          for (let i = 0; i < d.data.length; i += 4) {
            r += d.data[i]; g += d.data[i + 1]; b += d.data[i + 2]; n++;
          }
        }
        r /= n; g /= n; b /= n;
        const minRGB = Math.min(r, g, b);
        const maxDelta = Math.max(r, g, b) - minRGB; // colour cast
        // "Near white" = every channel ≥ 235 and ≤ ~10pt drift between
        // channels (so off-white but neutral still passes; warm/cool tints
        // and clearly grey/cream paper fail).
        if (minRGB < 235 || maxDelta > 12) {
          setBgWarning(`พื้นหลังรูปไม่ขาว (RGB ≈ ${Math.round(r)},${Math.round(g)},${Math.round(b)}) — แนะนำให้ใช้รูปลายเซ็นบนกระดาษขาวล้วน`);
        } else {
          setBgWarning(null);
        }
      } catch { setBgWarning(null); }
    };
    if (img.complete) handle();
    else img.onload = handle;
  }, [imgSrc]);

  // Pointer drag — pan inside the crop frame.
  const dragging = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (!imgReady) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setTx(dragging.current.tx + (e.clientX - dragging.current.x));
    setTy(dragging.current.ty + (e.clientY - dragging.current.y));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  // Composite the visible crop onto a 600×200 canvas with a forced white
  // background so the saved signature always reads as ink-on-white,
  // regardless of the photo's paper colour.
  const confirm = async () => {
    const img = imgRef.current;
    const frame = frameRef.current;
    if (!img || !frame) return;
    setBusy(true);
    try {
      const fw = frame.clientWidth;
      const fh = frame.clientHeight;
      const canvas = document.createElement("canvas");
      canvas.width = OUT_W; canvas.height = OUT_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // White background — overrides any paper tint in the source photo.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, OUT_W, OUT_H);
      // Map preview pixels → output pixels.
      const px = OUT_W / fw;
      const py = OUT_H / fh;
      // Image is rendered at scale s with offset (tx, ty) measured from
      // the frame centre. Reproduce that transform on the canvas.
      const iw = img.naturalWidth * scale;
      const ih = img.naturalHeight * scale;
      const drawX = ((fw - iw) / 2 + tx) * px;
      const drawY = ((fh - ih) / 2 + ty) * py;
      const drawW = iw * px;
      const drawH = ih * py;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error("toBlob null")), "image/png");
      });
      await onConfirm(blob);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4 safe-top safe-bottom" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="text-sm font-bold text-gray-900">นำเข้าลายเซ็นจากรูป</div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="w-8 h-8 rounded-full text-gray-500 hover:bg-gray-100 flex items-center justify-center text-lg">✕</button>
        </div>
        <div className="p-4 space-y-3">
          {!imgSrc ? (
            <label className="flex flex-col items-center justify-center gap-2 px-4 py-10 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 hover:border-primary hover:bg-primary/5 cursor-pointer transition-colors">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
              <span className="text-sm text-gray-600">เลือกรูป (JPG / PNG)</span>
              <span className="text-xs text-gray-400">ระบบจะตัดเป็นกรอบ 3:1 และพื้นหลังขาว</span>
              <input type="file" accept="image/*" className="hidden" onChange={onPick} />
            </label>
          ) : (
            <>
              <div
                ref={frameRef}
                className="relative w-full overflow-hidden bg-gray-100 rounded-lg select-none touch-none border border-gray-200"
                style={{ aspectRatio: "3 / 1", cursor: dragging.current ? "grabbing" : "grab" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={imgSrc}
                  alt="signature"
                  draggable={false}
                  style={{
                    position: "absolute",
                    left: "50%", top: "50%",
                    transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(${scale})`,
                    transformOrigin: "center center",
                    maxWidth: "none", maxHeight: "none",
                    pointerEvents: "none",
                    visibility: imgReady ? "visible" : "hidden",
                  }}
                />
                {/* Crop overlay frame */}
                <div className="pointer-events-none absolute inset-0 ring-2 ring-primary/70 rounded-lg" />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 shrink-0">ขนาด</span>
                <input
                  type="range" min={0.1} max={4} step={0.01}
                  value={scale}
                  onChange={e => setScale(parseFloat(e.target.value))}
                  className="flex-1 accent-primary"
                />
              </div>
              {bgWarning && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <span>{bgWarning}</span>
                </div>
              )}
              <div className="text-xs text-gray-400 text-center">ลากรูปเพื่อจัดตำแหน่ง · เลื่อนแถบเพื่อย่อ/ขยาย</div>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
          {imgSrc && (
            <button type="button" onClick={() => setImgSrc(null)} className="h-9 px-4 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-100 transition-colors">
              เลือกรูปใหม่
            </button>
          )}
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-100 transition-colors">
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!imgSrc || !imgReady || busy}
            className="h-9 px-5 rounded-lg text-xs font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {busy ? "กำลังบันทึก..." : "ใช้รูปนี้"}
          </button>
        </div>
      </div>
    </div>
  );
}
