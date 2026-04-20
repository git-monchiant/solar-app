"use client";

import { useEffect } from "react";

export interface LightboxImage {
  url: string;
  label?: string;     // small top-left badge, e.g. "สลิป 1 / 3" or filename
}

interface Props {
  images: LightboxImage[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}

// Fullscreen viewer for photos/slips. Arrow keys + click-outside + swipe-style prev/next.
export default function ImageLightbox({ images, index, onIndexChange, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && images.length > 1) onIndexChange((index - 1 + images.length) % images.length);
      else if (e.key === "ArrowRight" && images.length > 1) onIndexChange((index + 1) % images.length);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [index, images.length, onIndexChange, onClose]);

  if (!images[index]) return null;
  const current = images[index];
  const multi = images.length > 1;

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/80"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center text-xl safe-top"
        aria-label="ปิด"
      >
        ✕
      </button>
      {current.label && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-white text-xs font-semibold font-mono tabular-nums safe-top max-w-[70vw] truncate">
          {current.label}
        </div>
      )}
      <img
        src={current.url}
        alt={current.label || `Image ${index + 1}`}
        className="max-w-[92vw] max-h-[80vh] object-contain rounded-lg select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
      {multi && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onIndexChange((index - 1 + images.length) % images.length); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/50 text-white flex items-center justify-center text-xl"
            aria-label="ก่อนหน้า"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onIndexChange((index + 1) % images.length); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/50 text-white flex items-center justify-center text-xl"
            aria-label="ถัดไป"
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}
