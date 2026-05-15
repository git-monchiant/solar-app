"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { useMe } from "@/lib/roles";
import { PRIMARY_REASON_LABEL } from "@/lib/constants/info-labels";
import { getSourceStyle, normalizeSourceKey } from "@/lib/source-tag";

interface DevData {
  funnel: {
    total: number;
    has_pre_doc: number;
    has_survey: number;
    has_order: number;
    has_install: number;
    installed: number;
    warranty_issued: number;
  };
  total_lost: number;
  daily: { day: string; cnt: number; with_line: number; without_line: number }[];
  sources: { source: string; cnt: number }[];
  lost_reasons: { reason: string; cnt: number }[];
  contact_status: { bucket: string; cnt: number }[];
  contact_outcomes: { stage: string; cnt: number }[];
  contact_recency: { bucket: string; cnt: number }[];
  finance_breakdown: { bucket: string; cnt: number }[];
  interest_reasons: { code: string; cnt: number }[];
  interested_count: number;
  undecided_reasons: { reason: string; cnt: number }[];
}

export default function DashboardDevPage() {
  const { me } = useMe();
  const isAdmin = (me?.roles || []).includes("admin");
  const [data, setData] = useState<DevData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    apiFetch("/api/dashboard-dev").then(setData).catch(console.error).finally(() => setLoading(false));
  }, [isAdmin]);

  if (!me) return null;
  if (!isAdmin) {
    return (
      <div>
        <Header title="Dashboard Dev" subtitle="EXPERIMENTAL" />
        <div className="p-4 md:p-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500 text-center">ต้องเป็น admin เท่านั้น</div>
        </div>
      </div>
    );
  }
  if (loading) return <div className="flex items-center justify-center h-full py-20"><div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" /></div>;
  if (!data) return <div className="text-center py-12 text-gray-400 text-sm">Unable to load data</div>;

  const today = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div>
      <Header title="Dashboard Dev" subtitle="EXPERIMENTAL — admin only" />
      <div className="p-3 md:p-6 space-y-3">

        {/* Horizontal funnel — wide hero visualisation showing the lead
            pipeline left → right. Each stage tapers to the next based on
            its value relative to the largest stage. */}
        <HorizontalFunnel funnel={data.funnel} />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="rounded-xl bg-white border border-gray-300 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Source <span className="normal-case text-gray-300">(top 10)</span></div>
            <BarList items={(() => {
              // Collapse raw legacy strings ("Lead Seeker - Sen X PM", "LINE OA - SENA Solar"…)
              // into canonical buckets via normalizeSourceKey so labels match the chip + channel picker.
              const buckets = new Map<string, { label: string; value: number }>();
              for (const s of data.sources) {
                const key = normalizeSourceKey(s.source);
                const label = getSourceStyle(s.source).label;
                const cur = buckets.get(key);
                if (cur) cur.value += s.cnt;
                else buckets.set(key, { label, value: s.cnt });
              }
              return Array.from(buckets.values()).sort((a, b) => b.value - a.value).slice(0, 10);
            })()} color="bg-sky-500" />
            <div className="text-xxs text-gray-400 text-left mt-2">ณ วันที่ {today}</div>
          </div>
          <FunnelCard funnel={data.funnel} />
          <div className="rounded-xl bg-white border border-gray-300 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">เหตุผลที่สนใจ <span className="normal-case text-gray-300">(prospects)</span></div>
            {data.interest_reasons.length > 0 ? (
              <BarList
                items={[
                  { label: "Total prospect (สนใจ)", value: data.interested_count },
                  ...data.interest_reasons.map(r => ({ label: PRIMARY_REASON_LABEL[r.code] || r.code, value: r.cnt })),
                ]}
                color="bg-emerald-500"
              />
            ) : (
              <div className="text-xs text-gray-400 text-center py-4">ยังไม่มีข้อมูล</div>
            )}
            <div className="text-xxs text-gray-400 text-left mt-2">ณ วันที่ {today}</div>
          </div>
          <div className="rounded-xl bg-white border border-gray-300 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">เหตุผลที่ยังไม่จอง</div>
            {data.undecided_reasons.length > 0 ? (
              <BarList
                items={[
                  { label: "Total ยังไม่จอง", value: data.undecided_reasons.reduce((a, b) => a + b.cnt, 0) },
                  ...data.undecided_reasons.map(r => ({ label: r.reason, value: r.cnt })),
                ]}
                color="bg-amber-400"
              />
            ) : (
              <div className="text-xs text-gray-400 text-center py-4">ยังไม่มีข้อมูล</div>
            )}
            <div className="text-xxs text-gray-400 text-left mt-2">ณ วันที่ {today}</div>
          </div>
          <div className="rounded-xl bg-white border border-gray-300 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">เหตุผลที่ Lost</div>
            {data.lost_reasons.length > 0 || data.total_lost > 0 ? (
              <BarList
                items={[
                  { label: "Total Lost", value: data.total_lost },
                  ...data.lost_reasons.map(r => ({ label: r.reason, value: r.cnt })),
                ]}
                color="bg-red-400"
              />
            ) : (
              <div className="text-xs text-gray-400 text-center py-4">ยังไม่มีข้อมูล</div>
            )}
            <div className="text-xxs text-gray-400 text-left mt-2">ณ วันที่ {today}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ContactStatusCard status={data.contact_status} />
          <ContactOutcomesCard outcomes={data.contact_outcomes} />
          <ContactRecencyCard recency={data.contact_recency} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FinanceCard breakdown={data.finance_breakdown} />
          <div className="md:col-span-2 rounded-xl bg-white border border-gray-300 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Lead ใหม่รายวัน <span className="normal-case text-gray-300">(30 วันล่าสุด)</span></div>
            <DailyChart daily={data.daily} />
            <div className="text-xxs text-gray-400 text-left mt-2">ณ วันที่ {today}</div>
          </div>
        </div>

      </div>
    </div>
  );
}

function FunnelCard({ funnel }: { funnel: DevData["funnel"] }) {
  const today = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
  const stages = [
    { label: "Total leads",      value: funnel.total,           color: "bg-gray-400" },
    { label: "จองค่าสำรวจ",      value: funnel.has_pre_doc,     color: "bg-sky-500" },
    { label: "นัดสำรวจ",         value: funnel.has_survey,      color: "bg-violet-500" },
    { label: "ออเดอร์",          value: funnel.has_order,       color: "bg-orange-500" },
    { label: "นัดติดตั้ง",       value: funnel.has_install,     color: "bg-emerald-500" },
    { label: "ติดตั้งเสร็จ",     value: funnel.installed,       color: "bg-teal-500" },
  ];
  const max = Math.max(...stages.map(s => s.value), 1);
  return (
    <div className="rounded-xl bg-white border border-gray-300 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Funnel — Lead conversion</div>
      <div className="space-y-2">
        {stages.map((s, i) => {
          const pct = (s.value / max) * 100;
          const prev = i > 0 ? stages[i - 1].value : null;
          const dropPct = prev && prev > 0 ? Math.round((s.value / prev) * 100) : null;
          return (
            <div key={s.label}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-medium text-gray-700">
                  {s.label}
                  {dropPct !== null && <span className="ml-2 text-gray-400 font-normal">({dropPct}% from prev)</span>}
                </span>
                <span className="text-xs font-bold font-mono tabular-nums text-gray-900">{s.value}</span>
              </div>
              <div className="h-2 bg-gray-100 overflow-hidden">
                <div className={`h-full transition-all duration-500 ${s.color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-xxs text-gray-400 text-left mt-2">ณ วันที่ {today}</div>
    </div>
  );
}

function DailyChart({ daily }: { daily: { day: string; cnt: number; with_line: number; without_line: number }[] }) {
  // Build a 30-day window ending today; missing days = 0.
  const today = new Date();
  const days: { key: string; cnt: number; with_line: number; without_line: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.push({ key, cnt: 0, with_line: 0, without_line: 0 });
  }
  const map = new Map(daily.map(r => [r.day, r]));
  for (const d of days) {
    const r = map.get(d.key);
    if (r) { d.cnt = r.cnt; d.with_line = r.with_line; d.without_line = r.without_line; }
  }

  const max = Math.max(...days.map(d => d.cnt), 1);
  const chartH = 140;
  const yTicks: number[] = [];
  const step = Math.max(1, Math.ceil(max / 4));
  for (let i = 0; i <= max; i += step) yTicks.push(i);
  if (!yTicks.includes(max)) yTicks.push(max);

  const total = days.reduce((a, b) => a + b.cnt, 0);
  const totalWithLine = days.reduce((a, b) => a + b.with_line, 0);

  return (
    <div>
      <div className="flex">
        <div className="flex flex-col-reverse justify-between pr-2" style={{ height: chartH }}>
          {yTicks.map(t => <div key={t} className="text-xxs text-gray-400 text-right leading-none">{t}</div>)}
        </div>
        <div className="flex-1 flex items-end gap-[3px] border-l border-b border-gray-200" style={{ height: chartH }}>
          {days.map((d, i) => {
            const h = (d.cnt / max) * (chartH - 4);
            const lineH = d.cnt > 0 ? (d.with_line / d.cnt) * h : 0;
            const noneH = d.cnt > 0 ? (d.without_line / d.cnt) * h : 0;
            return (
              <div key={i} className="flex-1 flex flex-col justify-end items-center" style={{ height: "100%" }}>
                {d.cnt > 0 && (
                  <div className="text-xxs font-bold font-mono tabular-nums text-gray-600 leading-none mb-0.5">{d.cnt}</div>
                )}
                <div className="w-full flex flex-col-reverse" style={{ height: Math.max(h, d.cnt > 0 ? 2 : 0) }}>
                  {d.with_line > 0 && (
                    <div className="w-full bg-emerald-500" style={{ height: lineH }}
                      title={`${d.key} · มี LINE ${d.with_line} / ${d.cnt}`} />
                  )}
                  {d.without_line > 0 && (
                    <div className="w-full bg-gray-400" style={{ height: noneH }}
                      title={`${d.key} · ไม่ได้ Add LINE ${d.without_line} / ${d.cnt}`} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-[3px] mt-1 ml-6">
        {days.map((d, i) => (
          <div key={i} className="flex-1 text-center text-xxs text-gray-400 truncate">{parseInt(d.key.slice(8))}</div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="text-xs text-gray-400">รวม 30 วัน {total} leads · max {max}/วัน</div>
        <div className="flex items-center gap-3 text-xxs text-gray-400">
          <div className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-500" />Add LINE ({totalWithLine})</div>
          <div className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 bg-gray-400" />ไม่ได้ Add ({total - totalWithLine})</div>
        </div>
      </div>
    </div>
  );
}

// Contact recency — donut: bucketed by days since last activity.
const RECENCY_LABEL: Record<string, string> = {
  "1_today": "0-1 วัน",
  "2_week": "2-7 วัน",
  "3_month": "8-30 วัน",
  "4_over_month": "31+ วัน",
  "5_never": "ยังไม่เคยติดต่อ",
};
const RECENCY_COLOR: Record<string, string> = {
  "1_today": "#10b981",
  "2_week": "#0ea5e9",
  "3_month": "#fbbf24",
  "4_over_month": "#f87171",
  "5_never": "#9ca3af",
};
function ContactRecencyCard({ recency }: { recency: { bucket: string; cnt: number }[] }) {
  const order = ["1_today","2_week","3_month","4_over_month","5_never"];
  const map = new Map(recency.map(r => [r.bucket, r.cnt]));
  const slices = order.map(k => ({ label: RECENCY_LABEL[k], value: map.get(k) ?? 0, color: RECENCY_COLOR[k] }));
  const today = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="rounded-xl bg-white border border-gray-300 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Aging <span className="normal-case text-gray-300">(นับจากติดต่อล่าสุด)</span></div>
      <Donut slices={slices} centerLabel="Active" />
      <div className="text-xxs text-gray-400 text-left mt-2">ณ วันที่ {today}</div>
    </div>
  );
}

// Contact status — donut: ติดต่อได้ / ยังไม่ติดต่อ / ติดต่อไม่ได้
function ContactStatusCard({ status }: { status: { bucket: string; cnt: number }[] }) {
  const map = new Map(status.map(s => [s.bucket, s.cnt]));
  const slices = [
    { label: "ติดต่อได้",     value: map.get("contacted")        ?? 0, color: "#10b981" },
    { label: "ยังไม่ติดต่อ",   value: map.get("never_contacted")  ?? 0, color: "#9ca3af" },
    { label: "ติดต่อไม่ได้",   value: map.get("no_contact")       ?? 0, color: "#f87171" },
  ];
  const today = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="rounded-xl bg-white border border-gray-300 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">การติดต่อ</div>
      <Donut slices={slices} centerLabel="ทั้งหมด" />
      <div className="text-xxs text-gray-400 text-left mt-2">ณ วันที่ {today}</div>
    </div>
  );
}

// Contact outcomes — donut: stage breakdown of "ติดต่อได้"
const OUTCOME_LABEL: Record<string, string> = {
  "1_contacted_only": "ติดต่อแล้ว ยังไม่นัด",
  "2_booked_or_survey_set": "จองค่าสำรวจ/นัดสำรวจ",
  "3_survey_quote": "สำรวจ/ใบเสนอราคา",
  "4_order": "ออเดอร์/ชำระ",
  "5_installed": "ติดตั้ง",
};
const OUTCOME_COLOR: Record<string, string> = {
  "1_contacted_only": "#fbbf24",
  "2_booked_or_survey_set": "#60a5fa",
  "3_survey_quote": "#a78bfa",
  "4_order": "#f97316",
  "5_installed": "#10b981",
};
function ContactOutcomesCard({ outcomes }: { outcomes: { stage: string; cnt: number }[] }) {
  const slices = outcomes.map(o => ({
    label: OUTCOME_LABEL[o.stage] ?? o.stage,
    value: o.cnt,
    color: OUTCOME_COLOR[o.stage] ?? "#9ca3af",
  }));
  const today = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="rounded-xl bg-white border border-gray-300 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">ติดต่อได้</div>
      {slices.length > 0
        ? <Donut slices={slices} centerLabel="ติดต่อได้" />
        : <div className="text-xs text-gray-400 text-center py-4">ยังไม่มีข้อมูล</div>}
      <div className="text-xxs text-gray-400 text-left mt-2">ณ วันที่ {today}</div>
    </div>
  );
}

// Finance breakdown — donut: cash/transfer + each bank as separate slice.
function FinanceCard({ breakdown }: { breakdown: { bucket: string; cnt: number }[] }) {
  // Color rule: cash/transfer = blue (one tone), each bank = different warm tone
  const palette = ["#f97316", "#a855f7", "#ec4899", "#facc15", "#14b8a6", "#84cc16", "#06b6d4"];
  let bankIdx = 0;
  const slices = breakdown.map(b => {
    const isCash = b.bucket === "เงินสด/โอน";
    const color = isCash ? "#3b82f6" : palette[bankIdx++ % palette.length];
    return { label: b.bucket, value: b.cnt, color };
  });
  const today = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="rounded-xl bg-white border border-gray-300 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">การชำระเงิน <span className="normal-case text-gray-300">(สินเชื่อแยกธนาคาร)</span></div>
      {slices.length > 0
        ? <Donut slices={slices} centerLabel="ทั้งหมด" />
        : <div className="text-xs text-gray-400 text-center py-4">ยังไม่มีข้อมูล</div>}
      <div className="text-xxs text-gray-400 text-left mt-2">ณ วันที่ {today}</div>
    </div>
  );
}

// Simple donut chart — SVG arcs + side legend.
function Donut({ slices, centerLabel }: { slices: { label: string; value: number; color: string }[]; centerLabel: string }) {
  const total = slices.reduce((a, b) => a + b.value, 0);
  const size = 140, cx = size / 2, cy = size / 2, r = 56, stroke = 22;
  // SVG donut by stroke-dasharray on circles offset by accumulated %
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
        {total > 0 && slices.map((s, i) => {
          if (s.value === 0) return null;
          const frac = s.value / total;
          const dash = frac * circ;
          const offset = -acc * circ;
          acc += frac;
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="text-xxs fill-gray-400" style={{ fontSize: 10 }}>{centerLabel}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="font-bold fill-gray-900" style={{ fontSize: 18, fontFamily: "monospace" }}>{total}</text>
      </svg>
      <div className="flex-1 min-w-0 space-y-1">
        {slices.map((s, i) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-gray-600 truncate flex-1">{s.label}</span>
              <span className="font-bold font-mono tabular-nums text-gray-900">{s.value}</span>
              <span className="text-gray-400 w-9 text-right">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BarList({ items, color }: { items: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => {
        const pct = (it.value / max) * 100;
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-medium text-gray-700 truncate">{it.label}</span>
              <span className="text-xs font-bold font-mono tabular-nums text-gray-900 ml-2">{it.value}</span>
            </div>
            <div className="h-1.5 bg-gray-100 overflow-hidden">
              <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Horizontal funnel — stages flow left → right. Each segment is rendered
 * as a tapered trapezoid via clip-path: the LEFT edge height matches the
 * previous segment's RIGHT edge height (so adjacent segments connect into
 * a continuous shape), and the RIGHT edge height = `value / max`. The
 * largest stage anchors the funnel at full height; smaller stages collapse
 * proportionally.
 */
function HorizontalFunnel({ funnel }: { funnel: DevData["funnel"] }) {
  // Funnel stops at "ติดตั้งเสร็จ" — warranty issuance is an admin task that
  // lags installation by days/weeks, so including it distorts the funnel
  // shape with a sparse trailing stage that isn't a sales signal.
  const stages: { label: string; value: number; color: string; hex: string }[] = [
    { label: "Total leads",    value: funnel.total,           color: "bg-gray-400",    hex: "#9ca3af" },
    { label: "จองค่าสำรวจ",     value: funnel.has_pre_doc,     color: "bg-sky-500",     hex: "#0ea5e9" },
    { label: "นัดสำรวจ",        value: funnel.has_survey,      color: "bg-violet-500",  hex: "#8b5cf6" },
    { label: "ออเดอร์",         value: funnel.has_order,       color: "bg-orange-500",  hex: "#f97316" },
    { label: "นัดติดตั้ง",      value: funnel.has_install,     color: "bg-emerald-500", hex: "#10b981" },
    { label: "ติดตั้งเสร็จ",    value: funnel.installed,       color: "bg-teal-500",    hex: "#14b8a6" },
  ];
  const max = Math.max(...stages.map(s => s.value), 1);

  return (
    <div className="rounded-xl bg-white border border-gray-300 p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Funnel — Lead Pipeline
        </div>
        <div className="text-xxs text-gray-400">{stages.length} stages · ซ้าย → ขวา</div>
      </div>

      {/* The funnel itself — flex row of clipped segments. h-32 keeps it
          short so the whole hero band stays compact across the page top. */}
      <div className="flex w-full h-32 md:h-36">
        {stages.map((s, i) => {
          const leftPct = i === 0 ? 100 : (stages[i - 1].value / max) * 100;
          const rightPct = (s.value / max) * 100;
          // Center the trapezoid vertically so the funnel tapers symmetrically.
          const topL = (100 - leftPct) / 2;
          const botL = (100 + leftPct) / 2;
          const topR = (100 - rightPct) / 2;
          const botR = (100 + rightPct) / 2;
          return (
            <div
              key={s.label}
              className={`flex-1 ${s.color} relative`}
              style={{
                clipPath: `polygon(0% ${topL}%, 100% ${topR}%, 100% ${botR}%, 0% ${botL}%)`,
              }}
              title={`${s.label}: ${s.value.toLocaleString("en")}`}
            />
          );
        })}
      </div>

      {/* Stage labels + values below the bands. Each cell aligns under its
          corresponding funnel segment. */}
      <div className="flex w-full mt-2">
        {stages.map((s, i) => {
          const prev = i > 0 ? stages[i - 1].value : null;
          const conv = prev && prev > 0 ? Math.round((s.value / prev) * 100) : null;
          return (
            <div key={s.label} className="flex-1 px-1 text-center">
              <div className="text-xxs font-semibold uppercase tracking-wider text-gray-500 leading-tight truncate" title={s.label}>
                {s.label}
              </div>
              <div className="text-base md:text-lg font-bold font-mono tabular-nums text-gray-900 mt-0.5">
                {s.value.toLocaleString("en")}
              </div>
              {conv !== null && (
                <div className="text-xxs text-gray-400 font-normal">
                  {conv}% from prev
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
