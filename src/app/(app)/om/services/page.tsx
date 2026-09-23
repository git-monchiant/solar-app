"use client";

// งานบริการ O&M — ไปป์ไลน์ ติดตาม → ทำนัด → รอ O&M → เข้า O&M → ปิดงาน
// mockup: 20260907_01 (โครงหน้า+ใบงาน) · 20260909_05 (แท็บติดตาม+บันทึกการโทร)
// ★ ผู้ใช้เคาะ 10 ก.ย. 69
//   - การ์ดในแท็บติดตาม "คำนวณสด" ไม่มีแถวงานรอไว้ · แถวงานเกิดตอนโทรแล้วได้ความเท่านั้น
//   - ไม่มีรอบโทร ไม่มีเจ้าของงาน ใครเปิดหน้านี้ก็โทรต่อได้ (ประวัติอยู่ในใบงาน)
//   - การ์ดไม่มีปุ่ม กดทั้งใบเข้าไปทำข้างใน เหมือน LeadCard ของฝั่งขาย
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import { useRouter } from "next/navigation";
import { CALL_OUTCOME } from "@/lib/om/booking";
import {
  BUCKET_LABEL, FLOW, SORTS, TABS, TONE, monthsAgo, thD, thDT,
  type Item,
} from "@/lib/om/service-view";
import ListPageHeader from "@/components/layout/ListPageHeader";
import Dropdown from "@/components/ui/Dropdown";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";

const I = ({ d, c, fill }: { d: string; c: string; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill={fill ? c : "none"} stroke={fill ? "none" : c} strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);
const D = {
  house: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  phone: "M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.2l-2.26 1.13a11.04 11.04 0 005.52 5.52l1.13-2.26a1 1 0 011.2-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z",
  pin: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.14-7.5 11.25-7.5 11.25S4.5 17.64 4.5 10.5a7.5 7.5 0 1115 0z",
  bolt: "M13 10V3L4 14h7v7l9-11h-7z",
};

/** วงกลม 5 ขั้นในการ์ด (โผล่บนจอกว้าง)
 *  ★ แก้ 23 ก.ย. 69: เดิม `if (idx < 0) idx = 0` ทำให้ทุกสถานะที่ไม่อยู่ใน FLOW
 *    (รอลูกค้ายืนยัน · ยกเลิก · ไม่อยู่บ้าน) แสดงจุดกลับไปขั้นแรก "ติดตาม" เหมือนงานยังไม่เริ่ม
 *    - checked (รอลูกค้ายืนยัน) = ทำเสร็จแล้วรอปิด → ให้ยืนที่ "เข้า O&M" เหลือแค่ขั้นปิดงาน
 *      (คงแถบ 5 ขั้นตามที่ผู้ใช้เคาะ 9 ก.ย. mockup 20260909_04 — ไม่เพิ่มขั้นที่ 6)
 *    - cancelled / no_show = ออกนอกเส้นไปแล้ว ไม่มีความคืบหน้าให้แสดง → ซ่อนแถบทั้งอัน
 *      (ป้ายสถานะสีแดงบนการ์ดบอกอยู่แล้วว่าเกิดอะไรขึ้น)
 */
const FLOW_AT: Record<string, number> = { checked: 3 };   // 3 = ตำแหน่ง "เข้า O&M"
const FLOW_HIDDEN = ["cancelled", "no_show"];

function Flow({ status }: { status: string }) {
  if (FLOW_HIDDEN.includes(status)) return null;
  const found = FLOW.findIndex((f) => f.k === status);
  const idx = found >= 0 ? found : (FLOW_AT[status] ?? 0);
  return (
    <div className="hidden xl:flex items-start pt-1 shrink-0">
      {FLOW.map((f, i) => {
        const cur = i === idx, past = i < idx;
        return (
          <div key={f.k} className="flex items-start">
            <div className="flex flex-col items-center w-14">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${past ? "bg-success" : cur ? "bg-primary ring-2 ring-primary/20" : "bg-gray-200"}`}>
                {past ? <svg viewBox="0 0 24 24" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  : cur ? <span className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
              </div>
              <span className={`text-xxs mt-1 leading-tight whitespace-nowrap ${cur ? "font-bold text-primary-dark" : past ? "text-green-700" : "text-gray-400"}`}>{f.t}</span>
            </div>
            {i < FLOW.length - 1 && <div className={`h-0.5 w-1.5 mt-2.5 ${past ? "bg-green-300" : "bg-gray-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function OmServicesPage() {
  const { item: activeItem } = useActiveMenuItem();   // หัวเรื่อง = ชื่อเมนู (กติกา ui-rules)
  const router = useRouter();
  // เปิดรายละเอียดเป็น URL จริง — back/refresh/ส่งลิงก์ใช้ได้ (เฟส 3)
  const open = (houseId: number) => router.push(`/om/services/${houseId}`);
  const [tab, setTab] = useState<string>("follow");
  const [group, setGroup] = useState("");
  const [sort, setSort] = useState("overdue");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"card" | "table">("card");
  const [items, setItems] = useState<Item[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [projects, setProjects] = useState<{ project_id: string; project_name: string; n: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setItems(null);
    const p = new URLSearchParams({ tab, sort, size: "40" });
    if (group) p.set("group", group);
    if (q.trim()) p.set("q", q.trim());
    apiFetch(`/api/om/follow?${p}`)
      .then((d) => {
        setItems(d.items ?? []); setCounts(d.counts ?? {});
        setTotal(d.total ?? 0); setProjects(d.projects ?? []);
      })
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setItems([]); });
  }, [tab, group, sort, q]);
  useEffect(() => { const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t); }, [load, q]);

  const totalAll = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <div>
      {/* หัวจอกลางชุดเดียวกับ Pipeline/Today/Seeker (เฟส 2 ของแผน 20260922-01)
          ★ กติกา ui-rules: หัวเรื่อง = ชื่อเมนูที่ active · ห้ามเขียนหัวจอเอง
          ★ ตัวกรอง/เรียง/มุมมอง ย้ายลงมาในตัวหน้า ไม่ใช้ tabsRight — ยกแนวจาก Pipeline
            (tabsRight ซ่อนบนจอแคบ ของพวกนี้ต้องใช้บนมือถือได้) */}
      <ListPageHeader
        title={activeItem?.label ?? "งานบริการ"}
        subtitle="O&M · ติดตาม → ทำนัด → รอ O&M → เข้า O&M → ปิดงาน"
        search={q}
        onSearchChange={setQ}
        searchPlaceholder="ค้นบ้านเลขที่ · ชื่อลูกค้า · เบอร์โทร"
        tabs={TABS.map((t) => ({ key: t.k, label: t.t, count: counts[t.k] ?? 0 }))}
        activeTab={tab}
        onTabChange={setTab}
        tabsLeft={<span className="whitespace-nowrap">{totalAll.toLocaleString("th-TH")} รายการ</span>}
      />

      <div className="p-3 md:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          <span className="text-sm font-bold text-gray-700 whitespace-nowrap">{total.toLocaleString("th-TH")} หลังในแท็บนี้</span>
          <Dropdown
            className="w-48 font-normal"
            value={group}
            onChange={(v) => setGroup(v)}
            options={[{ value: "", label: `ทุกโครงการ (${projects.length})` },
              ...projects.map((p) => ({ value: p.project_id, label: `${p.project_name} · ${p.n}` }))]}
          />
          <Dropdown
            className="w-44"
            value={sort}
            onChange={(v) => { if (v) setSort(v); }}
            options={SORTS.map((s) => ({ value: s.k, label: `เรียง: ${s.t}` }))}
          />
          <span className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-500">มุมมอง</span>
            <span className="flex rounded-full border border-gray-200 overflow-hidden">
              {(["table", "card"] as const).map((v) => (
                <button key={v} type="button" style={{ minHeight: 0 }} onClick={() => setView(v)}
                  className={`px-3 py-1 text-xs font-bold cursor-pointer ${view === v ? "bg-active-light text-active-dark" : "bg-white text-gray-500"}`}>
                  {v === "table" ? "แบบตาราง" : "แบบการ์ด"}
                </button>
              ))}
            </span>
          </span>
        </div>

        {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>}
        {tab === "follow" && (
          <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-900 leading-relaxed">
            การ์ดในแท็บนี้<b>คำนวณสดจากฐาน</b> ยังไม่มีแถวงาน — เกณฑ์คือมีระบบติดตั้งและเลยรอบล้างแล้ว ·
            แถวงานจะเกิดตอนโทรแล้วลูกค้า<b>ตกลงนัด</b>หรือ<b>ขอเลื่อน</b>เท่านั้น
          </div>
        )}
        {items === null ? <Loading /> : items.length === 0 ? (
          <div className="text-center text-gray-400 py-16 text-sm">ไม่มีรายการในแท็บนี้</div>
        ) : view === "card" ? (
          <div className="space-y-2.5 max-w-[1600px]">
            {items.map((r) => <Card key={r.house_id} r={r} onOpen={() => open(r.house_id)} />)}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-[1600px]">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["บ้าน", "ลูกค้า", "เบอร์", "สิทธิ์", "ล้างล่าสุด", "สถานะ", "โทรล่าสุด"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-xxs font-bold uppercase tracking-wide text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.house_id} onClick={() => open(r.house_id)} className="border-b border-gray-100 last:border-0 hover:bg-teal-50/40 cursor-pointer">
                    <td className="px-4 py-2 text-sm font-bold">{r.house_number}</td>
                    <td className="px-4 py-2 text-sm">{r.customer_name || <span className="text-gray-400">ไม่มีชื่อ</span>}</td>
                    <td className="px-4 py-2 text-sm tabular-nums">{r.phone || <span className="text-amber-600 font-bold">ไม่มีเบอร์</span>}</td>
                    <td className="px-4 py-2 text-sm font-bold text-primary-dark">{Math.max(0, r.balance)}</td>
                    <td className="px-4 py-2 text-sm">{r.last_wash ? `${thD(r.last_wash)} (${monthsAgo(r.last_wash)} ด.)` : <span className="text-amber-600 font-bold">ยังไม่เคยล้าง</span>}</td>
                    <td className="px-4 py-2"><span className={`text-xxs px-2 py-0.5 rounded-full text-white font-semibold ${TONE[r.bucket] ?? "bg-gray-400"}`}>{BUCKET_LABEL[r.bucket] ?? r.bucket}</span></td>
                    <td className="px-4 py-2 text-xs text-gray-500">{r.last_outcome ? `${CALL_OUTCOME[r.last_outcome]?.t ?? r.last_outcome} · ${thD(r.last_call_at)}` : "ยังไม่มีใครโทร"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

function Card({ r, onOpen }: { r: Item; onOpen: () => void }) {
  const m = monthsAgo(r.last_wash);
  // เปลือกการ์ดยกจาก LeadCard ทั้งก้อน (กติกา ui-rules) — เงา/สี hover/การกดด้วยคีย์บอร์ด
  // ต้องเหมือนกันทุกโมดูล · ข้างในเป็นข้อมูล O&M เฉพาะทาง คงไว้ตามเดิม
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="block rounded-2xl bg-white border border-gray-300 shadow-sm hover:border-gray-400 hover:shadow-md transition-all cursor-pointer overflow-hidden">
      <div className="flex gap-4 px-4 pt-3 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
            <I d={D.house} c="#0ea5e9" />
            <span className="text-base font-bold text-gray-900 truncate">{r.house_number} · {r.customer_name || "ไม่มีชื่อในฐาน"}</span>
            <span className={`text-xxs px-2 py-0.5 rounded-full text-white font-semibold shrink-0 ${TONE[r.bucket] ?? "bg-gray-400"}`}>{BUCKET_LABEL[r.bucket] ?? r.bucket}</span>
            {!r.booking_id && r.bucket === "follow" && (
              <span className="text-xxs px-2 py-0.5 rounded-full bg-active-light text-active-dark font-bold shrink-0 max-md:hidden">ยังไม่มีแถวงาน · คำนวณสด</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
            <I d={D.pin} c="#f43f5e" /><span className="truncate">{r.project_name}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <I d={D.phone} c={r.phone ? "#10b981" : "#9ca3af"} />
            {r.phone ? <span className="tabular-nums">{r.phone}</span> : <span className="text-gray-400">ไม่มีเบอร์ในฐาน</span>}
            {r.kwp_list && <span className="text-xs text-gray-400 max-md:hidden">· {r.kwp_list} kW</span>}
          </div>
          <div className="text-sm text-gray-700">
            {r.balance > 0 ? <>สิทธิ์เหลือ <b className="text-primary-dark">{r.balance}</b> ครั้ง</> : <span className="text-amber-600 font-bold">สิทธิ์หมด</span>}
            {" · "}
            {r.last_wash ? <>ล้างล่าสุด <b>{thD(r.last_wash)}</b> <span className="text-xxs text-gray-400">({m} เดือน)</span></>
              : <span className="text-amber-600 font-bold">ยังไม่เคยล้างเลย</span>}
            {r.scheduled_at && <> · นัด <b>{thDT(r.scheduled_at)}</b></>}
          </div>
        </div>
        <Flow status={r.job_status ?? "follow"} />
      </div>
      <div className="border-t border-black/5 px-4 py-1.5 flex items-center gap-2 flex-wrap text-xs text-gray-400 bg-gray-50/60">
        {r.last_outcome ? (
          <span className="text-green-700 font-semibold">
            โทรล่าสุด <b>{r.last_by ?? "—"}</b> · <i className="not-italic text-gray-500 font-normal">
              ครั้งที่ {r.calls} {CALL_OUTCOME[r.last_outcome]?.t ?? r.last_outcome} {thDT(r.last_call_at)}</i>
          </span>
        ) : <span>ยังไม่มีใครโทร</span>}
        {r.team_name && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">ทีม {r.team_name}</span>}
        {r.next_call && <span className="ml-auto font-semibold text-gray-500">นัดโทรใหม่ {thD(r.next_call)}</span>}
        {!r.next_call && r.no_answer > 0 && <span className="ml-auto font-bold text-danger">ไม่รับสายแล้ว {r.no_answer} ครั้ง</span>}
      </div>
    </div>
  );
}

// ── ใบงานเต็มหน้า — โครงเดียวกับใบงานฝั่งขาย (rail ขั้นตอน + แผงงานของขั้นนั้น) ──
