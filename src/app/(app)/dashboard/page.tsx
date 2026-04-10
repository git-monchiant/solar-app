"use client";

import { apiFetch } from "@/lib/api";

import { useEffect, useState } from "react";
import Image from "next/image";
import Header from "@/components/Header";

interface DashboardData {
  total_leads: number; total_bookings: number; total_booking_value: number;
  status_breakdown: { status: string; count: number }[];
  recent_leads: { id: number; full_name: string; status: string; project_name: string; created_at: string }[];
}

const statusLabels: Record<string, string> = {
  "ลีดใหม่": "New Lead", "นัดสำรวจ": "Survey", "เสนอราคา": "Quotation",
  "ตัดสินใจซื้อ": "Decided", "ชำระเงิน": "Paid", "ติดตั้ง": "Installing",
};
const statusColors: Record<string, string> = {
  "ลีดใหม่": "bg-blue-500", "นัดสำรวจ": "bg-amber-500", "เสนอราคา": "bg-orange-500",
  "ตัดสินใจซื้อ": "bg-green-500", "ชำระเงิน": "bg-emerald-500", "ติดตั้ง": "bg-teal-500",
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/dashboard").then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);

  if (loading) return <div className="flex items-center justify-center h-full py-20"><div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  if (!data) return <div className="text-center py-12 text-gray">Unable to load data</div>;

  const totalByStatus = data.status_breakdown.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="max-w-5xl mx-auto">
      <Header title="Dashboard" subtitle="SENA SOLAR ENERGY" />

      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          <div className="relative bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-gray-100 overflow-hidden">
            <div className="absolute right-2 top-2 opacity-[0.05]"><Image src="/logo-sena.png" alt="" width={50} height={50} /></div>
            <div className="text-sm text-gray font-medium">Total Leads</div>
            <div className="text-3xl font-bold text-primary mt-1">{data.total_leads}</div>
          </div>
          <div className="relative bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-gray-100 overflow-hidden">
            <div className="absolute right-2 top-2 opacity-[0.05]"><Image src="/logo-sena.png" alt="" width={50} height={50} /></div>
            <div className="text-sm text-gray font-medium">Bookings</div>
            <div className="text-3xl font-bold text-secondary mt-1">{data.total_bookings}</div>
          </div>
          <div className="relative col-span-2 md:col-span-1 bg-gradient-to-br from-primary to-primary-dark rounded-2xl p-4 md:p-5 text-white shadow-lg shadow-primary/20 overflow-hidden">
            <div className="absolute right-3 top-3 opacity-10"><Image src="/logo-sena-white.png" alt="" width={60} height={60} /></div>
            <div className="relative">
              <div className="text-sm text-white/70 font-medium">Total Value</div>
              <div className="text-3xl font-bold mt-1">{formatPrice(data.total_booking_value)} <span className="text-lg font-normal text-white/70">THB</span></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Status Breakdown */}
          {data.status_breakdown.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h2 className="font-bold mb-4">Lead Status</h2>
              <div className="space-y-3">
                {data.status_breakdown.map((s) => {
                  const pct = totalByStatus > 0 ? (s.count / totalByStatus) * 100 : 0;
                  return (
                    <div key={s.status}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm">{statusLabels[s.status] || s.status}</span>
                        <span className="font-bold text-sm">{s.count}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${statusColors[s.status] || "bg-gray-400"} transition-all duration-500`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Leads */}
          {data.recent_leads.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h2 className="font-bold mb-4">Recent Leads</h2>
              <div className="space-y-3">
                {data.recent_leads.map((l) => (
                  <div key={l.id} className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-primary font-bold text-sm">{l.full_name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{l.full_name}</div>
                      {l.project_name && <div className="text-xs text-gray truncate">{l.project_name}</div>}
                    </div>
                    <span className="text-xs font-medium text-gray">{statusLabels[l.status] || l.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
