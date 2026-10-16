"use client";

// รายรับ B2B — รายงานรับเงินงวดของโครงการ B2B แยกจากรายรับฝั่งขาย/O&M (แผน docs/plan/20261015-08-b2b-income-report.md)
// ★ ผังยกจากหน้ารายรับ O&M (การ์ดสรุป 4 ช่อง · แถบกรอง · ตาราง desktop / การ์ด mobile · CSV)
//   ต่างที่ 1 แถว = 1 โครงการ มีหลายงวด → แถบงวดในแถว + กางดูรายละเอียดทีละงวด · CSV ออกทีละงวด (ใช้ลงบัญชี)
import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import Dropdown from "@/components/ui/Dropdown";
import { useDialog } from "@/components/ui/Dialog";
import { apiFetch } from "@/lib/api";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatTHB, formatThaiDate as fmtDate } from "@/lib/utils/formatters";
import { INSTALLMENT_STATUS_LABEL, INSTALLMENT_STATUS_TONE, type B2bInstallment } from "@/lib/b2b/project";
import StageBadge from "@/components/b2b/project/StageBadge";
import { openAuthedFile } from "@/components/b2b/openAuthedFile";

interface Row {
  id: number; code: string; name: string; stage: number; customer_name: string; tax_id: string | null;
  contract_no: string | null; contract_date: string | null; contract_value: number | null; contract_vat_pct: number | null; won_date: string | null;
  quote_doc_no: string | null; quote_revision: number | null;
  total: number; received: number; due: number; pending: number; outstanding: number;
  installments: B2bInstallment[];
}

const fmt = (n: number) => formatTHB(n, { decimals: 2 });
const d10 = (v: string | null) => (v ? String(v).slice(0, 10) : "");
type Status = "all" | "outstanding" | "due" | "pending" | "settled";

function toCsv(rows: Row[]): string {
  const header = ["เลขที่โครงการ", "โครงการ", "ลูกค้า", "เลขผู้เสียภาษี", "เลข PO/สัญญา", "ใบเสนอราคา", "งวด", "%", "เงื่อนไข",
    "ก่อน VAT", "VAT", "รวม VAT", "สถานะ", "ถึงกำหนด", "ลูกค้าชำระ", "บัญชียืนยัน", "ยืนยันโดย"];
  const lines = rows.flatMap((r) => r.installments.map((i) => [
    r.code, r.name, r.customer_name, r.tax_id ?? "", r.contract_no ?? "", r.quote_doc_no ? `${r.quote_doc_no} Rev ${r.quote_revision}` : "",
    i.no, i.pct, i.condition, i.amount, i.vat, i.total, INSTALLMENT_STATUS_LABEL[i.status],
    d10(i.due_at), d10(i.received_date), d10(i.confirmed_at), i.confirmed_by_name ?? "",
  ].map((v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")));
  return "﻿" + [header.join(","), ...lines].join("\n");
}

export default function B2bIncomeReportPage() {
  const { toast } = useDialog();
  const { activeRoles } = useActiveRoles();
  const canUse = hasRole(activeRoles, "account", "admin");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (!canUse) return;
    apiFetch("/api/b2b/report/income").then((r: { rows: Row[] }) => setRows(r.rows)).catch(() => setFailed(true));
  }, [canUse]);

  if (activeRoles.length > 0 && !canUse) {
    return (
      <div>
        <Header title="รายรับ B2B" subtitle="รายงานรับเงินงวดโครงการ B2B (บัญชี)" />
        <main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">role ที่กำลังใช้งานไม่มีสิทธิ์เปิดหน้านี้</div></main>
      </div>
    );
  }
  if (failed) return <div className="text-center py-12 text-gray-400 text-sm">โหลดไม่สำเร็จ</div>;
  if (!rows) return <Loading />;

  const filtered = rows.filter((r) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (![r.code, r.name, r.customer_name, r.contract_no, r.quote_doc_no, r.tax_id].some((x) => (x ?? "").toLowerCase().includes(q))) return false;
    }
    if (status === "outstanding" && r.outstanding <= 0) return false;
    if (status === "due" && r.due <= 0) return false;
    if (status === "pending" && r.pending <= 0) return false;
    if (status === "settled" && !(r.received > 0 && r.received >= r.total)) return false;
    const d = d10(r.won_date);
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
    a.href = url; a.download = `report_b2b_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const statusOf = (r: Row) => r.received > 0 && r.received >= r.total ? { t: "รับครบ", cls: "bg-emerald-50 text-emerald-700" }
    : r.pending > 0 ? { t: "รอยืนยัน", cls: "bg-blue-50 text-blue-700" }
    : r.due > 0 ? { t: "ถึงกำหนด", cls: "bg-amber-50 text-amber-700" }
    : r.outstanding > 0 ? { t: "ค้างรับ", cls: "bg-gray-100 text-gray-600" } : { t: "ไม่เก็บต่อ", cls: "bg-gray-100 text-gray-400" };
  const viewEvidence = (i: B2bInstallment) => {
    void openAuthedFile(`/api/b2b/installments/${i.id}/evidence`).catch((e) => toast({ message: e.message, variant: "danger" }));
  };
  // แถบงวด: เลขงวดระบายสีตามสถานะ — เห็นทั้งโครงการในบรรทัดเดียว
  const instChips = (r: Row) => (
    <div className="flex flex-wrap gap-1">
      {r.installments.map((i) => (
        <span key={i.id} title={`งวด ${i.no} · ${INSTALLMENT_STATUS_LABEL[i.status]} · ${fmt(i.total)}`}
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${INSTALLMENT_STATUS_TONE[i.status]}`}>{i.no}</span>
      ))}
    </div>
  );
  const projectLink = (r: Row, cls: string) => <Link href={`/b2b/projects/${r.id}?tab=installments`} className={`${cls} hover:text-primary`}>{r.name}</Link>;
  const detail = (r: Row) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-xs">
        <thead>
          <tr className="text-left text-gray-400">
            <th className="px-3 py-1.5 font-semibold">งวด</th>
            <th className="px-3 py-1.5 font-semibold">เงื่อนไข</th>
            <th className="px-3 py-1.5 font-semibold text-right">รวม VAT</th>
            <th className="px-3 py-1.5 font-semibold">สถานะ</th>
            <th className="px-3 py-1.5 font-semibold">ลูกค้าชำระ</th>
            <th className="px-3 py-1.5 font-semibold">บัญชียืนยัน</th>
            <th className="px-3 py-1.5 font-semibold"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {r.installments.map((i) => (
            <tr key={i.id}>
              <td className="px-3 py-1.5 whitespace-nowrap"><b>{i.no}</b> · {i.pct}%</td>
              <td className="px-3 py-1.5 text-gray-600">{i.condition}</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmt(i.total)}</td>
              <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 font-bold whitespace-nowrap ${INSTALLMENT_STATUS_TONE[i.status]}`}>{INSTALLMENT_STATUS_LABEL[i.status]}</span></td>
              <td className="px-3 py-1.5 whitespace-nowrap text-gray-600">{i.received_date ? fmtDate(i.received_date) : "—"}</td>
              <td className="px-3 py-1.5 whitespace-nowrap text-gray-600">{i.confirmed_at ? `${fmtDate(i.confirmed_at)}${i.confirmed_by_name ? ` · ${i.confirmed_by_name}` : ""}` : "—"}</td>
              <td className="px-3 py-1.5 text-right">
                {i.has_evidence && <button type="button" onClick={() => viewEvidence(i)} style={{ minHeight: 0 }} className="text-primary font-semibold hover:underline whitespace-nowrap">ดูหลักฐาน</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const toggle = (r: Row) => setOpen(open === r.id ? null : r.id);
  const chevron = (r: Row) => (
    <svg className={`w-4 h-4 text-gray-400 transition-transform ${open === r.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );

  return (
    <div>
      <Header title="รายรับ B2B" subtitle="รายงานรับเงินงวดโครงการ B2B · ยอดรวม VAT (บัญชี)" />

      <div className="p-3 md:p-6 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-xl bg-white border border-gray-300 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">โครงการ</div>
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
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาเลขที่โครงการ, ชื่อโครงการ, บริษัท, เลขผู้เสียภาษี, เลข PO/สัญญา, เลขที่ใบเสนอราคา..."
            className="w-full h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
          <div className="flex flex-wrap gap-2">
            <Dropdown className="w-44" value={status} onChange={(v) => { if (v) setStatus(v as Status); }} options={[
              { value: "all", label: "สถานะทั้งหมด" }, { value: "outstanding", label: "ยังค้างรับ" }, { value: "due", label: "มีงวดถึงกำหนดวางบิล" },
              { value: "pending", label: "รอบัญชียืนยัน" }, { value: "settled", label: "รับครบแล้ว" },
            ]} />
            <div className="flex items-center gap-1" title="วันที่ได้งาน">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 px-2 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-primary" />
              <span className="text-xs text-gray-400">—</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 px-2 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-primary" />
            </div>
            {(search || status !== "all" || dateFrom || dateTo) && (
              <button type="button" onClick={() => { setSearch(""); setStatus("all"); setDateFrom(""); setDateTo(""); }}
                className="h-8 px-3 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50" style={{ minHeight: 0 }}>ล้าง</button>
            )}
            <button type="button" onClick={downloadCsv} className="h-8 px-3 rounded-lg text-xs font-semibold text-white bg-primary hover:bg-primary-dark ml-auto" style={{ minHeight: 0 }}>Export CSV (รายงวด)</button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-300 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">โครงการที่ได้งาน ({filtered.length})</div>
          </div>
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">ยังไม่มีรายการ</div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <th className="text-left px-4 py-2 font-semibold">โครงการ</th>
                      <th className="text-left px-4 py-2 font-semibold">ลูกค้า</th>
                      <th className="text-left px-4 py-2 font-semibold">สัญญา</th>
                      <th className="text-left px-4 py-2 font-semibold">งวด</th>
                      <th className="text-right px-4 py-2 font-semibold">มูลค่า</th>
                      <th className="text-right px-4 py-2 font-semibold">รับแล้ว</th>
                      <th className="text-right px-4 py-2 font-semibold">ค้างรับ</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((r) => {
                      const st = statusOf(r);
                      return (
                        <Fragment key={r.id}>
                          <tr className="hover:bg-gray-50/60 cursor-pointer" onClick={() => toggle(r)}>
                            <td className="px-4 py-2">
                              <div className="font-mono text-xs text-gray-500 whitespace-nowrap">{r.code}
                                <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.t}</span></div>
                              <div onClick={(e) => e.stopPropagation()}>{projectLink(r, "font-semibold text-gray-900")}</div>
                              <StageBadge stage={r.stage} sub={null} surveyDate={null} className="mt-0.5" />
                            </td>
                            <td className="px-4 py-2 text-gray-700">{r.customer_name}{r.tax_id && <div className="text-xs text-gray-400">{r.tax_id}</div>}</td>
                            <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">
                              {r.contract_no ?? "—"}
                              <div className="text-gray-400">{r.quote_doc_no ? `${r.quote_doc_no} Rev ${r.quote_revision}` : ""}</div>
                              <div className="text-gray-400">{r.won_date ? `ได้งาน ${fmtDate(r.won_date)}` : ""}</div>
                            </td>
                            <td className="px-4 py-2">{instChips(r)}</td>
                            <td className="px-4 py-2 text-right font-mono tabular-nums">{fmt(r.total)}</td>
                            <td className="px-4 py-2 text-right font-mono tabular-nums text-emerald-700">{fmt(r.received)}</td>
                            <td className="px-4 py-2 text-right font-mono tabular-nums text-amber-700">{fmt(r.outstanding)}</td>
                            <td className="px-2 py-2">{chevron(r)}</td>
                          </tr>
                          {open === r.id && <tr><td colSpan={8} className="bg-gray-50/60 px-2 py-2">{detail(r)}</td></tr>}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden divide-y divide-gray-100">
                {filtered.map((r) => {
                  const st = statusOf(r);
                  return (
                    <div key={r.id} className="p-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate">{projectLink(r, "font-semibold text-gray-900")}</div>
                          <div className="text-[11px] text-gray-400 font-mono truncate">{r.code} · {r.customer_name}</div>
                        </div>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.t}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-xs">
                        <div><div className="text-gray-400">มูลค่า</div><div className="font-mono font-semibold">{fmt(r.total)}</div></div>
                        <div><div className="text-gray-400">รับแล้ว</div><div className="font-mono font-semibold text-emerald-700">{fmt(r.received)}</div></div>
                        <div><div className="text-gray-400">ค้างรับ</div><div className="font-mono font-semibold text-amber-700">{fmt(r.outstanding)}</div></div>
                      </div>
                      <button type="button" onClick={() => toggle(r)} style={{ minHeight: 0 }} className="flex w-full items-center justify-between gap-2">
                        {instChips(r)}{chevron(r)}
                      </button>
                      {open === r.id && detail(r)}
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
