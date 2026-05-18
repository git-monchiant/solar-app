"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { useMe } from "@/lib/roles";

interface FunnelData {
  total: number;
  new_leads: number;
  sales_undecided: number;
  booking_unpaid: number;
  booking_paid: number;
  success_total: number;
  deposit_paid: number;
  install_scheduled: number;
  installed: number;
  lost_contact: number;
  survey_pending: number;
  survey_scheduled: number;
  quote_pending: number;
  quote_sent: number;
}

export default function DashboardDev2Page() {
  const { me } = useMe();
  const isAdmin = (me?.roles || []).includes("admin");
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    apiFetch("/api/dashboard-dev-2")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Admin only</div>
    );
  }
  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  // Tile color tokens by lane.
  const blue = "bg-sky-50 border-sky-200 text-sky-800";
  const yellow = "bg-amber-50 border-amber-200 text-amber-800";
  const green = "bg-emerald-50 border-emerald-200 text-emerald-800";
  const greenDark = "bg-emerald-500 border-emerald-600 text-white";
  const orange = "bg-orange-50 border-orange-200 text-orange-800";

  const Tile = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
    <div className={`rounded-xl border p-3 flex flex-col items-center justify-center min-h-[88px] ${tone}`}>
      <div className="text-xs font-semibold text-center leading-tight">{label}</div>
      <div className="text-3xl font-bold font-mono tabular-nums mt-2">{value}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Dashboard Dev 2" subtitle="KPI Funnel — admin only" />
      <div className="max-w-7xl mx-auto p-4 space-y-6">

        {/* Row 1 — Total + early/mid funnel + Success header */}
        <div className="grid grid-cols-1 md:grid-cols-8 gap-3">
          <Tile label="Total" value={data.total} tone="bg-gray-900 border-gray-800 text-white" />
          <Tile label="Lead ใหม่" value={data.new_leads} tone={blue} />
          <Tile label="Sales เสนอขายอยู่ ระหว่างตัดสินใจ" value={data.sales_undecided} tone={blue} />
          <Tile label="จอง 1,000 (รอชำระ)" value={data.booking_unpaid} tone={yellow} />
          <Tile label="จอง 1,000 (ชำระแล้ว)" value={data.booking_paid} tone={yellow} />
          {/* Success Leads group — header + 3 inner tiles */}
          <div className="md:col-span-3 rounded-xl border border-emerald-300 bg-emerald-50/40 p-3">
            <div className="text-xs font-bold text-emerald-800 text-center mb-2">
              Success Leads ({data.success_total} Leads)
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Tile label="ชำระ 20%" value={data.deposit_paid} tone={green} />
              <Tile label="นัดวันเข้าติดตั้งแล้ว" value={data.install_scheduled} tone={green} />
              <Tile label="ติดตั้งเรียบร้อยแล้ว" value={data.installed} tone={greenDark} />
            </div>
          </div>
        </div>

        {/* Row 2 — Lost + Survey/Quote breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Tile label="ติดต่อลูกค้าไม่ได้ / ข้อมูลไม่ถูกต้อง" value={data.lost_contact} tone={orange} />
          <Tile label="รอนัดวันเข้าสำรวจ" value={data.survey_pending} tone={orange} />
          <Tile label="นัดวันเข้าสำรวจเรียบร้อยแล้ว" value={data.survey_scheduled} tone={orange} />
          <Tile label="เข้าสำรวจแล้ว รอใบเสนอราคา" value={data.quote_pending} tone={orange} />
          <Tile label="ลูกค้าได้รับใบเสนอราคาแล้ว" value={data.quote_sent} tone={orange} />
        </div>
      </div>
    </div>
  );
}
