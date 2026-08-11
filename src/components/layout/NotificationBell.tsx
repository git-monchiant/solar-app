"use client";

import { apiFetch } from "@/lib/api";
import { formatThaiDate } from "@/lib/utils/formatters";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type NotificationItem = {
  id: number;
  lead_id: number;
  approval_stage: string | null;
  title: string;
  message: string | null;
  read_at: string | null;
  created_at: string;
  doc_no: string;
  quotation_status: string;
};

export default function NotificationBell() {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
    try {
      const data = await apiFetch("/api/notifications?summary=1");
      setUnreadCount(Number(data.unread_count) || 0);
    } catch {
      // The bell must never block the rest of the header.
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/notifications");
      setItems((data.items || []).slice(0, 8));
      setUnreadCount(Number(data.unread_count) || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดการแจ้งเตือนไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    const interval = window.setInterval(loadSummary, 60_000);
    window.addEventListener("focus", loadSummary);
    window.addEventListener("notifications:changed", loadSummary);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", loadSummary);
      window.removeEventListener("notifications:changed", loadSummary);
    };
  }, [loadSummary]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void loadItems();
  };

  const markAllRead = async () => {
    try {
      await apiFetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const readAt = new Date().toISOString();
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || readAt })));
      setUnreadCount(0);
      window.dispatchEvent(new Event("notifications:changed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "อัปเดตการแจ้งเตือนไม่สำเร็จ");
    }
  };

  const openItem = async (item: NotificationItem) => {
    if (!item.read_at) {
      try {
        await apiFetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id }),
        });
        setUnreadCount((current) => Math.max(0, current - 1));
        window.dispatchEvent(new Event("notifications:changed"));
      } catch {
        // Continue to the related work even when read-state update is unavailable.
      }
    }

    const stillWaitingForNotifiedStage =
      (item.approval_stage === "solar_sup" && item.quotation_status === "pending_solar_sup") ||
      (item.approval_stage === "sales_sup" && ["pending_sales_sup", "pending_approval"].includes(item.quotation_status));
    setOpen(false);
    router.push(stillWaitingForNotifiedStage ? "/quotation-approvals" : `/leads/${item.lead_id}?focus=1`);
  };

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-label={`การแจ้งเตือน${unreadCount > 0 ? `ที่ยังไม่อ่าน ${unreadCount} รายการ` : ""}`}
        aria-expanded={open}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${open ? "border-primary/30 bg-primary/10 text-primary" : "border-gray-200 bg-white/80 text-gray-600 hover:bg-white"}`}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section className="absolute right-0 top-11 z-[80] w-[calc(100vw-1.5rem)] max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div>
              <div className="text-sm font-bold text-gray-900">การแจ้งเตือน</div>
              <div className="text-xxs text-gray-400">{unreadCount} รายการที่ยังไม่อ่าน</div>
            </div>
            {unreadCount > 0 && (
              <button type="button" onClick={() => void markAllRead()} className="text-xs font-semibold text-primary hover:underline">
                อ่านทั้งหมด
              </button>
            )}
          </header>

          <div className="max-h-[min(60vh,28rem)] overflow-y-auto">
            {error ? (
              <div className="px-4 py-8 text-center text-xs text-red-600">{error}</div>
            ) : loading ? (
              <div className="flex justify-center py-10"><div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-primary" /></div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-gray-400">ยังไม่มีการแจ้งเตือน</div>
            ) : items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void openItem(item)}
                className={`flex w-full gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-b-0 hover:bg-gray-50 ${item.read_at ? "bg-white" : "bg-amber-50/60"}`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read_at ? "bg-gray-200" : "bg-red-500"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-gray-900">{item.title}</span>
                  {item.message && <span className="mt-0.5 block line-clamp-2 text-xs text-gray-500">{item.message}</span>}
                  <span className="mt-1 block text-xxs text-gray-400">{item.doc_no} · {formatThaiDate(item.created_at, { time: true, buddhist: true })}</span>
                </span>
              </button>
            ))}
          </div>

          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-gray-100 bg-gray-50 px-4 py-3 text-center text-xs font-semibold text-primary hover:bg-gray-100">
            ดูการแจ้งเตือนทั้งหมด
          </Link>
        </section>
      )}
    </div>
  );
}
