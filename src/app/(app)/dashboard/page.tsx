"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/layout/Header";
import { STATUS_CONFIG } from "@/lib/constants/statuses";
import { formatTHB as fmt, formatThaiDateShort as fmtDate, formatThaiTime as fmtTime } from "@/lib/utils/formatters";

interface DashboardData {
  total_leads: number;
  total_deposits: number;
  total_deposit_value: number;
  total_won: number;
  conversion_rate: number;
  this_month: { new_leads: number; closed_count: number; closed_value: number };
  last_month: { new_leads: number; closed_count: number };
  status_breakdown: { status: string; count: number }[];
  recent_leads: { id: number; full_name: string; status: string; project_name: string; created_at: string }[];
  top_projects: { name: string; lead_count: number; won: number }[];
  recent_activities: { title: string; activity_type: string; created_at: string; full_name: string; by_name: string }[];
  activity_heatmap: { day: string; lead_id: number; full_name: string; lead_status: string; activity_type?: string; total_activities: number; has_paid: boolean }[];
}

function Trend({ current, previous, suffix = "" }: { current: number; previous: number; suffix?: string }) {
  if (!previous || !Number.isFinite(previous) || !Number.isFinite(current)) return null;
  const diff = current - previous;
  const pct = Math.round((diff / previous) * 100);
  if (pct === 0 || !Number.isFinite(pct)) return null;
  return (
    <span className={`text-xs font-semibold ${pct > 0 ? "text-emerald-600" : "text-red-500"}`}>
      {pct > 0 ? "↑" : "↓"} {Math.abs(pct)}%{suffix}
    </span>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [lineUsers, setLineUsers] = useState<{ created_at: string; phone: string | null; house_number: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/dashboard").then(setData).catch(console.error).finally(() => setLoading(false));
    apiFetch("/api/line-users").then(setLineUsers).catch(console.error);
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full py-20"><div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" /></div>;
  if (!data) return <div className="text-center py-12 text-gray-400 text-sm">Unable to load data</div>;

  const countsByStatus = Object.fromEntries(data.status_breakdown.map(s => [s.status, s.count]));
  // Order follows the actual status flow in code: install → warranty → gridtie → closed.
  // See InstallStep.tsx (→warranty), WarrantyStep.tsx (→gridtie), GridTieStep.tsx (→closed).
  const pipelineSteps: { status: string; label: string; color: string; count: number }[] = [
    { status: "pre_survey", label: "รอติดตาม",         color: "bg-sky-500",     count: countsByStatus["pre_survey"] || 0 },
    { status: "survey",     label: "สำรวจหน้างาน",       color: "bg-violet-500",  count: countsByStatus["survey"] || 0 },
    { status: "quote",      label: "รอใบเสนอราคา",       color: "bg-orange-500",  count: countsByStatus["quote"] || 0 },
    { status: "order",      label: "รออนุมัติ/ชำระ",     color: "bg-green-500",   count: countsByStatus["order"] || 0 },
    { status: "install",    label: "กำลังติดตั้ง",       color: "bg-emerald-500", count: countsByStatus["install"] || 0 },
    { status: "closed",     label: "ส่งมอบแล้ว",   color: "bg-teal-500",    count: countsByStatus["closed"] || 0 },
    { status: "warranty",   label: "ออกใบรับประกัน",     color: "bg-cyan-500",    count: countsByStatus["warranty"] || 0 },
    { status: "gridtie",    label: "ขอขนานไฟ",           color: "bg-amber-500",   count: countsByStatus["gridtie"] || 0 },
    { status: "lost",       label: "ยกเลิก",             color: "bg-red-400",     count: countsByStatus["lost"] || 0 },
    { status: "returned",   label: "ส่งกลับ Seeker",     color: "bg-amber-500",   count: countsByStatus["returned"] || 0 },
  ];
  const totalByStatus = data.status_breakdown.reduce((sum, s) => sum + s.count, 0);

  return (
    <div>
      <Header title="Dashboard" subtitle="SENA SOLAR ENERGY" />

      <div className="p-3 md:p-6 space-y-3">
        {/* KPI Cards — 5 tiles with icons */}
        {(() => {
          const followCount = countsByStatus["pre_survey"] || 0;
          const inProgress = (countsByStatus["survey"] || 0) + (countsByStatus["quote"] || 0) + (countsByStatus["order"] || 0) + (countsByStatus["install"] || 0);
          // "Installed" = install step done (status moves on to warranty → gridtie → closed).
          const installedCount = (countsByStatus["warranty"] || 0) + (countsByStatus["gridtie"] || 0) + (countsByStatus["closed"] || 0);
          const closedValue = Number(data.this_month.closed_value || 0);
          const fmtMoney = (v: number) => v >= 1000000 ? `฿${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `฿${Math.round(v / 1000)}K` : `฿${fmt(v)}`;

          const kpis = [
            {
              label: "Leads ทั้งหมด",
              value: String(data.total_leads),
              sub: `+${data.this_month.new_leads || 0} เดือนนี้`,
              trend: { current: data.this_month.new_leads || 0, previous: data.last_month.new_leads || 0 },
              iconBg: "bg-sky-50", iconColor: "text-sky-600",
              icon: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
            },
            {
              label: "รอติดตาม",
              value: String(followCount),
              sub: "Leads ยังไม่ได้นัด",
              iconBg: "bg-rose-50", iconColor: "text-rose-600",
              icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
            },
            {
              label: "กำลังดำเนินการ",
              value: String(inProgress),
              sub: `สำรวจ ${countsByStatus["survey"] || 0} · เสนอราคา ${countsByStatus["quote"] || 0} · อนุมัติ ${countsByStatus["order"] || 0} · ติดตั้ง ${countsByStatus["install"] || 0}`,
              iconBg: "bg-amber-50", iconColor: "text-amber-600",
              icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z",
            },
            {
              label: "ติดตั้งเสร็จ",
              value: String(installedCount),
              sub: `+${data.this_month.closed_count || 0} เดือนนี้`,
              trend: { current: data.this_month.closed_count || 0, previous: data.last_month.closed_count || 0 },
              iconBg: "bg-emerald-50", iconColor: "text-emerald-600",
              icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
            },
            {
              label: "มูลค่างานเดือนนี้",
              value: fmtMoney(closedValue),
              sub: "Revenue (บาท)",
              iconBg: "bg-teal-50", iconColor: "text-teal-600",
              icon: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 12a3 3 0 11-6 0 3 3 0 016 0z",
            },
          ];

          return (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {kpis.map(k => (
                <div key={k.label} className="rounded-2xl bg-white border border-gray-200 p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl ${k.iconBg} ${k.iconColor} flex items-center justify-center`}>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={k.icon} />
                      </svg>
                    </div>
                    {k.trend && <Trend current={k.trend.current} previous={k.trend.previous} />}
                  </div>
                  <div className="text-[11px] font-semibold tracking-wider uppercase text-gray-400">{k.label}</div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-gray-900 mt-0.5">{k.value}</div>
                  <div className="text-[11px] text-gray-400 mt-1">{k.sub}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Activity Heatmap */}
        <div className="rounded-xl bg-white border border-gray-300 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">การติดตามลูกค้า <span className="normal-case text-gray-300">(30 วันล่าสุด)</span></div>
          <ActivityChart data={data.activity_heatmap} />
        </div>

        {/* LINE OA growth */}
        <div className="rounded-xl bg-white border border-gray-300 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Add LINE OA รายวัน <span className="normal-case text-gray-300">(30 วันล่าสุด)</span></div>
          <LineGrowthChart users={lineUsers} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Pipeline */}
          <div className="rounded-xl bg-white border border-gray-300 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Pipeline</div>
            <div className="space-y-2">
              {pipelineSteps.map((s) => {
                const pct = totalByStatus > 0 ? (s.count / totalByStatus) * 100 : 0;
                return (
                  <div key={s.status}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium text-gray-700">{s.label}</span>
                      <span className="text-xs font-bold font-mono tabular-nums text-gray-900">{s.count} <span className="text-gray-400 font-normal">({pct.toFixed(1)}%)</span></span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${s.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Projects */}
          <div className="rounded-xl bg-white border border-gray-300 p-4">
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
          <div className="rounded-xl bg-white border border-gray-300 p-4">
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
          <div className="rounded-xl bg-white border border-gray-300 p-4">
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

function ActivityChart({ data }: { data: { day: string; lead_id: number; full_name: string; lead_status: string; activity_type?: string; total_activities: number; has_paid: boolean }[] }) {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => { setIsMobile(window.innerWidth < 768); }, []);

  // Rolling window: 30 days history + 3-day future buffer (matches seeker dashboard).
  // Mobile keeps the tighter 7+1 view because there's no horizontal room.
  const today = new Date();
  const HISTORY = 30;
  const FUTURE_PAD = 3;
  const allDayKeys: string[] = [];
  for (let i = HISTORY - 1; i >= -FUTURE_PAD; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    allDayKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }

  const dayKeys = isMobile
    ? (() => {
        const keys: string[] = [];
        for (let i = 6; i >= -1; i--) {
          const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
          keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        }
        return keys;
      })()
    : allDayKeys;

  type Block = { lead_id: number; name: string; total: number; paid: boolean; status: string; actType: string };
  const byDay: Record<string, Block[]> = {};
  dayKeys.forEach(k => { byDay[k] = []; });

  const seen: Record<string, Set<number>> = {};
  dayKeys.forEach(k => { seen[k] = new Set(); });

  data.forEach(row => {
    const dk = String(row.day).slice(0, 10);
    if (!byDay[dk] || seen[dk].has(row.lead_id)) return;
    seen[dk].add(row.lead_id);
    byDay[dk].push({ lead_id: row.lead_id, name: row.full_name, total: row.total_activities, paid: !!row.has_paid, status: row.lead_status, actType: row.activity_type || "" });
  });

  const maxLeads = Math.max(...dayKeys.map(k => byDay[k].length), 1);
  const maxTotal = Math.max(...data.map(d => d.total_activities), 1);

  const primaryColors = ["bg-primary/20", "bg-primary/40", "bg-primary/60", "bg-primary/80", "bg-primary"];
  const blueColors = ["bg-sky-200", "bg-sky-300", "bg-sky-400", "bg-sky-500", "bg-sky-600"];

  const getColor = (total: number, actType: string) => {
    const colors = actType === "lead_created" ? blueColors : primaryColors;
    const ratio = total / maxTotal;
    if (ratio <= 0.2) return colors[0];
    if (ratio <= 0.4) return colors[1];
    if (ratio <= 0.6) return colors[2];
    if (ratio <= 0.8) return colors[3];
    return colors[4];
  };

  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const chartH = maxLeads * 20 + 20;
  const blockH = 0;

  const yTicks: number[] = [];
  for (let i = 0; i <= maxLeads; i++) {
    if (maxLeads <= 5 || i % Math.ceil(maxLeads / 4) === 0 || i === maxLeads) {
      yTicks.push(i);
    }
  }
  if (!yTicks.includes(maxLeads)) yTicks.push(maxLeads);

  return (
    <div>
      <div className="flex">
        {/* Y axis */}
        <div className="flex flex-col-reverse justify-between pr-2" style={{ height: chartH }}>
          {yTicks.map(t => (
            <div key={t} className="text-[10px] text-gray-400 text-right leading-none" style={{ marginBottom: t === 0 ? 0 : undefined }}>
              {t}
            </div>
          ))}
        </div>
        {/* Bars */}
        <div className="flex-1 flex items-end gap-[3px] border-l border-b border-gray-200" style={{ height: chartH }}>
          {dayKeys.map(dk => {
            const blocks = byDay[dk];
            return (
              <div key={dk} className="flex-1 flex flex-col-reverse gap-[2px] items-stretch" style={{ height: "100%" }}>
                {blocks.map((b, i) => (
                  <div
                    key={i}
                    className={`rounded-sm ${getColor(b.total, b.actType)} hover:ring-1 hover:ring-primary cursor-pointer`}
                    style={{ height: 18 }}
                    onMouseEnter={e => {
                      const r = e.currentTarget.getBoundingClientRect();
                      const isFollow = ["follow_up","call","visit","note"].includes(b.actType);
                      const statusLabel: Record<string,string> = { pre_survey: "รอติดตาม", survey: "สำรวจหน้างาน", quote: "รอใบเสนอราคา", order: "รออนุมัติ/ชำระ", install: "กำลังติดตั้ง", closed: "ส่งมอบแล้ว", lost: "ยกเลิก", returned: "ส่งกลับ Seeker" };
                      const label = isFollow ? "ติดตาม" : (statusLabel[b.status] || b.status);
                      setTooltip({ x: r.left + r.width / 2, y: r.top - 4, text: `${b.name} · ${label} · ${b.total} ครั้ง` });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => router.push(`/leads/${b.lead_id}`)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {/* X axis: dates */}
      <div className="flex gap-[3px] mt-1 ml-6">
        {dayKeys.map(dk => (
          <div key={dk} className="flex-1 text-center text-[10px] text-gray-400 truncate">
            {parseInt(dk.slice(8))}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">1 block = 1 lead · สีเข้ม = ติดตามหลายครั้ง</span>
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <div className="flex items-center gap-1">
            <div className="w-[10px] h-[10px] rounded-sm bg-sky-400" />
            <span>Pre-Survey</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-[10px] h-[10px] rounded-sm bg-primary" />
            <span>ติดตาม</span>
          </div>
          <div className="flex items-center gap-0.5">
            <span>จาง</span>
            <div className="w-[8px] h-[8px] rounded-sm bg-primary/20" />
            <div className="w-[8px] h-[8px] rounded-sm bg-primary" />
            <span>เข้ม = หลายครั้ง</span>
          </div>
        </div>
      </div>
      {tooltip && (
        <div className="fixed z-50 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold shadow-lg pointer-events-none whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

function LineGrowthChart({ users }: { users: { created_at: string; phone: string | null; house_number: string | null }[] }) {
  // Rolling 30 days history + 3-day future buffer (matches seeker dashboard).
  const today = new Date();
  const HISTORY = 30;
  const FUTURE_PAD = 3;
  const dayKeys: string[] = [];
  for (let i = HISTORY - 1; i >= -FUTURE_PAD; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    dayKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  const indexByKey = new Map(dayKeys.map((k, i) => [k, i]));

  const byDay: { phone: string | null; house_number: string | null; ts: number }[][] = dayKeys.map(() => []);
  for (const u of users) {
    const d = new Date(String(u.created_at));
    if (isNaN(d.getTime())) continue;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const idx = indexByKey.get(k);
    if (idx === undefined) continue;
    byDay[idx].push({ phone: u.phone, house_number: u.house_number, ts: d.getTime() });
  }
  for (const blocks of byDay) blocks.sort((a, b) => a.ts - b.ts);

  const counts = byDay.map((b) => b.length);
  const maxCount = Math.max(...counts, 1);
  const chartH = maxCount * 20 + 20;

  const yTicks: number[] = [];
  const step = Math.max(1, Math.ceil(maxCount / 4));
  for (let i = 0; i <= maxCount; i += step) yTicks.push(i);
  if (!yTicks.includes(maxCount)) yTicks.push(maxCount);

  const totalMonth = counts.reduce((a, b) => a + b, 0);
  const totalWithContact = byDay.flat().filter((b) => !!b.phone || !!b.house_number).length;

  return (
    <div>
      <div className="flex">
        <div className="flex flex-col-reverse justify-between pr-2" style={{ height: chartH }}>
          {yTicks.map((t) => (
            <div key={t} className="text-[10px] text-gray-400 text-right leading-none">{t}</div>
          ))}
        </div>
        <div className="flex-1 flex items-end gap-[3px] border-l border-b border-gray-200" style={{ height: chartH }}>
          {byDay.map((blocks, i) => (
            <div key={i} className="flex-1 flex flex-col-reverse gap-[2px] items-stretch" style={{ height: "100%" }}>
              {blocks.map((b, j) => {
                const hasContact = !!b.phone || !!b.house_number;
                const tip = [b.phone && `เบอร์ ${b.phone}`, b.house_number && `บ้าน ${b.house_number}`].filter(Boolean).join(" · ") || "ยังไม่มีข้อมูล";
                const dayLabel = parseInt(dayKeys[i].slice(8));
                return (
                  <div
                    key={j}
                    className={`rounded-sm ${hasContact ? "bg-blue-600" : "bg-emerald-500"}`}
                    style={{ height: 18 }}
                    title={`${dayLabel} · ${tip}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-[3px] mt-1 ml-6">
        {dayKeys.map((dk, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-gray-400 truncate">{parseInt(dk.slice(8))}</div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">รวม 30 วัน {totalMonth} คน · ให้ข้อมูล {totalWithContact} คน · 1 block = 1 user</span>
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <div className="flex items-center gap-1">
            <div className="w-[10px] h-[10px] rounded-sm bg-blue-600" />
            <span>มีเบอร์/บ้านเลขที่</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-[10px] h-[10px] rounded-sm bg-emerald-500" />
            <span>ยังไม่ให้ข้อมูล</span>
          </div>
        </div>
      </div>
    </div>
  );
}
