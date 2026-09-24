"use client";

// รายละเอียดงานบริการของบ้าน 1 หลัง — /om/services/<house_id>  (เฟส 3 แผน 20260922-01)
//
// ★ ทำไมต้องมี URL: เดิมหน้านี้เป็น state ในหน้ารายการ (`if (sel) return <JobDetail/>`)
//   ⇒ กดปุ่ม back ของเบราว์เซอร์แล้วหลุดออกจากโมดูลไปเลย · refresh แล้วงานที่เปิดอยู่หาย
//     · ส่งลิงก์งานให้เพื่อนดูไม่ได้ · แชร์เข้า LINE ไม่ได้
//   ฝั่งขายมี /leads/[id] มาตั้งแต่ต้น ฝั่งนี้เพิ่งได้
//
// ★ คีย์เป็น house_id ไม่ใช่ booking_id — การ์ดในแท็บ "ติดตาม" คำนวณสดจากบ้าน
//   ยังไม่มีใบงานให้อ้าง (ผู้ใช้เคาะ 10 ก.ย.) บ้านจึงเป็นคีย์เดียวที่มีครบทุกแท็บ

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import JobDetail from "@/components/om/JobDetail";
import type { HistoryRow, Item } from "@/lib/om/service-view";

export default function OmServiceDetailPage({ params }: { params: Promise<{ house: string }> }) {
  const { house } = use(params);
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(() => {
    apiFetch(`/api/om/follow?house=${encodeURIComponent(house)}`)
      .then((d) => {
        const row = (d.items ?? [])[0] as Item | undefined;
        if (!row) { setErr("ไม่พบบ้านหลังนี้ในรายการงานบริการ"); return; }
        setItem(row);
        setHistory((d.history ?? []) as HistoryRow[]);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [house]);
  useEffect(load, [load]);

  const back = () => router.push("/om/services");

  if (err) return (
    <div className="p-6">
      <div className="max-w-[560px] rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{err}</div>
      <button type="button" onClick={back} style={{ minHeight: 0 }}
        className="mt-3 h-9 px-4 rounded-full border border-gray-200 text-sm font-bold text-gray-700 bg-white cursor-pointer">‹ กลับรายการ</button>
    </div>
  );
  if (!item) return <Loading />;

  return (
    <>
      <JobDetail
        item={item}
        history={history}
        onBack={back}
        onSaved={(m) => { setToast(m); setTimeout(() => setToast(""), 2600); }}
        onReload={load}
      />
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50">{toast}</div>}
    </>
  );
}
