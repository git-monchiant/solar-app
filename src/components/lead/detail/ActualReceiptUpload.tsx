"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useActiveRoles, hasRole } from "@/lib/roles";
import { useDialog } from "@/components/ui/Dialog";

type ReceiptField =
  | "receipt_deposit_actual_url"
  | "receipt_order_before_actual_url"
  | "receipt_order_after_actual_url";

interface Props {
  leadId: number;
  /** Lead-level mode: PATCH /api/leads/[id] with { [field]: serialized }. */
  field?: ReceiptField;
  /** Per-installment mode: PATCH /api/payments/[paymentId] with { actual_receipt_url: serialized }. */
  paymentId?: number;
  /** Raw DB value — JSON array of URLs, or legacy single URL string, or null. */
  url: string | null;
  fileLabel: string;
  refresh: () => Promise<unknown> | void;
  /** Compact = smaller thumbnails (for header rows). */
  compact?: boolean;
  /** Numbering offset — first file in this instance is labelled "ใบเสร็จตัวจริง {startIndex+1}".
   * Lets parent (e.g. InstallmentReceiptList) chain numbering across installments. */
  startIndex?: number;
}

const MAX_FILES = 5;

function parseUrls(raw: string | null): string[] {
  if (!raw) return [];
  const v = raw.trim();
  if (!v) return [];
  if (v.startsWith("[")) {
    try {
      const arr = JSON.parse(v);
      if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === "string" && !!x);
    } catch { /* fall through */ }
  }
  return [v];
}

function serializeUrls(urls: string[]): string | null {
  return urls.length === 0 ? null : JSON.stringify(urls);
}

const isPdf = (u: string) => /\.pdf(\?|$)/i.test(u);
const isImage = (u: string) => /\.(png|jpe?g|gif|webp|heic|heif)(\?|$)/i.test(u);

export default function ActualReceiptUpload({ leadId, field, paymentId, url, refresh, fileLabel, compact, startIndex = 0 }: Props) {
  const urls = parseUrls(url);
  const [busy, setBusy] = useState(false);
  const { activeRoles } = useActiveRoles();
  const canManage = hasRole(activeRoles, "admin", "account");
  const dialog = useDialog();

  const persist = async (newUrls: string[]) => {
    const payload = serializeUrls(newUrls);
    if (paymentId) {
      await apiFetch(`/api/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actual_receipt_url: payload }),
      });
    } else if (field) {
      await apiFetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: payload }),
      });
    } else {
      throw new Error("ActualReceiptUpload: either `field` or `paymentId` is required");
    }
  };

  const uploadOne = async (file: File) => {
    if (urls.length >= MAX_FILES) {
      await dialog.alert({ title: "อัปโหลดไม่ได้", message: `ไฟล์เต็มแล้ว (สูงสุด ${MAX_FILES} ไฟล์)`, variant: "danger" });
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("filename", `${fileLabel}_receipt`);
      const res = await apiFetch("/api/upload", { method: "POST", body: fd }) as { url: string };
      await persist([...urls, res.url]);
      await refresh();
    } finally { setBusy(false); }
  };

  const removeAt = async (idx: number) => {
    const target = urls[idx];
    if (!target) return;
    const ok = await dialog.confirm({
      title: "Confirm",
      message: "ยืนยันการลบใบเสร็จตัวจริง",
      variant: "danger",
      confirmText: "ลบ",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const next = urls.filter((_, i) => i !== idx);
      await persist(next);
      apiFetch(`/api/upload?file=${encodeURIComponent(target)}`, { method: "DELETE" }).catch(() => {});
      await refresh();
    } finally { setBusy(false); }
  };

  // Hide entirely when nothing to do (no files + can't upload).
  if (urls.length === 0 && !canManage) return null;

  // Compact = thumbnails on mobile, text list on desktop. Mobile tiles render
  // as direct Fragment siblings so the parent (e.g. InstallmentReceiptList) can
  // place them inside a `grid grid-cols-6` row. Desktop wraps in its own span.
  if (compact) {
    return (
      <>
        {/* Mobile: aspect-square tile + caption underneath. Each wrapper fills
            1 grid cell of the parent's grid-cols-4 layout. */}
        {urls.map((u, i) => {
          const name = decodeURIComponent(u.split("/").pop() || "ไฟล์");
          const pdf = isPdf(u);
          const img = isImage(u);
          const label = `ใบเสร็จตัวจริง ${startIndex + i + 1}`;
          const caption = `ใบเสร็จ ${startIndex + i + 1}`;
          return (
            <div key={`m-${u}-${i}`} className="md:hidden flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
              <div
                className="relative aspect-square w-full rounded-md border-2 border-blue-500 bg-blue-50/40 overflow-hidden"
                title={`${label} · ${name}`}
              >
                <a href={u} target="_blank" rel="noreferrer" className="block w-full h-full">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-blue-600">
                      <FileIcon variant={pdf ? "pdf" : "doc"} className="w-7 h-7" />
                    </div>
                  )}
                </a>
                {canManage && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeAt(i); }}
                    disabled={busy}
                    aria-label="ลบไฟล์"
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white hover:bg-red-600 flex items-center justify-center disabled:opacity-50 transition-colors shadow"
                    style={{ minHeight: 0 }}
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <span className="text-xs text-center text-blue-700 truncate leading-tight font-medium">{caption}</span>
            </div>
          );
        })}
        {canManage && urls.length < MAX_FILES && (
          <div className="md:hidden flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
            <label
              className={`relative aspect-square w-full rounded-md border-2 border-dashed cursor-pointer flex items-center justify-center transition-colors ${busy ? "border-gray-200 text-gray-300" : "border-gray-300 text-gray-400 hover:border-primary hover:text-primary hover:bg-primary/5"}`}
              title={`เพิ่มใบเสร็จตัวจริง (${urls.length}/${MAX_FILES})`}
            >
              {busy ? (
                <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              )}
              <input type="file" accept="image/*,.pdf" className="hidden" disabled={busy} onChange={e => e.target.files?.[0] && uploadOne(e.target.files[0])} />
            </label>
            <span className="text-xs text-center text-gray-500 truncate leading-tight">{busy ? "กำลังอัป" : "เพิ่มไฟล์"}</span>
          </div>
        )}

        {/* Desktop: text list with comma separators (wrapped span) */}
        <span className="hidden md:inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" onClick={(e) => e.stopPropagation()}>
          {urls.map((u, i) => {
            const name = decodeURIComponent(u.split("/").pop() || "ไฟล์");
            const pdf = isPdf(u);
            const img = isImage(u);
            const label = `ใบเสร็จ ${startIndex + i + 1}`;
            const trailingComma = i < urls.length - 1 ? "," : "";
            return (
              <span key={`d-${u}-${i}`} className="inline-flex items-center gap-1">
                <a
                  href={u}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-800 hover:underline"
                  title={name}
                >
                  <FileIcon variant={pdf ? "pdf" : img ? "image" : "doc"} className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                  <span>{label}</span>
                </a>
                {canManage && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeAt(i); }}
                    disabled={busy}
                    aria-label="ลบไฟล์"
                    className="text-red-500 hover:text-red-700 disabled:opacity-50 px-0.5 font-bold"
                    style={{ minHeight: 0 }}
                  >
                    ✕
                  </button>
                )}
                {trailingComma && <span className="text-gray-400">{trailingComma}</span>}
              </span>
            );
          })}
          {canManage && urls.length < MAX_FILES && (
            <label
              className={`inline-flex items-center justify-center w-6 h-6 rounded-md border border-dashed cursor-pointer transition-colors ${busy ? "border-gray-200 text-gray-300" : "border-gray-300 text-gray-500 hover:border-primary hover:text-primary hover:bg-primary/5"}`}
              title={`เพิ่มใบเสร็จตัวจริง (${urls.length}/${MAX_FILES})`}
            >
              {busy ? (
                <span className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              )}
              <input type="file" accept="image/*,.pdf" className="hidden" disabled={busy} onChange={e => e.target.files?.[0] && uploadOne(e.target.files[0])} />
            </label>
          )}
        </span>
      </>
    );
  }

  // Full mode = text-based list with comma separators + small dashed + at the end.
  return (
    <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" onClick={(e) => e.stopPropagation()}>
      {urls.map((u, i) => {
        const name = decodeURIComponent(u.split("/").pop() || "ไฟล์");
        const pdf = isPdf(u);
        const img = isImage(u);
        const label = `ใบเสร็จตัวจริง ${startIndex + i + 1}`;
        const trailingComma = i < urls.length - 1 ? "," : "";
        return (
          <span key={`${u}-${i}`} className="inline-flex items-center gap-1">
            <a
              href={u}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              title={name}
            >
              <FileIcon variant={pdf ? "pdf" : img ? "image" : "doc"} className="w-4 h-4 shrink-0 text-primary/70" />
              <span>{label}</span>
            </a>
            {canManage && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeAt(i); }}
                disabled={busy}
                aria-label="ลบไฟล์"
                className="text-red-500 hover:text-red-700 disabled:opacity-50 px-0.5 font-bold"
                style={{ minHeight: 0 }}
              >
                ✕
              </button>
            )}
            {trailingComma && <span className="text-gray-400">{trailingComma}</span>}
          </span>
        );
      })}
      {canManage && urls.length < MAX_FILES && (
        <label
          className={`inline-flex items-center justify-center w-7 h-7 rounded-md border border-dashed cursor-pointer transition-colors ${busy ? "border-gray-200 text-gray-300" : "border-gray-300 text-gray-500 hover:border-primary hover:text-primary hover:bg-primary/5"}`}
          title={`เพิ่มใบเสร็จตัวจริง (${urls.length}/${MAX_FILES})`}
        >
          {busy ? (
            <span className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          )}
          <input type="file" accept="image/*,.pdf" className="hidden" disabled={busy} onChange={e => e.target.files?.[0] && uploadOne(e.target.files[0])} />
        </label>
      )}
    </div>
  );
}

function FileIcon({ variant, className }: { variant: "pdf" | "image" | "doc"; className?: string }) {
  if (variant === "image") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    );
  }
  // Page outline for PDF + generic — small "PDF" label inside the page for the
  // PDF variant so list items are distinguishable at a glance.
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}
