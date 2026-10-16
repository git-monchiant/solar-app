"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import { apiFetch } from "@/lib/api";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatThaiDate } from "@/lib/utils/formatters";
import { B2B_OM_ROLES, CONTRACT_STATUS_LABEL, CONTRACT_STATUS_TONE, addMonthsIso, todayThIso, type B2bOmContract } from "@/lib/b2b/om";

// สัญญา O&M B2B ทุกโครงการ (แผน 20261015-09) — สัญญาสร้างเองตอนปิดโครงการ · ใกล้หมดอายุ (≤ 60 วัน) ขึ้นป้ายเตือน (ต่อสัญญาเฟส 4)
export default function B2bOmContractsPage() {
  const router = useRouter();
  const { activeRoles } = useActiveRoles();
  const canUse = hasRole(activeRoles, ...B2B_OM_ROLES);
  const [rows, setRows] = useState<B2bOmContract[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (canUse) apiFetch("/api/b2b/om/contracts").then(setRows).catch(() => setRows([]));
  }, [canUse]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || [r.project_code, r.project_name, r.customer_name, r.location, r.contact_name].some((x) => (x ?? "").toLowerCase().includes(q)));
  }, [rows, search]);

  if (activeRoles.length > 0 && !canUse) {
    return (
      <div>
        <Header title="สัญญา O&M" subtitle="O&M B2B" />
        <main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">role ที่กำลังใช้งานไม่มีสิทธิ์เปิดหน้านี้</div></main>
      </div>
    );
  }
  if (!rows) return <Loading />;

  const soon = addMonthsIso(todayThIso(), 2);
  const expiring = (r: B2bOmContract) => r.status === "active" && r.end_date <= soon;
  return (
    <div>
      <Header title="สัญญา O&M" subtitle={`O&M B2B · ${shown.length} สัญญา`} />
      <div className="p-3 md:p-6 space-y-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา เลขที่ / โครงการ / ลูกค้า / ที่ตั้ง / ผู้ประสานงาน…"
          className="w-full h-8 px-4 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
        {shown.length === 0 ? (
          <div className="rounded-xl bg-white border border-gray-300 px-5 py-10 text-center text-sm text-gray-400">
            {rows.length === 0 ? "ยังไม่มีสัญญา O&M — สร้างเองตอนปิดโครงการ B2B (หรือกดสร้างที่หน้าโครงการหลังส่งมอบ)" : "ไม่พบตามคำค้น"}
          </div>
        ) : (
          <div className="rounded-xl bg-white border border-gray-300 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-3 py-2 font-semibold">โครงการ</th>
                  <th className="px-3 py-2 font-semibold w-px whitespace-nowrap">อายุสัญญา</th>
                  <th className="px-3 py-2 font-semibold w-px whitespace-nowrap">ใช้ไป</th>
                  <th className="px-3 py-2 font-semibold w-px whitespace-nowrap">ครั้งถัดไป</th>
                  <th className="px-3 py-2 font-semibold">ผู้ประสานงาน</th>
                  <th className="px-3 py-2 font-semibold w-px whitespace-nowrap">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} onClick={() => router.push(`/b2b/om/contracts/${r.id}`)} className="border-t border-gray-100 cursor-pointer hover:bg-gray-50/70 align-top">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-gray-900">{r.project_name}</div>
                      <div className="text-xs text-gray-500">{r.project_code} · {r.customer_name}{r.location ? ` · ${r.location}` : ""}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                      {formatThaiDate(r.start_date)} – {formatThaiDate(r.end_date)}
                      <div className="text-xs text-gray-400">{r.years} ปี · ปีละ {r.visits_per_year} ครั้ง</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums"><b>{r.used}</b> / {r.visits_total}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{r.next_due ? formatThaiDate(r.next_due) : "—"}</td>
                    <td className="px-3 py-2 text-gray-700">{r.contact_name ?? "—"}{r.contact_phone ? <div className="text-xs text-gray-400">{r.contact_phone}</div> : null}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${CONTRACT_STATUS_TONE[r.status]}`}>{CONTRACT_STATUS_LABEL[r.status]}</span>
                      {expiring(r) && <div className="mt-0.5 text-xs font-semibold text-amber-700">ใกล้หมดสัญญา</div>}
                    </td>
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
