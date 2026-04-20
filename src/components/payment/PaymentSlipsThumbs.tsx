"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import FallbackImage from "@/components/ui/FallbackImage";

interface Slot {
  slot: number;
  url: string;
  filename: string | null;
}

// Render every slip stored against a confirmed payment. Supports the legacy
// `/api/slips/<id>` pointer too (single image). Clicking any thumbnail opens a
// gallery lightbox with prev/next.
export default function PaymentSlipsThumbs({ slipUrl, label, className }: {
  slipUrl: string | null | undefined;
  label?: string;
  className?: string;
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null);

  useEffect(() => {
    if (!slipUrl || !slipUrl.startsWith("/api/payments/")) { setSlots(null); return; }
    const payId = slipUrl.split("/").pop();
    let cancelled = false;
    apiFetch(`/api/payments/${payId}?list=1`)
      .then((r: { slots: Slot[] }) => { if (!cancelled) setSlots(r.slots); })
      .catch(() => { if (!cancelled) setSlots(null); });
    return () => { cancelled = true; };
  }, [slipUrl]);

  if (!slipUrl) return null;

  // Non-payment URLs (legacy `/api/slips/<id>` or direct file) — render as-is.
  if (!slipUrl.startsWith("/api/payments/") || slots === null) {
    return (
      <FallbackImage
        src={slipUrl}
        alt={label || "slip"}
        lightboxLabel={label}
        className={className ?? "max-h-40 max-w-full object-contain bg-gray-50 rounded-lg border border-gray-200 hover:opacity-80 transition"}
        fallbackLabel="สลิปหาย"
      />
    );
  }

  if (slots.length === 0) return null;

  const gallery = slots.map((s, i) => ({
    url: s.url,
    label: label ? `${label} ${i + 1}/${slots.length}` : `สลิป ${i + 1}/${slots.length}`,
  }));

  if (slots.length === 1) {
    return (
      <FallbackImage
        src={slots[0].url}
        alt={label || "slip"}
        lightboxLabel={label}
        className={className ?? "max-h-40 max-w-full object-contain bg-gray-50 rounded-lg border border-gray-200 hover:opacity-80 transition"}
        fallbackLabel="สลิปหาย"
      />
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {slots.map((s, idx) => (
        <FallbackImage
          key={s.slot}
          src={s.url}
          alt={`${label || "slip"} ${idx + 1}`}
          className="max-h-40 max-w-[40%] object-contain bg-gray-50 rounded-lg border border-gray-200 hover:opacity-80 transition"
          fallbackLabel="สลิปหาย"
          gallery={gallery}
          galleryIndex={idx}
        />
      ))}
    </div>
  );
}
