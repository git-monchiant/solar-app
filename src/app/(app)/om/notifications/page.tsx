"use client";

// แจ้งเตือนงาน O&M (เฟส 6 ของแผน 20260922-01)
// ★★ แยกจากกล่องแจ้งเตือนกลางของฝั่งขายโดยตั้งใจ — ผู้ใช้ย้ำ 24 ก.ย. 69 ว่างาน O&M
//   ต้องอยู่ในการ์ด O&M เท่านั้น และตาราง om_ ไม่มีบนฐาน v2 เอาไปต่อกล่องกลางแล้วกระดิ่งทุกคนดับ
//   (เหตุผลเต็มอยู่หัวไฟล์ src/lib/om/notifications.ts)
// ★ เปลือกรายการยกจาก /notifications ของฝั่งขายทั้งก้อน (กติกา ui-rules) เปลี่ยนแค่เนื้อใน

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import { formatThaiDate } from "@/lib/utils/formatters";

type Item = {
  id: number;
  notification_type: string;
  title: string;
  message: string | null;
  target_url: string;
  house_id: number | null;
  house_number: string | null;
  customer_name: string | null;
  created_by_name: string | null;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

export default function OmNotificationsPage() {
  const { item: activeItem } = useActiveMenuItem();   // หัวเรื่อง = ชื่อเมนู (กติกา ui-rules)
  const router = useRouter();
  const [items, setItems] = useState<Item[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch("/api/om/notifications");
      setItems(d.items ?? []);
      setUnread(Number(d.unread) || 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดการแจ้งเตือนไม่สำเร็จ");
      setItems([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const markAllRead = async () => {
    setBusy(true);
    try {
      await apiFetch("/api/om/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const at = new Date().toISOString();
      setItems((cur) => (cur ?? []).map((x) => ({ ...x, read_at: x.read_at || at })));
      setUnread(0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อัปเดตไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const open = async (it: Item) => {
    if (!it.read_at) {
      // กดแล้วต้องไปถึงงานเสมอ ถึงบันทึกว่าอ่านแล้วจะพลาด — ไม่ขวางการเดินทาง
      try { await apiFetch("/api/om/notifications", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: it.id }),
      }); } catch { /* ไปต่อ */ }
    }
    router.push(it.target_url);
  };

  return (
    <div>
      <Header title={activeItem?.label ?? "แจ้งเตือน"} subtitle={`O&M · ${unread} รายการที่ยังไม่อ่าน`} />

      <main className="p-3 md:p-4 space-y-3 max-w-[900px]">
        {err && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>}
        {unread > 0 && (
          <div className="flex justify-end">
            <button type="button" disabled={busy} onClick={() => void markAllRead()}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              อ่านทั้งหมด
            </button>
          </div>
        )}
        {items === null ? <Loading /> : items.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
            ยังไม่มีการแจ้งเตือน
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {items.map((it) => (
              <button key={it.id} type="button" onClick={() => void open(it)}
                className={`flex w-full gap-3 border-b border-gray-100 p-4 text-left last:border-b-0 hover:bg-gray-50 ${it.read_at ? "bg-white" : "bg-amber-50/60"} ${it.resolved_at ? "opacity-60" : ""}`}>
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${it.read_at ? "bg-gray-200" : "bg-red-500"}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900">
                      {it.title}
                      {it.resolved_at && <span className="ml-2 text-xxs font-medium text-gray-400">จบเรื่องแล้ว</span>}
                    </span>
                    <span className="text-xxs text-gray-400">{formatThaiDate(it.created_at, { time: true, buddhist: true })}</span>
                  </span>
                  {it.message && <span className="mt-1 block text-sm text-gray-600">{it.message}</span>}
                  <span className="mt-1 block text-xxs text-gray-400">
                    {[it.customer_name, it.house_number && `บ้าน ${it.house_number}`, it.created_by_name && `โดย ${it.created_by_name}`]
                      .filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
