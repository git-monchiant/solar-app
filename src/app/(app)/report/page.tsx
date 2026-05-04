"use client";
import { apiFetch } from "@/lib/api";
import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import FallbackImage from "@/components/ui/FallbackImage";
import ImageLightbox, { type LightboxImage } from "@/components/ui/ImageLightbox";
import { formatTHB, formatThaiDate as fmtDate } from "@/lib/utils/formatters";

interface Installment {
  id: number;
  step_no: number;
  slip_field: string;
  doc_no: string | null;
  amount: number;
  description: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  has_slip: boolean;
  slip_urls: string[];
}

interface ReportRow {
  lead_id: number;
  pre_doc_no: string;
  full_name: string;
  phone: string;
  status: string;
  payment_type: string | null;
  zone: string | null;
  project_name: string | null;
  district: string | null;
  province: string | null;
  package_name: string | null;
  kwp: number | null;
  created_by_name: string | null;
  pre_booked_at: string;
  total_value: number;
  received: number;
  outstanding: number;
  pending_approval: number;
  pending_amount: number;
  installments: Installment[];
}

interface ReportData {
  rows: ReportRow[];
  summary: { count: number; total_value: number; received: number; outstanding: number };
}

const fmt = (n: number) => formatTHB(Math.round(n));
const fmtDateTime = (d: string) => fmtDate(d, { time: true });
const paymentLabels: Record<string, string> = { transfer: "โอนเงิน", cash: "เงินสด", credit_card: "บัตรเครดิต", home_equity: "Home Equity", finance: "สินเชื่อ" };
// Step → label. Per-installment payments live at step_no 10+ where the
// suffix in slip_field (`order_installment_<i>`) is the 0-based installment
// index. step 4 is the legacy "after-install" slot kept for older leads.
const stepLabels: Record<number, string> = { 0: "มัดจำ", 1: "ค่าสำรวจ", 3: "งวด 1/2", 4: "งวด 2/2" };
function labelForInstallment(step_no: number, slip_field: string): string {
  if (stepLabels[step_no]) return stepLabels[step_no];
  const m = /^order_installment_(\d+)$/.exec(slip_field || "");
  if (m) return `งวดที่ ${parseInt(m[1]) + 1}`;
  return `step ${step_no}`;
}

function toCsv(rows: ReportRow[]): string {
  const header = ["เลขเอกสาร", "ลูกค้า", "เบอร์", "โครงการ", "แพ็คเกจ", "ช่องทาง", "มูลค่ารวม", "รับแล้ว", "ค้างรับ", "วันที่ทำสัญญา", "รายละเอียดการรับเงิน"];
  const lines = rows.map(r => [
    r.pre_doc_no,
    r.full_name,
    r.phone || "",
    r.project_name || "",
    r.package_name || "",
    paymentLabels[r.payment_type || ""] || r.payment_type || "",
    r.total_value,
    r.received,
    r.outstanding,
    r.pre_booked_at ? String(r.pre_booked_at).slice(0, 10) : "",
    r.installments.map(i => `${labelForInstallment(i.step_no, i.slip_field)}: ${fmt(i.amount)} ${i.confirmed_at ? `(${String(i.confirmed_at).slice(0,10)})` : "(รอยืนยัน)"}`).join(" | "),
  ].map(v => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(","));
  return "\ufeff" + [header.join(","), ...lines].join("\n");
}

export default function ReportPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "outstanding" | "settled" | "pending_approval">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);

  useEffect(() => {
    apiFetch("/api/report/payments").then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  const openSlips = (i: Installment) => {
    if (i.slip_urls.length === 0) return;
    const label = labelForInstallment(i.step_no, i.slip_field);
    const imgs: LightboxImage[] = i.slip_urls.map((url, idx) => ({
      url, label: i.slip_urls.length > 1 ? `${label} · สลิป ${idx + 1} / ${i.slip_urls.length}` : label,
    }));
    setLightbox({ images: imgs, index: 0 });
  };

  if (loading) return <div className="flex items-center justify-center h-full py-20"><div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" /></div>;
  if (!data) return <div className="text-center py-12 text-gray-400 text-sm">Unable to load data</div>;

  const projects = [...new Set(data.rows.map(r => r.project_name).filter(Boolean))] as string[];

  const filtered = data.rows.filter(r => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!r.full_name?.toLowerCase().includes(q) && !r.phone?.includes(q) && !r.pre_doc_no?.toLowerCase().includes(q) && !r.project_name?.toLowerCase().includes(q)) return false;
    }
    if (filterProject !== "all" && r.project_name !== filterProject) return false;
    if (filterStatus === "outstanding" && r.outstanding <= 0) return false;
    if (filterStatus === "settled" && r.outstanding > 0) return false;
    if (filterStatus === "pending_approval" && r.pending_approval === 0) return false;
    if (dateFrom || dateTo) {
      const d = r.pre_booked_at ? String(r.pre_booked_at).slice(0, 10) : "";
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
    }
    return true;
  }).sort((a, b) => String(b.pre_booked_at || "").localeCompare(String(a.pre_booked_at || "")));

  const rollup = filtered.reduce(
    (acc, r) => {
      acc.total_value += r.total_value;
      acc.received += r.received;
      acc.outstanding += r.outstanding;
      return acc;
    },
    { total_value: 0, received: 0, outstanding: 0 },
  );

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const downloadCsv = () => {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Header title="Report" subtitle="รายงานรับชำระเงิน (บัญชี)" />

      <div className="p-3 md:p-6 space-y-3">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-xl bg-white border border-gray-300 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">รายการ</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-gray-900 mt-1">{filtered.length}</div>
          </div>
          <div className="rounded-xl bg-white border border-gray-300 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">มูลค่ารวม</div>
            <div className="text-xl md:text-2xl font-bold font-mono tabular-nums text-gray-900 mt-1">{fmt(rollup.total_value)}</div>
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

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-300 p-4 space-y-3">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ, เบอร์, เลขเอกสาร, โครงการ..." className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
          <div className="flex flex-wrap gap-2">
            <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="h-9 px-3 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-primary">
              <option value="all">ทุกโครงการ</option>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as "all" | "outstanding" | "settled" | "pending_approval")} className="h-9 px-3 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-primary">
              <option value="all">สถานะทั้งหมด</option>
              <option value="outstanding">ยังค้างรับ</option>
              <option value="settled">ครบแล้ว</option>
            </select>
            <div className="flex items-center gap-1">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 px-2 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-primary" />
              <span className="text-xs text-gray-400">—</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 px-2 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-primary" />
            </div>
            {(search || filterProject !== "all" || filterStatus !== "all" || dateFrom || dateTo) && (
              <button type="button" onClick={() => { setSearch(""); setFilterProject("all"); setFilterStatus("all"); setDateFrom(""); setDateTo(""); }} className="h-9 px-3 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50" style={{ minHeight: 0 }}>ล้าง</button>
            )}
            <button type="button" onClick={downloadCsv} className="h-9 px-3 rounded-lg text-xs font-semibold text-white bg-primary hover:bg-primary-dark ml-auto" style={{ minHeight: 0 }}>Export CSV</button>
          </div>
        </div>

        {/* Transaction List */}
        <div className="bg-white rounded-xl border border-gray-300 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">รายการสัญญา ({filtered.length})</div>
          </div>

          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="w-8"></th>
                  <th className="text-left px-4 py-2 font-semibold">เอกสาร</th>
                  <th className="text-left px-4 py-2 font-semibold">ลูกค้า</th>
                  <th className="text-left px-4 py-2 font-semibold">โครงการ</th>
                  <th className="text-right px-4 py-2 font-semibold">มูลค่ารวม</th>
                  <th className="text-right px-4 py-2 font-semibold">รับแล้ว</th>
                  <th className="text-right px-4 py-2 font-semibold">ค้างรับ</th>
                  <th className="text-left px-4 py-2 font-semibold">เริ่ม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => {
                  const isOpen = expanded.has(r.lead_id);
                  const settled = r.outstanding <= 0 && r.received > 0;
                  return (
                    <Fragment key={r.lead_id}>
                      <tr className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => toggle(r.lead_id)}>
                        <td className="px-2 py-3 text-gray-400 text-center">{isOpen ? "▾" : "▸"}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.pre_doc_no}</td>
                        <td className="px-4 py-3">
                          <Link href={`/leads/${r.lead_id}`} onClick={e => e.stopPropagation()} className="text-sm font-semibold text-gray-900 hover:text-primary">{r.full_name}</Link>
                          <div className="text-xs text-gray-400">{r.package_name || ""}{r.kwp ? ` · ${r.kwp} kWp` : ""}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{r.project_name || "—"}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-gray-900">{fmt(r.total_value)}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">{fmt(r.received)}</td>
                        <td className={`px-4 py-3 text-right font-mono tabular-nums font-bold ${settled ? "text-gray-400" : "text-amber-600"}`}>{settled ? "—" : fmt(r.outstanding)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{r.pre_booked_at ? fmtDate(r.pre_booked_at) : "—"}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-gray-50">
                          <td></td>
                          <td colSpan={7} className="px-4 py-3">
                            {r.installments.length === 0 ? (
                              <div className="text-xs text-gray-400">ยังไม่มีรายการรับเงิน</div>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-400 uppercase">
                                    <th className="text-left py-1 font-semibold">งวด</th>
                                    <th className="text-left py-1 font-semibold">สถานะ</th>
                                    <th className="text-left py-1 font-semibold">รายละเอียด</th>
                                    <th className="text-left py-1 font-semibold">เลขเอกสาร</th>
                                    <th className="text-left py-1 font-semibold">ผู้ยืนยัน</th>
                                    <th className="text-right py-1 font-semibold">จำนวน</th>
                                    <th className="text-left py-1 font-semibold pl-4">วันเวลา</th>
                                    <th className="text-right py-1 font-semibold">หลักฐาน</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.installments.map(i => {
                                    const isPaid = !!i.confirmed_at;
                                    return (
                                      <tr key={i.id} className="border-t border-gray-200">
                                        <td className="py-1 font-semibold text-gray-700">{labelForInstallment(i.step_no, i.slip_field)}</td>
                                        <td className="py-1">
                                          {isPaid ? (
                                            <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold">ชำระแล้ว</span>
                                          ) : (
                                            <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-bold">
                                              {i.has_slip ? "รอยืนยัน" : "รอชำระ"}
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-1 text-gray-600">{i.description || "—"}</td>
                                        <td className="py-1 font-mono text-gray-500">{i.doc_no || "—"}</td>
                                        <td className="py-1 text-gray-500">{i.confirmed_by || "—"}</td>
                                        <td className={`py-1 text-right font-mono tabular-nums font-semibold ${isPaid ? "text-emerald-700" : "text-gray-400"}`}>{fmt(i.amount)}</td>
                                        <td className="py-1 text-gray-500 pl-4">{i.confirmed_at ? fmtDateTime(i.confirmed_at) : "—"}</td>
                                        <td className="py-1 text-right">
                                          <div className="inline-flex items-center gap-1.5 justify-end">
                                            {i.slip_urls.length > 0 ? (
                                              <div className="flex items-center gap-1">
                                                {i.slip_urls.slice(0, 3).map((url, idx) => (
                                                  <FallbackImage
                                                    key={url}
                                                    src={url}
                                                    alt=""
                                                    className="w-9 h-9 object-cover rounded border border-gray-200 cursor-pointer hover:border-active"
                                                    gallery={i.slip_urls.map((u, k) => ({ url: u, label: i.slip_urls.length > 1 ? `${labelForInstallment(i.step_no, i.slip_field)} · สลิป ${k + 1} / ${i.slip_urls.length}` : labelForInstallment(i.step_no, i.slip_field) }))}
                                                    galleryIndex={idx}
                                                  />
                                                ))}
                                                {i.slip_urls.length > 3 && (
                                                  <button type="button" onClick={() => openSlips(i)} className="w-9 h-9 rounded border border-gray-200 bg-gray-50 text-[10px] font-semibold text-gray-600 hover:border-active hover:text-active" style={{ minHeight: 0 }}>
                                                    +{i.slip_urls.length - 3}
                                                  </button>
                                                )}
                                              </div>
                                            ) : <span className="text-gray-300 text-[11px]">—</span>}
                                            {!isPaid && i.has_slip && (
                                              <Link href={`/leads/${r.lead_id}`} onClick={e => e.stopPropagation()} className="h-7 px-2 rounded text-[11px] font-semibold text-white bg-amber-500 hover:brightness-110 inline-flex items-center" style={{ minHeight: 0 }}>
                                                ยืนยันรับเงิน
                                              </Link>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y divide-gray-100">
            {filtered.map(r => {
              const isOpen = expanded.has(r.lead_id);
              const settled = r.outstanding <= 0 && r.received > 0;
              return (
                <div key={r.lead_id}>
                  <button type="button" onClick={() => toggle(r.lead_id)} className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <Link href={`/leads/${r.lead_id}`} onClick={e => e.stopPropagation()} className="text-sm font-semibold text-gray-900">{r.full_name}</Link>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${settled ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {settled ? "PAID" : "ค้าง"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 font-mono">{r.pre_doc_no}{r.project_name ? ` · ${r.project_name}` : ""}</div>
                    <div className="mt-1 grid grid-cols-3 gap-1 text-xs">
                      <div>
                        <div className="text-gray-400">รวม</div>
                        <div className="font-mono font-semibold text-gray-900">{fmt(r.total_value)}</div>
                      </div>
                      <div>
                        <div className="text-gray-400">รับแล้ว</div>
                        <div className="font-mono font-semibold text-emerald-700">{fmt(r.received)}</div>
                      </div>
                      <div>
                        <div className="text-gray-400">ค้าง</div>
                        <div className={`font-mono font-bold ${settled ? "text-gray-400" : "text-amber-600"}`}>{settled ? "—" : fmt(r.outstanding)}</div>
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-3 bg-gray-50 space-y-2">
                      {r.installments.length === 0 ? (
                        <div className="text-xs text-gray-400 py-2">ยังไม่มีรายการรับเงิน</div>
                      ) : r.installments.map(i => {
                        const isPaid = !!i.confirmed_at;
                        return (
                          <div key={i.id} className="flex items-start justify-between gap-2 py-1 text-xs">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-gray-700">{labelForInstallment(i.step_no, i.slip_field)}</span>
                                {isPaid ? (
                                  <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold">ชำระแล้ว</span>
                                ) : (
                                  <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-bold">
                                    {i.has_slip ? "รอยืนยัน" : "รอชำระ"}
                                  </span>
                                )}
                              </div>
                              <div className="text-gray-500 truncate">{i.description || "—"}</div>
                              <div className="text-gray-400">{i.confirmed_at ? fmtDateTime(i.confirmed_at) : "—"}</div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {i.slip_urls.slice(0, 3).map((url, idx) => (
                                  <FallbackImage
                                    key={url}
                                    src={url}
                                    alt=""
                                    className="w-10 h-10 object-cover rounded border border-gray-200"
                                    gallery={i.slip_urls.map((u, k) => ({ url: u, label: i.slip_urls.length > 1 ? `${labelForInstallment(i.step_no, i.slip_field)} · สลิป ${k + 1} / ${i.slip_urls.length}` : labelForInstallment(i.step_no, i.slip_field) }))}
                                    galleryIndex={idx}
                                  />
                                ))}
                                {i.slip_urls.length > 3 && (
                                  <button type="button" onClick={() => openSlips(i)} className="w-10 h-10 rounded border border-gray-200 bg-gray-50 text-[10px] font-semibold text-gray-600" style={{ minHeight: 0 }}>
                                    +{i.slip_urls.length - 3}
                                  </button>
                                )}
                                {!isPaid && i.has_slip && (
                                  <Link href={`/leads/${r.lead_id}`} onClick={e => e.stopPropagation()} className="h-7 px-2 rounded text-[11px] font-semibold text-white bg-amber-500 inline-flex items-center" style={{ minHeight: 0 }}>
                                    ยืนยันรับเงิน
                                  </Link>
                                )}
                              </div>
                            </div>
                            <div className={`font-mono font-semibold tabular-nums shrink-0 ${isPaid ? "text-emerald-700" : "text-gray-400"}`}>{fmt(i.amount)}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-400">ไม่พบรายการ</div>}
          </div>
        </div>
      </div>

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndexChange={(n) => setLightbox(prev => prev ? { ...prev, index: n } : null)}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
