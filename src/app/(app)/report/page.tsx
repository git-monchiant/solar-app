"use client";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";

interface Payment {
  id: number;
  booking_number: string;
  total_price: number;
  booking_status: string;
  payment_confirmed: boolean;
  booking_date: string;
  lead_id: number;
  full_name: string;
  phone: string;
  payment_type: string | null;
  zone: string | null;
  project_name: string | null;
  district: string | null;
  province: string | null;
  package_name: string | null;
  kwp: number | null;
  created_by_name: string | null;
}

interface ReportData {
  payments: Payment[];
  summary: { total_bookings: number; total_value: number; confirmed: number; pending: number };
}

const fmt = (n: number) => new Intl.NumberFormat("th-TH").format(n);
const fmtDate = (d: string) => new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
const paymentLabels: Record<string, string> = { transfer: "โอนเงิน", cash: "เงินสด", credit_card: "บัตรเครดิต", home_equity: "Home Equity", finance: "สินเชื่อ" };

export default function ReportPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    apiFetch("/api/report/payments").then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full py-20"><div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" /></div>;
  if (!data) return <div className="text-center py-12 text-gray-400 text-sm">Unable to load data</div>;

  const paidPayments = data.payments.filter(p => p.payment_confirmed);
  const projects = [...new Set(paidPayments.map(p => p.project_name).filter(Boolean))] as string[];

  const filtered = paidPayments.filter(p => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!p.full_name?.toLowerCase().includes(q) && !p.phone?.includes(q) && !p.booking_number?.toLowerCase().includes(q) && !p.project_name?.toLowerCase().includes(q)) return false;
    }
    if (filterProject !== "all" && p.project_name !== filterProject) return false;
    if (dateFrom) {
      const d = String(p.booking_date).slice(0, 10);
      if (d < dateFrom) return false;
    }
    if (dateTo) {
      const d = String(p.booking_date).slice(0, 10);
      if (d > dateTo) return false;
    }
    return true;
  });

  const filteredTotal = filtered.reduce((sum, p) => sum + (p.total_price || 0), 0);

  return (
    <div>
      <Header title="Report" subtitle="PAYMENT REPORT" />

      <div className="p-3 md:p-6 space-y-3">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white border border-gray-300 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">รายการ</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-gray-900 mt-1">{filtered.length}</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-primary to-primary-dark text-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/70">รวม</div>
            <div className="text-2xl font-bold font-mono tabular-nums mt-1">{fmt(filteredTotal)}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-300 p-4 space-y-3">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ, เบอร์, booking number..." className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
          <div className="flex flex-wrap gap-2">
            <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="h-9 px-3 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-primary">
              <option value="all">ทุกโครงการ</option>
              {projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 px-2 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-primary" />
              <span className="text-xs text-gray-400">—</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 px-2 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-primary" />
            </div>
            {(search || filterProject !== "all" || dateFrom || dateTo) && (
              <button type="button" onClick={() => { setSearch(""); setFilterProject("all"); setDateFrom(""); setDateTo(""); }} className="h-9 px-3 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50" style={{ minHeight: 0 }}>ล้าง</button>
            )}
          </div>
        </div>

        {/* Payment List */}
        <div className="bg-white rounded-xl border border-gray-300 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">รายการรับชำระเงิน</div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <th className="text-left px-4 py-2 font-semibold">Booking</th>
                  <th className="text-left px-4 py-2 font-semibold">ชื่อลูกค้า</th>
                  <th className="text-left px-4 py-2 font-semibold">โครงการ</th>
                  <th className="text-left px-4 py-2 font-semibold">แพ็คเกจ</th>
                  <th className="text-left px-4 py-2 font-semibold">การชำระ</th>
                  <th className="text-right px-4 py-2 font-semibold">จำนวนเงิน</th>
                  <th className="text-left px-4 py-2 font-semibold">วันที่ชำระ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.booking_number}</td>
                    <td className="px-4 py-3">
                      <Link href={`/leads/${p.lead_id}`} className="text-sm font-semibold text-gray-900 hover:text-primary">{p.full_name}</Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{p.project_name || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{p.package_name || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{paymentLabels[p.payment_type || ""] || p.payment_type || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-gray-900">{fmt(p.total_price)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(p.booking_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {data.payments.map(p => (
              <Link key={p.id} href={`/leads/${p.lead_id}`} className="block px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-gray-900">{p.full_name}</span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${p.payment_confirmed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {p.payment_confirmed ? "PAID" : "PENDING"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    <span className="font-mono">{p.booking_number}</span>
                    {p.project_name && <span> · {p.project_name}</span>}
                  </div>
                  <span className="text-sm font-bold font-mono tabular-nums text-gray-900">{fmt(p.total_price)}</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {fmtDate(p.booking_date)} · {paymentLabels[p.payment_type || ""] || p.payment_type || "—"}
                  {p.zone && <span> · {p.zone}</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
