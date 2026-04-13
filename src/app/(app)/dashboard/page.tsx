"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { STATUS_CONFIG } from "@/lib/statuses";

interface DashboardData {
  total_leads: number;
  total_bookings: number;
  total_booking_value: number;
  status_breakdown: { status: string; count: number }[];
  recent_leads: { id: number; full_name: string; status: string; project_name: string; created_at: string }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/dashboard").then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }
  if (!data) return <div className="text-center py-12 text-gray-400 text-sm">Unable to load data</div>;

  const totalByStatus = data.status_breakdown.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="max-w-5xl mx-auto">
      <Header title="Dashboard" subtitle="SENA SOLAR ENERGY" />

      <div className="p-3 md:p-6 space-y-2 md:space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
          <div className="rounded-lg bg-white border border-gray-200 p-3">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">Total Leads</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-gray-900 mt-1">{data.total_leads}</div>
          </div>
          <div className="rounded-lg bg-white border border-gray-200 p-3">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">Bookings</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-gray-900 mt-1">{data.total_bookings}</div>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-primary to-primary-dark text-white border border-primary shadow-sm shadow-primary/20 p-3 col-span-2 md:col-span-1">
            <div className="text-xs font-semibold tracking-wider uppercase text-white/70">Total Value</div>
            <div className="text-2xl font-bold font-mono tabular-nums mt-1">
              {formatPrice(data.total_booking_value)}
              <span className="text-xs font-semibold text-white/70 ml-1">THB</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
          {/* Status Breakdown */}
          {data.status_breakdown.length > 0 && (
            <div className="rounded-lg bg-white border border-gray-200 p-4">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400 mb-3">Lead Status</div>
              <div className="space-y-2.5">
                {data.status_breakdown.map((s) => {
                  const pct = totalByStatus > 0 ? (s.count / totalByStatus) * 100 : 0;
                  const cfg = STATUS_CONFIG[s.status];
                  return (
                    <div key={s.status}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700">{cfg?.label || s.status}</span>
                        <span className="text-xs font-bold font-mono tabular-nums text-gray-900">{s.count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${cfg?.color || "bg-gray-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Leads */}
          {data.recent_leads.length > 0 && (
            <div className="rounded-lg bg-white border border-gray-200 p-4">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400 mb-3">Recent Leads</div>
              <div className="space-y-2">
                {data.recent_leads.map((l) => {
                  const cfg = STATUS_CONFIG[l.status];
                  return (
                    <div key={l.id} className="flex items-center gap-2.5 py-1">
                      <div className="w-7 h-7 bg-gray-100 rounded-md flex items-center justify-center shrink-0">
                        <span className="text-gray-600 font-bold text-xs">{l.full_name.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-900 truncate">{l.full_name}</div>
                        {l.project_name && <div className="text-xs text-gray-500 truncate">{l.project_name}</div>}
                      </div>
                      <span className={`text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded text-white shrink-0 ${cfg?.color || "bg-gray-400"}`}>
                        {cfg?.label || l.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
