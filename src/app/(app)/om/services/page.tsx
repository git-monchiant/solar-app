"use client";

// งานบริการ O&M — ไปป์ไลน์ 7 ขั้น (แผน 20260924-02) ติดตาม → [เสนอราคา → ชำระเงิน เฉพาะงานเสียเงิน] → นัดหมาย → เข้างาน → รอปิด → ปิดงาน
// mockup: 20260907_01 (โครงหน้า+ใบงาน) · 20260909_05 (แท็บติดตาม+บันทึกการโทร)
// ★ ผู้ใช้เคาะ 10 ก.ย. 69
//   - การ์ดในแท็บติดตาม "คำนวณสด" ไม่มีแถวงานรอไว้ · แถวงานเกิดตอนโทรแล้วได้ความเท่านั้น
//   - ไม่มีรอบโทร ไม่มีเจ้าของงาน ใครเปิดหน้านี้ก็โทรต่อได้ (ประวัติอยู่ในใบงาน)
//   - การ์ดไม่มีปุ่ม กดทั้งใบเข้าไปทำข้างใน เหมือน LeadCard ของฝั่งขาย
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import { useRouter, useSearchParams } from "next/navigation";
import { CALL_OUTCOME } from "@/lib/om/booking";
import {
  BUCKET_LABEL, SORTS, TABS, TONE, monthsAgo, thD,
  type Item,
} from "@/lib/om/service-view";
import ListPageHeader from "@/components/layout/ListPageHeader";
import Dropdown from "@/components/ui/Dropdown";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import JobCard from "@/components/om/JobCard";
import { CheckIcon } from "@/components/ui/icons";

export default function OmServicesPage() {
  const { item: activeItem } = useActiveMenuItem();   // หัวเรื่อง = ชื่อเมนู (กติกา ui-rules)
  const router = useRouter();
  // เปิดรายละเอียดเป็น URL จริง — back/refresh/ส่งลิงก์ใช้ได้ (เฟส 3)
  const open = (houseId: number) => router.push(`/om/services/${houseId}`);
  // ★ เฟส 6: รับ ?tab= / ?group= จาก URL — หน้าภาพรวมลิงก์เข้ามาที่แท็บ/โครงการที่กดบนตัวเลข
  //   อ่านเป็นค่าตั้งต้นเท่านั้น กดแท็บต่อในหน้านี้ไม่ต้องเขียน URL กลับ
  //   (ถ้าเขียนกลับ ปุ่ม back จะกลายเป็นย้อนแท็บทีละอัน แทนที่จะกลับหน้าเดิม)
  const sp = useSearchParams();
  const [tab, setTab] = useState<string>(() => sp.get("tab") || "follow");
  const [group, setGroup] = useState(() => sp.get("group") || "");
  const [sort, setSort] = useState("overdue");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"card" | "table">("card");
  // ★ ติ๊ก "งานของฉัน" — ยกบล็อกจาก Pipeline ทั้งก้อน (กติกา ui-rules) รวมถึงการจำค่าไว้
  //   ผู้ใช้เคาะ 24 ก.ย. 69: งาน O&M ให้อยู่ในโมดูล O&M ก่อน ยังไม่ขึ้นหน้า Today
  //   ⇒ ตอบ "งานของฉัน" ได้โดยไม่ต้องออกจากโมดูล
  //   กรองที่ฝั่ง server (mine=1) ไม่ใช่ฝั่ง client เพราะลิสต์แบ่งหน้าอยู่
  const [mineOnly, setMineOnly] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("om.services.mineOnly") === "1";
  });
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
    if (mineOnly) p.set("mine", "1");
    apiFetch(`/api/om/follow?${p}`)
      .then((d) => {
        setItems(d.items ?? []); setCounts(d.counts ?? {});
        setTotal(d.total ?? 0); setProjects(d.projects ?? []);
      })
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setItems([]); });
  }, [tab, group, sort, q, mineOnly]);
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
        subtitle="O&M · ติดตาม → (เสนอราคา → ชำระเงิน) → นัดหมาย → เข้างาน → รอปิด → ปิดงาน"
        search={q}
        onSearchChange={setQ}
        searchPlaceholder="ค้นบ้านเลขที่ · ชื่อลูกค้า · เบอร์โทร"
        tabs={TABS.map((t) => ({ key: t.k, label: t.t, count: counts[t.k] ?? 0 }))}
        activeTab={tab}
        onTabChange={setTab}
        tabsLeft={<span className="whitespace-nowrap">{totalAll.toLocaleString("th-TH")} รายการ</span>}
      />

      <div className="p-3 md:p-4">
        {/* ★ 24 ก.ย. 69 จัดแถวเครื่องมือตามแนว Pipeline: ซ้าย = จำนวน+กรอง · ขวา = งานของฉัน/เรียง/มุมมอง */}
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          <span className="text-sm font-bold text-gray-700 whitespace-nowrap">{total.toLocaleString("th-TH")} หลังในแท็บนี้</span>
          <Dropdown
            className="w-48 font-normal"
            value={group}
            onChange={(v) => setGroup(v)}
            options={[{ value: "", label: `ทุกโครงการ (${projects.length})` },
              ...projects.map((p) => ({ value: p.project_id, label: `${p.project_name} · ${p.n}` }))]}
          />
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              style={{ minHeight: 0 }}
              onClick={() => {
                const next = !mineOnly;
                setMineOnly(next);
                localStorage.setItem("om.services.mineOnly", next ? "1" : "0");
              }}
              className="h-7 inline-flex items-center gap-1.5 px-1 text-xxs font-medium text-gray-700 cursor-pointer whitespace-nowrap"
            >
              <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${mineOnly ? "border-gray-800 bg-gray-800" : "border-gray-300"}`}>
                {mineOnly && <CheckIcon className="w-2 h-2 text-white" strokeWidth={4} />}
              </span>
              งานของฉัน
            </button>
            <Dropdown
              className="w-44"
              value={sort}
              onChange={(v) => { if (v) setSort(v); }}
              options={SORTS.map((s) => ({ value: s.k, label: `เรียง: ${s.t}` }))}
            />
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
          // เดิมเป็นกล่องเหลืองเต็มแถว แย่งสายตาจากการ์ด — ย่อเป็นบรรทัดหมายเหตุ
          <p className="mb-2.5 px-1 flex items-start gap-1.5 text-xxs text-gray-500 leading-relaxed">
            <span className="shrink-0 w-3.5 h-3.5 mt-px rounded-full border border-gray-400 text-[9px] font-bold flex items-center justify-center">i</span>
            <span>แท็บนี้<b className="text-gray-700">คำนวณสดจากฐาน</b> (มีระบบติดตั้งและเลยรอบล้างแล้ว) ·
              แถวงานจะเกิดเมื่อโทรแล้วลูกค้า<b className="text-gray-700">ตกลงนัด</b>หรือ<b className="text-gray-700">ขอเลื่อน</b>เท่านั้น</span>
          </p>
        )}
        {items === null ? <Loading /> : items.length === 0 ? (
          <div className="text-center text-gray-400 py-16 text-sm">ไม่มีรายการในแท็บนี้</div>
        ) : view === "card" ? (
          <div className="space-y-2">
            {items.map((r) => <JobCard key={r.house_id} r={r} onOpen={() => open(r.house_id)} />)}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
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
