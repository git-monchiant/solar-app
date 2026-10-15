"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import { apiFetch } from "@/lib/api";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatThaiDate, formatTHB } from "@/lib/utils/formatters";
import { B2B_FLOW, B2B_MAX_MOVABLE_STAGE, B2B_PROJECT_ROLES, B2B_PROJECT_VIEW_ROLES, B2B_STAGE, stageGroupOf, stageLabel, type B2bProjectRow } from "@/lib/b2b/project";
import StageBadge from "@/components/b2b/project/StageBadge";
import ProjectFormModal from "@/components/b2b/project/ProjectFormModal";

// รายการโครงการ B2B — แผน docs/plan/20261015-07-b2b-project-flow.md เฟส 1
// ?stage= ตามเมนู (ไม่มี = ทุกโครงการที่ยังเปิด · sales/site = "ทั้งหมด" ของการ์ดขาย / สำรวจ & ติดตั้ง) · สลับ รายการ / กระดานตามขั้น (คำถามข้อ 6 · เคาะ "ตามเสนอ")
// มูลค่า = ราคาขายของ BOQ ที่บันทึกล่าสุด (ก่อน VAT) — ใบเสนอราคา/สัญญามาในเฟส 2–3

// มุมมองที่เลือกจำไว้ในเครื่อง (ของแต่ละคน) — localStorage ใช้ไม่ได้ (โหมดส่วนตัว) ยังสลับได้ด้วยค่าในหน่วยความจำ
// อ่านผ่าน useSyncExternalStore: server/ครั้งแรกได้ "list" เสมอ ไม่ hydration mismatch
type View = "list" | "board";
const VIEW_KEY = "b2b-projects-view";
const VIEW_EVENT = "b2b-projects-view-change";
let memView: View = "list";
const readView = (): View => {
  try { const v = localStorage.getItem(VIEW_KEY); if (v === "board" || v === "list") return v; } catch {}
  return memView;
};
const subscribeView = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(VIEW_EVENT, cb);
  return () => { window.removeEventListener("storage", cb); window.removeEventListener(VIEW_EVENT, cb); };
};
const pickView = (v: View) => {
  memView = v;
  try { localStorage.setItem(VIEW_KEY, v); } catch {}
  window.dispatchEvent(new Event(VIEW_EVENT));
};

export default function B2bProjectListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stage = searchParams.get("stage") ?? "open";
  const { item } = useActiveMenuItem();
  const { activeRoles } = useActiveRoles();
  const canUse = hasRole(activeRoles, ...B2B_PROJECT_VIEW_ROLES);
  const canEdit = hasRole(activeRoles, ...B2B_PROJECT_ROLES);
  // ผลที่โหลดผูกกับขั้นที่ขอ — เปลี่ยนเมนูแล้วยังไม่ได้ผลใหม่ = กำลังโหลด (ไม่โชว์รายการของเมนูเก่าค้าง)
  const [data, setData] = useState<{ stage: string; rows: B2bProjectRow[] } | null>(null);
  const rows = data?.stage === stage ? data.rows : null;
  const [search, setSearch] = useState("");
  const view = useSyncExternalStore(subscribeView, readView, () => "list" as View);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!canUse) return;
    apiFetch(`/api/b2b/projects?stage=${encodeURIComponent(stage)}`)
      .then((r: B2bProjectRow[]) => setData({ stage, rows: r }))
      .catch(() => setData({ stage, rows: [] }));
  }, [canUse, stage]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || [r.code, r.name, r.customer_name, r.location, r.owner_name].some((x) => (x ?? "").toLowerCase().includes(q)));
  }, [rows, search]);

  // คอลัมน์กระดาน: กลุ่มของการ์ด (sales/site/closed/lost) = ทุกขั้นในกลุ่ม · ทั้งหมด = ขั้นขายเสมอ + ขั้นอื่นที่มีโครงการอยู่จริง
  const columns = useMemo(() => {
    const g = stage !== "open" ? stageGroupOf(stage) : null;
    if (g) return [...g];
    if (/^\d{4}$/.test(stage)) return [Number(stage)];
    const present = new Set(shown.map((r) => r.stage));
    return B2B_FLOW.map((s) => s.step as number).filter((s) => s <= B2B_MAX_MOVABLE_STAGE || present.has(s));
  }, [stage, shown]);

  const title = item?.label ?? "โครงการ B2B";
  if (activeRoles.length > 0 && !canUse) {
    return (
      <div>
        <Header title={title} subtitle="COMMERCIAL (B2B)" />
        <main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">role ที่กำลังใช้งานไม่มีสิทธิ์เปิดหน้านี้</div></main>
      </div>
    );
  }
  if (!rows) return <Loading />;

  const open = (r: B2bProjectRow) => router.push(`/b2b/projects/${r.id}`);
  // สร้างโครงการ = ขั้นโอกาสขาย → ปุ่มอยู่เฉพาะรายการฝั่งขาย (การ์ดโครงการ/ปิด/แพ้ ไม่มี)
  const canCreateHere = stage === "open" || stage === "sales" || stage === "3100";
  const num = "px-3 py-2 text-right tabular-nums whitespace-nowrap";
  const toggleBtn = (v: View, text: string) => (
    <button type="button" onClick={() => pickView(v)} style={{ minHeight: 0 }} aria-pressed={view === v}
      className={`h-8 px-3 text-sm font-semibold transition-colors ${view === v ? "bg-primary text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>{text}</button>
  );

  return (
    <div>
      <Header title={title} subtitle={`COMMERCIAL (B2B) · ${shown.length} โครงการ`} />
      <div className="p-3 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา เลขที่ / โครงการ / ลูกค้า / ที่ตั้ง / ผู้ดูแล…"
            className="h-8 px-4 rounded-lg border border-gray-200 text-sm flex-1 min-w-[200px] focus:outline-none focus:border-primary" />
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden divide-x divide-gray-200">
            {toggleBtn("list", "รายการ")}{toggleBtn("board", "กระดาน")}
          </div>
          {canEdit && canCreateHere && (
            <button type="button" onClick={() => setCreating(true)}
              className="h-8 px-5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors">+ สร้างโครงการ</button>
          )}
        </div>

        {shown.length === 0 ? (
          <div className="rounded-xl bg-white border border-gray-300 px-5 py-10 text-center text-sm text-gray-400">
            {rows.length === 0 ? (canEdit && canCreateHere ? "ยังไม่มีโครงการ — กด \"+ สร้างโครงการ\" เพื่อเริ่ม" : "ไม่มีโครงการในขั้นนี้") : "ไม่พบโครงการตามคำค้น"}
          </div>
        ) : view === "list" ? (
          <div className="rounded-xl bg-white border border-gray-300 overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-3 py-2 font-semibold w-px whitespace-nowrap">เลขที่</th>
                  <th className="px-3 py-2 font-semibold">โครงการ</th>
                  <th className="px-3 py-2 font-semibold w-[20%]">ลูกค้า</th>
                  <th className="px-3 py-2 font-semibold w-px whitespace-nowrap">ขั้น</th>
                  <th className={`${num} font-semibold w-px`}>BOQ</th>
                  <th className={`${num} font-semibold w-px`}>ราคา BOQ ล่าสุด</th>
                  <th className="px-3 py-2 font-semibold w-px whitespace-nowrap">ผู้ดูแล</th>
                  <th className="px-3 py-2 font-semibold w-px whitespace-nowrap">อัปเดตล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} onClick={() => open(r)} className="cursor-pointer border-t border-gray-100 hover:bg-primary/5">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.code}</td>
                    <td className="px-3 py-2 font-semibold text-gray-900">
                      {r.name}
                      {r.location && <div className="text-xs font-normal text-gray-400">{r.location}</div>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.customer_name}</td>
                    <td className="px-3 py-2">
                      <StageBadge stage={r.stage} sub={r.sub} surveyDate={r.survey_date} />
                      {r.survey_date && r.stage === B2B_STAGE.survey && <div className="text-xs text-gray-400 mt-0.5">นัด {formatThaiDate(r.survey_date)}</div>}
                      {r.close_reason && <div className="text-xs text-gray-400 mt-0.5 max-w-[16rem] truncate">{r.close_reason}</div>}
                    </td>
                    <td className={num}>
                      {r.boq_count > 0 ? <>{r.boq_capacity_wp ? `${formatTHB(r.boq_capacity_wp / 1000, { decimals: 2 })} kWp` : "—"}{r.boq_count > 1 && <div className="text-xs text-gray-400">{r.boq_count} ตัวเลือก</div>}</> : "—"}
                    </td>
                    <td className={`${num} font-medium`}>{r.boq_total_sale ? formatTHB(r.boq_total_sale, { decimals: 0 }) : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.owner_name ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">{formatThaiDate(r.updated_at, { time: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // กระดาน: คอลัมน์ละขั้น · เลื่อนแนวนอนบนจอแคบ (ตัวกระดานเลื่อน ไม่ใช่ทั้งหน้า)
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-3">
              {columns.map((s) => {
                const items = shown.filter((r) => r.stage === s);
                const sum = items.reduce((t, r) => t + (r.boq_total_sale ?? 0), 0);
                return (
                  <section key={s} className="flex-1 min-w-64 max-w-sm rounded-xl bg-gray-100/70 border border-gray-200 flex flex-col">
                    <div className="px-3 py-2 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-gray-800">{stageLabel(s)}</h2>
                        <span className="min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-white text-xs font-bold text-gray-600">{items.length}</span>
                      </div>
                      {sum > 0 && <div className="text-xs text-gray-500 tabular-nums">ราคา BOQ รวม {formatTHB(sum, { decimals: 0 })}</div>}
                    </div>
                    <div className="p-2 space-y-2">
                      {items.map((r) => (
                        <button key={r.id} type="button" onClick={() => open(r)}
                          className="w-full text-left rounded-lg bg-white border border-gray-200 px-3 py-2 hover:border-primary transition-colors">
                          <div className="text-xs text-gray-400">{r.code}</div>
                          <div className="text-sm font-semibold text-gray-900 leading-snug">{r.name}</div>
                          <div className="text-xs text-gray-500 truncate">{r.customer_name}</div>
                          <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                            <span className="text-gray-500 tabular-nums">{r.boq_capacity_wp ? `${formatTHB(r.boq_capacity_wp / 1000, { decimals: 2 })} kWp` : "ยังไม่มี BOQ"}</span>
                            <span className="font-medium text-gray-800 tabular-nums">{r.boq_total_sale ? formatTHB(r.boq_total_sale, { decimals: 0 }) : ""}</span>
                          </div>
                          {r.stage === B2B_STAGE.survey && r.survey_date && <div className="mt-1 text-xs text-active-dark">นัดสำรวจ {formatThaiDate(r.survey_date)}</div>}
                        </button>
                      ))}
                      {items.length === 0 && <div className="px-2 py-4 text-center text-xs text-gray-400">—</div>}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {creating && (
        <ProjectFormModal initial={null} onClose={() => setCreating(false)} onSaved={(r) => router.push(`/b2b/projects/${r.id}`)} />
      )}
    </div>
  );
}
