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
//
// ★ ?focus=1 = เปิดมาในแท็บใหม่จากหน้ารายการ (useOpenOmService) เหมือนหน้า lead ฝั่งขาย
//   layout ซ่อนเมนูซ้ายให้เอง · หน้านี้ซ่อนปุ่มย้อนกลับ (แท็บใหม่ไม่มีที่ให้ย้อน)
//   และบันทึกแล้วโหลดข้อมูลใหม่อยู่หน้าเดิม แทนการเด้งไปหน้ารายการซ้อนในแท็บนี้

import { use, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import JobDetail from "@/components/om/JobDetail";
import type { BookingSummary, HistoryRow, Item } from "@/lib/om/service-view";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { OM_WORK_ROLES } from "@/lib/om/om-roles";

export default function OmServiceDetailPage({ params }: { params: Promise<{ house: string }> }) {
  const { house } = use(params);
  const router = useRouter();
  const focus = useSearchParams().get("focus") === "1";
  const [item, setItem] = useState<Item | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  // ใบงานทุกใบของบ้าน — แท็บ Timeline (แผน 20260928-05) มาในคำขอเดียวกับประวัติ
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  // ค่าในหน้าตั้งค่า O&M (call.* · booking.*) — ค่าเริ่มนัดโทรใหม่ · ช่วงวันนัด · ไม่รับสายกี่ครั้งตกแท็บ (แผน 20260929-03)
  const [rules, setRules] = useState<Record<string, unknown>>({});
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  // เปลี่ยนค่าหลังบันทึกในโหมด focus → JobDetail ขึ้นใหม่ทั้งตัว
  // ฟอร์มล้างค่า และรางกระโดดไปขั้นปัจจุบันตัวใหม่ของงาน
  const [ver, setVer] = useState(0);

  const load = useCallback(() =>
    apiFetch(`/api/om/follow?house=${encodeURIComponent(house)}`)
      .then((d) => {
        const row = (d.items ?? [])[0] as Item | undefined;
        if (!row) { setErr("ไม่พบบ้านหลังนี้ในรายการงานบริการ"); return; }
        setItem(row);
        setHistory((d.history ?? []) as HistoryRow[]);
        setBookings((d.bookings ?? []) as BookingSummary[]);
        setRules((d.rules ?? {}) as Record<string, unknown>);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e))),
  [house]);
  useEffect(() => { load(); }, [load]);

  // Account มาจากคิวรอยืนยันรับเงิน (ไม่มีการ์ดโมดูล O&M) — กลับคิว ไม่ใช่รายการงานบริการ (แผน 20261014-06)
  const { activeRoles } = useActiveRoles();
  const viewOnly = activeRoles.length > 0 && !hasRole(activeRoles, ...OM_WORK_ROLES);
  const back = () => router.push(viewOnly ? "/report/pending" : "/om/services");
  const done = focus ? () => { load().then(() => setVer((v) => v + 1)); } : back;

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
        key={ver}
        item={item}
        history={history}
        bookings={bookings}
        rules={rules}
        onBack={focus ? undefined : back}
        onDone={done}
        onSaved={(m) => { setToast(m); setTimeout(() => setToast(""), 2600); }}
        onReload={load}
      />
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50">{toast}</div>}
    </>
  );
}
