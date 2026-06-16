"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PdfPreview from "@/components/lead/detail/PdfPreview";
import { DownloadIcon } from "@/components/ui/icons";
import { isMobileDevice } from "@/lib/utils/device";

interface Props {
  url: string;
  label?: string;
  /** Optional override for the download filename (defaults to the URL's basename). */
  filename?: string;
  onClose: () => void;
}

// Fullscreen modal wrapper around PdfPreview. Used for ad-hoc PDF previews
// (e.g. uploaded actual-receipt files) so PWA users have an X to close —
// browser back / window.close don't work in standalone home-screen mode.
export default function PdfViewerModal({ url, label, filename, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const baseFilename = filename || decodeURIComponent(url.split("/").pop() || "document.pdf");

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], baseFilename, { type: blob.type || "application/pdf" });
      if (isMobileDevice() && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = baseFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/70 flex flex-col safe-top" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="text-white text-sm font-semibold truncate pr-2">{label || baseFilename}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center text-xl shrink-0"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-auto px-4 pb-4 min-h-0 flex items-start justify-center" onClick={e => e.stopPropagation()}>
        {/\.(png|jpe?g|gif|webp|heic|heif)(\?|$)/i.test(url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label || baseFilename} className="max-w-full h-auto rounded-lg bg-white shadow-xl" />
        ) : (
          <div className="w-full">
            <PdfPreview pdfUrl={url} />
          </div>
        )}
      </div>
      <div className="px-4 py-3 shrink-0 flex justify-center safe-bottom" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-gray-900 text-sm font-semibold shadow-lg hover:bg-gray-100 disabled:opacity-70 disabled:cursor-wait transition-colors min-w-[160px] justify-center"
        >
          {saving ? (
            <>
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
              กำลังเตรียม…
            </>
          ) : (
            <>
              <DownloadIcon className="w-5 h-5" strokeWidth={2} />
              บันทึก
            </>
          )}
        </button>
      </div>
    </div>,
    document.body
  );
}
