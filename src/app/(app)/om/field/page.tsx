"use client";

// เช็คลิสต์ — รายการงานที่ช่างต้องกรอกใบตรวจรับงาน (มุมมองช่าง: เรียงตามวัน · ทีม · คิว)
// ★ ผู้ใช้สั่ง 16 ก.ย. 69 ให้เป็นเมนูซ้าย → ตัดออก 28 ก.ย. 69 เพราะใบตรวจฝังในหน้ารายละเอียดแล้ว
//   หน้านี้ยังอยู่ให้ปุ่ม "เช็คลิสต์" ของแถบล่าง OM_BAR (modules.tsx) · /om/field/[id] ต้องมีเลขใบงานเสมอ
// ★ สถานะที่ต้องกรอกใบ = นัดแล้ว · เข้างาน (ก่อนหน้านั้นยังไม่ถึงคิวช่าง)
//   checked ยังอยู่ใน FIELD_STATUS ให้ใบเก่าที่ค้างรอปิด (ตัดขั้นนี้ 28 ก.ย. 69) ไม่หายจากรายการ
// ★ 28 ก.ย. 69 (แผน 20260928-04 ข้อ 3): โครงหน้าแบบลิสต์ฝั่งขาย — ListPageHeader (ค้นหา + แท็บ + จำนวน)
//   ตัวเดียวกับ Today/งานบริการ · แต่ละงานเป็นการ์ดเปลือก LeadCard (แบบ JobCard) แทนแถวในตาราง
//   ไม่ใช้ JobCard ตรง ๆ เพราะเนื้อในเป็นของคนโทร (สิทธิ์/ผลโทร) และกินข้อมูลรายบ้าน ส่วนหน้านี้เป็นรายใบงานของช่าง
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import ListPageHeader from "@/components/layout/ListPageHeader";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import { statusLabel, statusTone } from "@/lib/om/booking";
import { formatSlotsRange } from "@/lib/time-slots";

type Row = {
  id: number; house_number: string | null; project_name: string | null;
  service_type: string | null; status: string; scheduled_at: string | null; time_slot?: string | null;
  team_id: number | null; team_name: string | null; team_color: string | null;
  queue_index: number | null; customer_name: string | null; customer_phone: string | null;
};
type TabKey = "today" | "open" | "done";

const FIELD_STATUS = ["confirmed", "progress", "checked"];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const thDate = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
const thTime = (s: string | null) => (s ? new Date(s).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "—");

// ไอคอนหน้าบรรทัด — ชุดเดียวกับ JobCard (บ้าน ฟ้า · โทรศัพท์ เขียว · หมุด ชมพู)
const I = ({ d, c }: { d: string; c: string }) => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke={c} strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);
const D = {
  house: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  phone: "M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.2l-2.26 1.13a11.04 11.04 0 005.52 5.52l1.13-2.26a1 1 0 011.2-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z",
  pin: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.14-7.5 11.25-7.5 11.25S4.5 17.64 4.5 10.5a7.5 7.5 0 1115 0z",
};

export default function OmFieldListPage() {
  const { item: activeItem } = useActiveMenuItem();   // หน้านี้ไม่อยู่ในเมนูซ้ายแล้ว → ใช้ชื่อปุ่มแถบล่างเป็นค่าสำรอง
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<TabKey>("today");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  const today = ymd(new Date());

  // ★ เฟส 6 (เทียบตัวเลข): งานค้างดึงทั้งหมดไม่ผูกช่วงวัน — badge เมนูนับงานค้างทุกใบ
  //   เดิมดึงแค่นัด 7 วันก่อนถึง 30 วันหน้า งานที่เลยนัดเกิน 7 วันแต่ยังไม่ปิด (งานที่ควรตามที่สุด)
  //   นับใน badge แต่หายจากแท็บ "ยังไม่ปิดงาน" · แท็บ "ปิดแล้ว" ยังเป็นประวัติช่วงเดิม
  const load = useCallback(() => {
    const from = ymd(new Date(Date.now() - 7 * 864e5));
    const to = ymd(new Date(Date.now() + 30 * 864e5));
    Promise.all([
      apiFetch(`/api/om/bookings?statuses=${FIELD_STATUS.join(",")}&size=200`),
      apiFetch(`/api/om/bookings?status=closed&from=${from}&to=${to}&size=200`),
    ])
      .then(([open, done]) => setRows([...(open.rows ?? []), ...(done.rows ?? [])]))
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setRows([]); });
  }, []);
  useEffect(() => { load(); }, [load]);

  // ค้นหาในเครื่อง — ทั้งหน้ามีไม่เกิน 400 ใบ ไม่ต้องยิง server ใหม่ทุกตัวอักษร
  // ★ ตัวเลขบนแท็บนับหลังค้นหา = จำนวนที่จะเห็นจริงเมื่อกด (กติกา ui-rules)
  const needle = q.trim().toLowerCase();
  const found = (rows ?? []).filter((r) => !needle ||
    [r.house_number, r.customer_name, r.customer_phone, r.project_name, r.service_type]
      .some((v) => (v ?? "").toLowerCase().includes(needle)));
  const openJobs = found.filter((r) => FIELD_STATUS.includes(r.status));
  const todayJobs = openJobs.filter((r) => (r.scheduled_at ?? "").slice(0, 10) === today);
  const doneJobs = found.filter((r) => r.status === "closed");
  const list = tab === "today" ? todayJobs : tab === "open" ? openJobs : doneJobs;

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: "today", label: "วันนี้", count: todayJobs.length },
    { key: "open", label: "ยังไม่ปิดงาน", count: openJobs.length },
    { key: "done", label: "ปิดแล้ว", count: doneJobs.length },
  ];

  // จัดกลุ่มตามวันนัด — ช่างอ่านเป็นตารางงานรายวัน
  const byDay = new Map<string, Row[]>();
  for (const r of list) {
    const k = (r.scheduled_at ?? "").slice(0, 10) || "ไม่ระบุวัน";
    byDay.set(k, [...(byDay.get(k) ?? []), r]);
  }

  return (
    <div>
      <ListPageHeader
        title={activeItem?.label ?? "เช็คลิสต์"}
        subtitle={`${new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} · O&M`}
        search={q}
        onSearchChange={setQ}
        searchPlaceholder="ค้นบ้านเลขที่ · ชื่อลูกค้า · โครงการ · ทีม"
        tabs={TABS}
        activeTab={tab}
        onTabChange={(k) => setTab(k as TabKey)}
        tabsLeft={<span className="whitespace-nowrap">{list.length.toLocaleString("th-TH")} รายการ</span>}
      />

      <div className="p-3 md:p-4">
        {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>}
        {rows === null ? <Loading /> : !byDay.size ? (
          <div className="text-center text-gray-400 py-16 text-sm">
            {needle ? "ไม่พบงานที่ค้นหา"
              : tab === "today" ? "วันนี้ไม่มีงานที่ต้องกรอกใบตรวจ" : tab === "open" ? "ไม่มีงานค้าง" : "ยังไม่มีงานที่ปิดแล้ว"}
          </div>
        ) : (
          <div className="space-y-4">
            {[...byDay.entries()].sort().map(([day, items]) => (
              <section key={day}>
                <div className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {day === "ไม่ระบุวัน" ? day : thDate(day)} · {items.length} งาน
                </div>
                <div className="space-y-2">
                  {items
                    .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "") || (a.queue_index ?? 99) - (b.queue_index ?? 99))
                    .map((r) => (
                      // เปลือกการ์ด = LeadCard/JobCard (เงา · ขอบ · สี hover) · กดทั้งใบเปิดใบตรวจรับงาน
                      <Link key={r.id} href={`/om/field/${r.id}`}
                        className="block rounded-2xl bg-white border border-gray-300 shadow-sm hover:border-gray-400 hover:shadow-md transition-all no-underline text-inherit overflow-hidden">
                        <div className="px-4 pt-3 pb-2.5">
                          <div className="flex items-start gap-3 mb-1.5">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0 leading-tight">
                                <I d={D.house} c="#0ea5e9" />
                                <span className="text-base font-bold text-gray-900 truncate">
                                  {r.house_number ?? "—"} · {r.customer_name || "ไม่มีชื่อในฐาน"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5 min-w-0">
                                <I d={D.phone} c={r.customer_phone ? "#10b981" : "#9ca3af"} />
                                {r.customer_phone ? <span className="tabular-nums">{r.customer_phone}</span> : <span className="text-gray-400">ไม่มีเบอร์ในฐาน</span>}
                              </div>
                            </div>
                            <span className={`ml-auto shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full text-white ${statusTone(r.status)}`}>
                              {statusLabel(r.status)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0 mb-1.5">
                            <I d={D.pin} c="#f43f5e" /><span className="truncate">{r.project_name ?? "—"}</span>
                          </div>
                          {/* ชิปเรียงแถวเดียวแบบ JobCard — เวลา · ชนิดงาน (ทีม/คิวเลิกแล้ว 1 ต.ค. 69 · แผน 20261001-01 เฟส 4) */}
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800">นัด <b className="tabular-nums">{formatSlotsRange(r.time_slot) || thTime(r.scheduled_at)}</b></span>
                            {r.service_type && <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">{r.service_type}</span>}
                          </div>
                        </div>
                      </Link>
                    ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-gray-400 px-1">
          ★ แสดงงานที่ถึงคิวช่างแล้ว (นัดแล้ว · เข้างาน) ครบทุกใบ รวมที่เลยวันนัดแล้ว ·
          แท็บปิดแล้วแสดงช่วง 7 วันก่อนถึง 30 วันข้างหน้า ·
          กดที่งานเพื่อเปิดใบตรวจรับงานและกรอกเช็คลิสต์
        </p>
      </div>
    </div>
  );
}
