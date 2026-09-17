"use client";

// เช็คลิสต์ — รายการงานที่ช่างต้องกรอกใบตรวจรับงาน (หน้าลงจอดของเมนู "เช็คลิสต์")
// ★ ผู้ใช้สั่ง 16 ก.ย. 69 ให้เป็นเมนูซ้าย — แต่ /om/field/[id] ต้องมีเลขใบงานเสมอ
//   เมนูจึงลิงก์มาหน้านี้ก่อน แล้วค่อยกดเข้าใบของแต่ละงาน
// ★ สถานะที่ต้องกรอกใบ = ยืนยันแล้ว · กำลังทำ · รอปิดงาน (ก่อนหน้านั้นยังไม่ถึงคิวช่าง)
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import { statusLabel, statusTone } from "@/lib/om/booking";

type Row = {
  id: number; house_number: string | null; project_name: string | null;
  service_type: string | null; status: string; scheduled_at: string | null;
  team_id: number | null; team_name: string | null; team_color: string | null;
  queue_index: number | null; customer_name: string | null; customer_phone: string | null;
};

const FIELD_STATUS = ["confirmed", "progress", "checked"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const thDate = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
const thTime = (s: string | null) => (s ? new Date(s).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "—");

export default function OmFieldListPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<"today" | "open" | "done">("today");
  const [err, setErr] = useState("");

  const today = ymd(new Date());

  const load = useCallback(() => {
    const from = ymd(new Date(Date.now() - 7 * 864e5));
    const to = ymd(new Date(Date.now() + 30 * 864e5));
    apiFetch(`/api/om/bookings?from=${from}&to=${to}&size=200`)
      .then((d) => setRows(d.rows ?? []))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!rows) return <div className="p-3 md:p-5">{err
    ? <div className="border border-red-200 bg-red-50 p-3 rounded-xl text-sm font-semibold text-red-700">{err}</div>
    : <Loading />}</div>;

  const openJobs = rows.filter((r) => FIELD_STATUS.includes(r.status));
  const list = tab === "today" ? openJobs.filter((r) => (r.scheduled_at ?? "").slice(0, 10) === today)
    : tab === "open" ? openJobs
    : rows.filter((r) => r.status === "closed");

  const TABS: { k: typeof tab; t: string; n: number }[] = [
    { k: "today", t: "วันนี้", n: openJobs.filter((r) => (r.scheduled_at ?? "").slice(0, 10) === today).length },
    { k: "open", t: "ยังไม่ปิดงาน", n: openJobs.length },
    { k: "done", t: "ปิดแล้ว", n: rows.filter((r) => r.status === "closed").length },
  ];

  // จัดกลุ่มตามวันนัด — ช่างอ่านเป็นตารางงานรายวัน
  const byDay = new Map<string, Row[]>();
  for (const r of list) {
    const k = (r.scheduled_at ?? "").slice(0, 10) || "ไม่ระบุวัน";
    byDay.set(k, [...(byDay.get(k) ?? []), r]);
  }

  return (
    <div className="p-3 md:p-5 flex flex-col gap-3">
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center px-4 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.k} type="button" style={{ minHeight: 0 }} onClick={() => setTab(t.k)}
              className={`px-2.5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 -mb-px whitespace-nowrap shrink-0 cursor-pointer ${
                tab === t.k ? "text-active border-active" : "text-gray-500 border-transparent hover:text-gray-700"}`}>
              {t.t}
              <span className={`ml-1 text-xs font-medium normal-case ${tab === t.k ? "text-active" : "text-gray-400"}`}>
                ({t.n.toLocaleString()})
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {[...byDay.entries()].sort().map(([day, items]) => (
          <div key={day}>
            <div className="px-4 py-1.5 bg-gray-50 text-xs font-bold text-gray-600 border-b border-gray-100">
              {day === "ไม่ระบุวัน" ? day : thDate(day)} · {items.length} งาน
            </div>
            {items
              .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "") || (a.queue_index ?? 99) - (b.queue_index ?? 99))
              .map((r) => (
                <a key={r.id} href={`/om/field/${r.id}`}
                  className="flex gap-3 items-center flex-wrap px-4 py-2.5 border-b border-gray-100 last:border-0 no-underline text-inherit hover:bg-gray-50">
                  <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full text-white shrink-0 ${statusTone(r.status)}`}>
                    {statusLabel(r.status)}
                  </span>
                  <span className="text-xs font-bold tabular-nums shrink-0">{thTime(r.scheduled_at)}</span>
                  <span className="min-w-0 flex-1">
                    <b className="text-sm">{r.house_number}</b>
                    <span className="text-xs text-gray-500"> · {r.service_type}</span>
                    <span className="block text-xs text-gray-400 truncate">
                      {r.project_name}{r.customer_name ? ` · ${r.customer_name}` : ""}
                    </span>
                  </span>
                  <span className="text-xxs shrink-0">
                    {r.team_name
                      ? <span className="inline-flex items-center gap-1.5 text-gray-600">
                          <span className="w-2 h-2 rounded-full" style={{ background: r.team_color ?? "#9ca3af" }} />
                          {r.team_name}{r.queue_index ? ` · คิว ${r.queue_index}` : ""}
                        </span>
                      : <span className="font-bold text-amber-700">ยังไม่จ่ายทีม</span>}
                  </span>
                </a>
              ))}
          </div>
        ))}
        {!byDay.size && (
          <div className="px-4 py-10 text-center text-sm text-gray-400">
            {tab === "today" ? "วันนี้ไม่มีงานที่ต้องกรอกใบตรวจ" : tab === "open" ? "ไม่มีงานค้าง" : "ยังไม่มีงานที่ปิดแล้ว"}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 px-1">
        ★ แสดงงานที่ถึงคิวช่างแล้ว (ยืนยันแล้ว · กำลังทำ · รอปิดงาน) ในช่วง 7 วันก่อนถึง 30 วันข้างหน้า ·
        กดที่งานเพื่อเปิดใบตรวจรับงานและกรอกเช็คลิสต์
      </p>
    </div>
  );
}
