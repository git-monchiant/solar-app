"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import { apiFetch } from "@/lib/api";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatThaiDate } from "@/lib/utils/formatters";
import { B2B_OM_ROLES, isOmTab, thaiMonth, visitStepLabel, visitStepTone, type B2bOmVisitRow } from "@/lib/b2b/om";

// ครั้งเข้างาน O&M B2B ตามแท็บเมนู (แผน 20261015-09) — กดแถวไปหน้าสัญญา (นัด/ปิดงานทำที่นั่น)
//   ถึงรอบ = กำหนดเดือนนี้/เดือนหน้า ยังไม่นัด · นัดแล้ว · เข้างาน/รอปิด = ถึงวันนัดแล้ว · ยังไม่ถึงรอบ · ปิดงานแล้ว (รวมข้าม)
const EMPTY: Record<string, string> = {
  due: "ไม่มีครั้งที่ถึงรอบ — ครั้งที่กำหนดเดือนนี้/เดือนหน้าขึ้นที่นี่", scheduled: "ยังไม่มีนัด", onsite: "ไม่มีงานที่ถึงวันเข้างาน",
  upcoming: "ไม่มีครั้งที่รอถึงรอบ", done: "ยังไม่มีครั้งที่ปิดงาน", all: "ยังไม่มีสัญญา O&M — สร้างเองตอนปิดโครงการ B2B",
};

export default function B2bOmVisitsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab") ?? "due";
  const tab = isOmTab(raw) ? raw : "due";
  const { item } = useActiveMenuItem();
  const { activeRoles } = useActiveRoles();
  const canUse = hasRole(activeRoles, ...B2B_OM_ROLES);
  const [data, setData] = useState<{ tab: string; rows: B2bOmVisitRow[] } | null>(null);
  const rows = data?.tab === tab ? data.rows : null;
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!canUse) return;
    apiFetch(`/api/b2b/om/visits?tab=${tab}`).then((r: B2bOmVisitRow[]) => setData({ tab, rows: r })).catch(() => setData({ tab, rows: [] }));
  }, [canUse, tab]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || [r.project_code, r.project_name, r.customer_name, r.location, r.lead_name].some((x) => (x ?? "").toLowerCase().includes(q)));
  }, [rows, search]);

  const title = item?.label ?? "O&M B2B";
  if (activeRoles.length > 0 && !canUse) {
    return (
      <div>
        <Header title={title} subtitle="O&M B2B" />
        <main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">role ที่กำลังใช้งานไม่มีสิทธิ์เปิดหน้านี้</div></main>
      </div>
    );
  }
  if (!rows) return <Loading />;

  const open = (r: B2bOmVisitRow) => router.push(`/b2b/om/contracts/${r.contract_id}?visit=${r.id}`);
  const badge = (r: B2bOmVisitRow) => (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${visitStepTone(r.step)}`}>{visitStepLabel(r.step)}</span>
  );
  const when = (r: B2bOmVisitRow) => r.status === "done" ? `เข้างาน ${formatThaiDate(r.done_date)}`
    : r.status === "skipped" ? "ข้าม (ใช้สิทธิ์แล้ว)"
    : r.scheduled_date ? `${formatThaiDate(r.scheduled_date, { weekday: true })}${r.days && r.days > 1 ? ` · ${r.days} วัน` : ""}` : "ยังไม่นัด";

  return (
    <div>
      <Header title={title} subtitle={`O&M B2B · ${shown.length} ครั้ง`} />
      <div className="p-3 md:p-6 space-y-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา เลขที่ / โครงการ / ลูกค้า / ที่ตั้ง / ผู้รับผิดชอบ…"
          className="w-full h-8 px-4 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
        {shown.length === 0 ? (
          <div className="rounded-xl bg-white border border-gray-300 px-5 py-10 text-center text-sm text-gray-400">{rows.length === 0 ? EMPTY[tab] : "ไม่พบตามคำค้น"}</div>
        ) : (
          <>
            <div className="hidden md:block rounded-xl bg-white border border-gray-300 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500">
                    <th className="px-3 py-2 font-semibold w-px whitespace-nowrap">ครั้งที่</th>
                    <th className="px-3 py-2 font-semibold">โครงการ</th>
                    <th className="px-3 py-2 font-semibold w-px whitespace-nowrap">กำหนด</th>
                    <th className="px-3 py-2 font-semibold">นัด / ผล</th>
                    <th className="px-3 py-2 font-semibold w-px whitespace-nowrap">ผู้รับผิดชอบ</th>
                    <th className="px-3 py-2 font-semibold w-px whitespace-nowrap">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} onClick={() => open(r)} className="border-t border-gray-100 cursor-pointer hover:bg-gray-50/70 align-top">
                      <td className="px-3 py-2 font-semibold tabular-nums whitespace-nowrap">{r.seq_no}<span className="text-gray-400 font-normal"> / {r.visits_total}</span></td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-gray-900">{r.project_name}</div>
                        <div className="text-xs text-gray-500">{r.project_code} · {r.customer_name}{r.location ? ` · ${r.location}` : ""}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">{thaiMonth(r.due_date)}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {when(r)}
                        {(r.schedule_note || r.result_note || r.skip_reason) && <div className="text-xs text-gray-400 line-clamp-1">{r.result_note ?? r.skip_reason ?? r.schedule_note}</div>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">{r.lead_name ?? "—"}</td>
                      <td className="px-3 py-2">{badge(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-2">
              {shown.map((r) => (
                <button key={r.id} type="button" onClick={() => open(r)} className="w-full text-left rounded-xl bg-white border border-gray-300 p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{r.project_name}</div>
                      <div className="text-xs text-gray-500 truncate">{r.project_code} · {r.customer_name}</div>
                    </div>
                    {badge(r)}
                  </div>
                  <div className="text-sm text-gray-700">ครั้งที่ {r.seq_no}/{r.visits_total} · กำหนด {thaiMonth(r.due_date)}</div>
                  <div className="text-sm text-gray-700">{when(r)}{r.lead_name ? ` · ${r.lead_name}` : ""}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
