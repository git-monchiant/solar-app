"use client";

// รายรับ O&M — รายงานรับเงินค่าบริการงาน O&M แยกจากรายรับของฝั่งขาย
// (แผน docs/plan/20260924-02 เฟส 4 · ผู้ใช้เคาะ 24 ก.ย. "แยกรายงาน" + วางในโมดูลบัญชีต่อจากรายรับ/ใบแจ้งหนี้)
// ★ ผังยกจากหน้า /report ของฝั่งขายทั้งก้อน (การ์ดสรุป 4 ช่อง · แถบกรอง · ตาราง desktop / การ์ด mobile · CSV)
//   ต่างที่ 1 แถว = ใบเสนอราคา O&M 1 ใบ (เก็บเงินก้อนเดียวเต็มจำนวน ไม่มีงวด) และตัวกรองแบบงาน O&M
import { apiFetch } from "@/lib/api";
import Dropdown from "@/components/ui/Dropdown";
import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import FallbackImage from "@/components/ui/FallbackImage";
import { formatTHB, formatThaiDate as fmtDate } from "@/lib/utils/formatters";
import Loading from "@/components/ui/Loading";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { OmServiceLink } from "@/components/om/OmServiceLink";

interface OmPay {
  id: number; amount: number; payment_method: string | null; submitted_at: string | null;
  confirmed_at: string | null; confirmed_by: string | null; slip_urls: string[];
}
interface OmRow {
  quotation_id: number; doc_no: string; package_name_snapshot: string | null; plan_type: string | null;
  total: number; received: number; pending: number; outstanding: number;
  sent_to_customer_at: string | null; paid_at: string | null;
  job_status: string; house_id: number; house_number: string | null; project_name: string | null;
  customer_name: string; phone: string | null; created_by_name: string | null; payments: OmPay[];
}
interface OmData { rows: OmRow[] }

const fmt = (n: number) => formatTHB(Math.round(n));
const d10 = (v: string | null) => (v ? String(v).slice(0, 10) : "");
const PLAN: Record<string, string> = { per_visit: "รายครั้ง", contract: "สัญญา" };

function toCsv(rows: OmRow[]): string {
  const header = ["เลขที่ใบเสนอราคา", "ลูกค้า", "เบอร์", "บ้าน", "โครงการ", "แพ็กเกจ", "ประเภท", "มูลค่า", "รับแล้ว", "ค้างรับ", "ส่งลูกค้า", "รับเงิน", "ยืนยันโดย", "Sale"];
  const lines = rows.map((r) => [
    r.doc_no, r.customer_name, r.phone || "", r.house_number || "", r.project_name || "",
    r.package_name_snapshot || "", PLAN[r.plan_type ?? ""] ?? "งานเพิ่ม/ซ่อม",
    r.total, r.received, r.outstanding, d10(r.sent_to_customer_at), d10(r.paid_at),
    r.payments.find((p) => p.confirmed_at)?.confirmed_by ?? "", r.created_by_name ?? "",
  ].map((v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(","));
  return "﻿" + [header.join(","), ...lines].join("\n");
}

export default function OmRevenueReportPage() {
  const { activeRoles } = useActiveRoles();
  const isAdmin = hasRole(activeRoles, "admin");
  const [data, setData] = useState<OmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "outstanding" | "settled" | "pending">("all");
  const [filterPlan, setFilterPlan] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    apiFetch("/api/om/report/payments").then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (!data) return <div className="text-center py-12 text-gray-400 text-sm">โหลดไม่สำเร็จ</div>;

  const projects = [...new Set(data.rows.map((r) => r.project_name).filter(Boolean))] as string[];
  const filtered = data.rows.filter((r) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!r.customer_name?.toLowerCase().includes(q) && !r.phone?.includes(q) && !r.doc_no?.toLowerCase().includes(q)
        && !r.project_name?.toLowerCase().includes(q) && !r.house_number?.toLowerCase().includes(q)) return false;
    }
    if (filterProject !== "all" && r.project_name !== filterProject) return false;
    if (filterStatus === "outstanding" && r.outstanding <= 0) return false;
    if (filterStatus === "settled" && r.outstanding > 0) return false;
    if (filterStatus === "pending" && r.pending <= 0) return false;
    if (filterPlan !== "all" && (r.plan_type ?? "custom") !== filterPlan) return false;
    const d = d10(r.sent_to_customer_at);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });
  const rollup = filtered.reduce((a, r) => ({ total: a.total + r.total, received: a.received + r.received, outstanding: a.outstanding + r.outstanding }),
    { total: 0, received: 0, outstanding: 0 });

  const downloadCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `report_om_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const statusOf = (r: OmRow) => r.outstanding <= 0 && r.received > 0
    ? { t: "รับครบ", cls: "bg-emerald-50 text-emerald-700" }
    : r.pending > 0 ? { t: "รอยืนยัน", cls: "bg-amber-50 text-amber-700" } : { t: "ค้างรับ", cls: "bg-red-50 text-red-700" };
  const nameCell = (r: OmRow, cls: string) => isAdmin
    ? <OmServiceLink houseId={r.house_id} className={`${cls} hover:text-primary`}>{r.customer_name}</OmServiceLink>
    : <span className={cls}>{r.customer_name}</span>;
  const slips = (r: OmRow, size: string) => {
    const urls = r.payments.flatMap((p) => p.slip_urls);
    const gallery = urls.map((u, k) => ({ url: u, label: `${r.doc_no} · สลิป ${k + 1} / ${urls.length}` }));
    return urls.slice(0, 3).map((u, k) => (
      <FallbackImage key={u} src={u} alt="" className={`${size} object-cover rounded border border-gray-200`} gallery={gallery} galleryIndex={k} />
    ));
  };

  return (
    <div>
      <Header title="รายรับ O&M" subtitle="รายงานรับเงินค่าบริการงาน O&M (บัญชี)" />

      <div className="p-3 md:p-6 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-xl bg-white border border-gray-300 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">ใบเสนอราคา</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-gray-900 mt-1">{filtered.length}</div>
          </div>
          <div className="rounded-xl bg-white border border-gray-300 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">มูลค่ารวม</div>
            <div className="text-xl md:text-2xl font-bold font-mono tabular-nums text-gray-900 mt-1">{fmt(rollup.total)}</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/70">รับแล้ว</div>
            <div className="text-xl md:text-2xl font-bold font-mono tabular-nums mt-1">{fmt(rollup.received)}</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/70">ค้างรับ</div>
            <div className="text-xl md:text-2xl font-bold font-mono tabular-nums mt-1">{fmt(rollup.outstanding)}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-300 p-4 space-y-3">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ, เบอร์, เลขที่ใบเสนอราคา, บ้านเลขที่, โครงการ..."
            className="w-full h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
          <div className="flex flex-wrap gap-2">
            <Dropdown className="w-44" value={filterProject} onChange={(v) => { if (v) setFilterProject(v); }}
              options={[{ value: "all", label: "ทุกโครงการ" }, ...projects.map((p) => ({ value: p, label: p }))]} />
            <Dropdown className="w-36" value={filterStatus} onChange={(v) => { if (v) setFilterStatus(v as typeof filterStatus); }} options={[
              { value: "all", label: "สถานะทั้งหมด" }, { value: "outstanding", label: "ยังค้างรับ" },
              { value: "pending", label: "รอ Account ยืนยัน" }, { value: "settled", label: "รับครบแล้ว" },
            ]} />
            <Dropdown className="w-36" value={filterPlan} onChange={(v) => { if (v) setFilterPlan(v); }} options={[
              { value: "all", label: "ทุกประเภท" }, { value: "per_visit", label: "รายครั้ง" },
              { value: "contract", label: "สัญญา 12 เดือน" }, { value: "custom", label: "งานเพิ่ม / ซ่อม" },
            ]} />
            <div className="flex items-center gap-1" title="วันที่ส่งใบเสนอราคาให้ลูกค้า">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 px-2 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-primary" />
              <span className="text-xs text-gray-400">—</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 px-2 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-primary" />
            </div>
            {(search || filterProject !== "all" || filterStatus !== "all" || filterPlan !== "all" || dateFrom || dateTo) && (
              <button type="button" onClick={() => { setSearch(""); setFilterProject("all"); setFilterStatus("all"); setFilterPlan("all"); setDateFrom(""); setDateTo(""); }}
                className="h-8 px-3 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50" style={{ minHeight: 0 }}>ล้าง</button>
            )}
            <button type="button" onClick={downloadCsv} className="h-8 px-3 rounded-lg text-xs font-semibold text-white bg-primary hover:bg-primary-dark ml-auto" style={{ minHeight: 0 }}>Export CSV</button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-300 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">ใบเสนอราคา O&amp;M ({filtered.length})</div>
          </div>
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">ยังไม่มีรายการ</div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <th className="text-left px-4 py-2 font-semibold">เอกสาร</th>
                      <th className="text-left px-4 py-2 font-semibold">ลูกค้า</th>
                      <th className="text-left px-4 py-2 font-semibold">บ้าน / โครงการ</th>
                      <th className="text-left px-4 py-2 font-semibold">แพ็กเกจ</th>
                      <th className="text-right px-4 py-2 font-semibold">มูลค่า</th>
                      <th className="text-right px-4 py-2 font-semibold">รับแล้ว</th>
                      <th className="text-right px-4 py-2 font-semibold">ค้างรับ</th>
                      <th className="text-left px-4 py-2 font-semibold">ส่งลูกค้า</th>
                      <th className="text-left px-4 py-2 font-semibold">สลิป</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((r) => {
                      const st = statusOf(r);
                      return (
                        <tr key={r.quotation_id} className="hover:bg-gray-50/60">
                          <td className="px-4 py-2 font-mono text-xs text-gray-600 whitespace-nowrap">{r.doc_no}
                            <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.t}</span></td>
                          <td className="px-4 py-2">{nameCell(r, "font-semibold text-gray-900")}</td>
                          <td className="px-4 py-2 text-gray-600">{r.house_number ? `${r.house_number} · ` : ""}{r.project_name ?? "—"}</td>
                          <td className="px-4 py-2 text-gray-600">{r.package_name_snapshot || "งานเพิ่ม / ซ่อม"}</td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums">{fmt(r.total)}</td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums text-emerald-700">{fmt(r.received)}</td>
                          <td className="px-4 py-2 text-right font-mono tabular-nums text-amber-700">{fmt(r.outstanding)}</td>
                          <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{r.sent_to_customer_at ? fmtDate(r.sent_to_customer_at) : "—"}</td>
                          <td className="px-4 py-2"><div className="flex gap-1">{slips(r, "w-9 h-9")}</div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden divide-y divide-gray-100">
                {filtered.map((r) => {
                  const st = statusOf(r);
                  return (
                    <div key={r.quotation_id} className="p-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate">{nameCell(r, "font-semibold text-gray-900")}</div>
                          <div className="text-[11px] text-gray-400 font-mono truncate">{r.doc_no}{r.project_name ? ` · ${r.project_name}` : ""}</div>
                        </div>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.t}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-xs">
                        <div><div className="text-gray-400">มูลค่า</div><div className="font-mono font-semibold">{fmt(r.total)}</div></div>
                        <div><div className="text-gray-400">รับแล้ว</div><div className="font-mono font-semibold text-emerald-700">{fmt(r.received)}</div></div>
                        <div><div className="text-gray-400">ค้างรับ</div><div className="font-mono font-semibold text-amber-700">{fmt(r.outstanding)}</div></div>
                      </div>
                      <div className="flex gap-1">{slips(r, "w-12 h-12")}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
