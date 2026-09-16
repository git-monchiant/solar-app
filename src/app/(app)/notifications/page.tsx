"use client";

import Header from "@/components/layout/Header";
import { apiFetch } from "@/lib/api";
import { getNotificationTarget } from "@/lib/notification-navigation";
import { useActiveRoles } from "@/lib/roles";
import { formatThaiDate } from "@/lib/utils/formatters";
import { useCallback, useEffect, useState } from "react";

type NotificationItem = {
  id: number;
  notification_source: "quotation" | "accounting";
  quotation_id: number;
  lead_id: number;
  notification_type: string;
  approval_stage: string | null;
  title: string;
  message: string | null;
  read_at: string | null;
  created_at: string;
  doc_no: string;
  quotation_status: string;
  customer_name: string;
  created_by_name: string | null;
  target_url: string | null;
  resolved_at: string | null;
};

export default function NotificationsPage() {
  const { activeRoles } = useActiveRoles();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const stage = activeRoles.includes("admin")
    ? null
    : activeRoles.includes("solar_sup")
      ? "solar_sup"
      : activeRoles.includes("sales_sup")
        ? "sales_sup"
        : null;
  const accountScope = !activeRoles.includes("admin") && activeRoles.includes("account");
  const notificationUrl = `/api/notifications${stage ? `?stage=${stage}` : accountScope ? "?scope=account" : ""}`;

  const load = useCallback(async () => {
    try {
      setError("");
      const data = await apiFetch(notificationUrl);
      setItems(data.items || []);
      setUnreadCount(Number(data.unread_count) || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดการแจ้งเตือนไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [notificationUrl]);

  useEffect(() => { void load(); }, [load]);

  const markAllRead = async () => {
    setBusy(true);
    try {
      await apiFetch(notificationUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
      setUnreadCount(0);
      window.dispatchEvent(new Event("notifications:changed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "อัปเดตการแจ้งเตือนไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const openItem = async (item: NotificationItem) => {
    if (!item.read_at) {
      try {
        await apiFetch(notificationUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, source: item.notification_source }),
        });
      } catch {
        // Navigation is still useful if marking as read fails temporarily.
      }
    }
    window.dispatchEvent(new Event("notifications:changed"));
    window.location.href = getNotificationTarget(item, activeRoles);
  };

  return (
    <div>
      <Header
        title="การแจ้งเตือน"
        subtitle={`${unreadCount} รายการที่ยังไม่อ่าน`}
      />

      <main className="space-y-3 p-3 md:p-6">
        {unreadCount > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={markAllRead}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              อ่านทั้งหมด
            </button>
          </div>
        )}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading ? (
          <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-gray-200 border-t-primary" /></div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">ยังไม่มีการแจ้งเตือน</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {items.map((item) => (
              <button
                key={`${item.notification_source}-${item.id}`}
                type="button"
                onClick={() => void openItem(item)}
                className={`flex w-full gap-3 border-b border-gray-100 p-4 text-left last:border-b-0 hover:bg-gray-50 ${item.read_at ? "bg-white" : "bg-amber-50/60"} ${item.resolved_at ? "opacity-60" : ""}`}
              >
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.read_at ? "bg-gray-200" : "bg-red-500"}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900">
                      {item.title}
                      {item.resolved_at && <span className="ml-2 text-xxs font-medium text-gray-400">ดำเนินการแล้ว</span>}
                    </span>
                    <span className="text-xxs text-gray-400">{formatThaiDate(item.created_at, { time: true, buddhist: true })}</span>
                  </span>
                  {item.message && <span className="mt-1 block text-sm text-gray-600">{item.message}</span>}
                  <span className="mt-1 block text-xxs text-gray-400">{item.customer_name} · {item.doc_no}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
