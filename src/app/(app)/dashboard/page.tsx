"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { STATUS_CONFIG } from "@/lib/statuses";

interface DashboardData {
  total_leads: number;
  total_bookings: number;
  total_booking_value: number;
  total_won: number;
  conversion_rate: number;
  this_month: { new_leads: number; bookings: number; booking_value: number; won: number };
  last_month: { new_leads: number; bookings: number };
  status_breakdown: { status: string; count: number }[];
  recent_leads: { id: number; full_name: string; status: string; project_name: string; created_at: string }[];
  top_projects: { name: string; lead_count: number; won: number }[];
  recent_activities: { title: string; activity_type: string; created_at: string; full_name: string; by_name: string }[];
}

const fmt = (n: number) => new Intl.NumberFormat("th-TH").format(n);
const fmtDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
const fmtTime = (d: string) => new Date(d).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

function Trend({ current, previous, suffix = "" }: { current: number; previous: number; suffix?: string }) {
  if (previous === 0) return null;
  const diff = current - previous;
  const pct = Math.round((diff / previous) * 100);
  if (pct === 0) return null;
  return (
    <span className={`text-xs font-semibold ${pct > 0 ? "text-emerald-600" : "text-red-500"}`}>
      {pct > 0 ? "↑" : "↓"} {Math.abs(pct)}%{suffix}
    </span>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/dashboard").then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full py-20"><div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" /></div>;
  if (!data) return <div className="text-center py-12 text-gray-400 text-sm">Unable to load data</div>;

  const pipelineOrder = ["registered", "booked", "survey", "quoted", "purchased", "installed", "lost"];
  const sortedStatus = [...data.status_breakdown].sort((a, b) => pipelineOrder.indexOf(a.status) - pipelineOrder.indexOf(b.status));
  const totalByStatus = data.status_breakdown.reduce((sum, s) => sum + s.count, 0);

  return (
    <div>
      <Header title="Dashboard" subtitle="SENA SOLAR ENERGY" />

      <div className="p-3 md:p-6 space-y-3">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-xl bg-white border border-gray-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Leads</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-gray-900 mt-1">{data.total_leads}</div>
          </div>
          <div className="rounded-xl bg-white border border-gray-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Bookings</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-gray-900 mt-1">{data.total_bookings}</div>
          </div>
          <div className="rounded-xl bg-white border border-gray-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Won</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-gray-900 mt-1">{data.total_won}</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-primary to-primary-dark text-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/70">Conversion</div>
            <div className="text-2xl font-bold font-mono tabular-nums mt-1">{data.conversion_rate}%</div>
          </div>
        </div>

        {/* This Month */}
        <div className="rounded-xl bg-white border border-gray-200 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">This Month</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xl font-bold font-mono tabular-nums text-gray-900">{data.this_month.new_leads}</div>
              <div className="text-xs text-gray-500 flex items-center gap-1">New Leads <Trend current={data.this_month.new_leads} previous={data.last_month.new_leads} /></div>
            </div>
            <div>
              <div className="text-xl font-bold font-mono tabular-nums text-gray-900">{data.this_month.bookings}</div>
              <div className="text-xs text-gray-500 flex items-center gap-1">Booked <Trend current={data.this_month.bookings} previous={data.last_month.bookings} /></div>
            </div>
            <div>
              <div className="text-xl font-bold font-mono tabular-nums text-gray-900">{fmt(data.this_month.booking_value)}</div>
              <div className="text-xs text-gray-500">Value (THB)</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Pipeline */}
          <div className="rounded-xl bg-white border border-gray-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Pipeline</div>
            <div className="space-y-2">
              {sortedStatus.map((s) => {
                const pct = totalByStatus > 0 ? (s.count / totalByStatus) * 100 : 0;
                const cfg = STATUS_CONFIG[s.status];
                return (
                  <div key={s.status}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium text-gray-700">{cfg?.label || s.status}</span>
                      <span className="text-xs font-bold font-mono tabular-nums text-gray-900">{s.count}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${cfg?.color || "bg-gray-400"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Projects */}
          <div className="rounded-xl bg-white border border-gray-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Top Projects</div>
            {data.top_projects.length > 0 ? (
              <div className="space-y-2">
                {data.top_projects.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.lead_count} leads · {p.won} won</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-400 text-center py-4">ยังไม่มีข้อมูล</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Recent Leads */}
          <div className="rounded-xl bg-white border border-gray-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Recent Leads</div>
            <div className="space-y-1.5">
              {data.recent_leads.map((l) => {
                const cfg = STATUS_CONFIG[l.status];
                return (
                  <Link key={l.id} href={`/leads/${l.id}`} className="flex items-center gap-2.5 py-1.5 hover:bg-gray-50 rounded-lg px-1 -mx-1 transition-colors">
                    <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-gray-600 font-bold text-xs">{l.full_name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-900 truncate">{l.full_name}</div>
                      <div className="text-xs text-gray-400">{l.project_name || "—"} · {fmtDate(l.created_at)}</div>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white shrink-0 ${cfg?.color || "bg-gray-400"}`}>
                      {cfg?.label || l.status}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="rounded-xl bg-white border border-gray-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Recent Activity</div>
            <div className="space-y-2">
              {data.recent_activities.map((a, i) => (
                <div key={i} className="flex gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-800 truncate">{a.title}</div>
                    <div className="text-xs text-gray-400">{a.full_name} · {a.by_name ? `by ${a.by_name}` : ""} · {fmtDate(a.created_at)} {fmtTime(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
