"use client";

import { apiFetch, getUserIdHeader } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import Header from "@/components/layout/Header";
import { useDialog } from "@/components/ui/Dialog";

type Prospect = {
  id: number;
  project_name: string | null;
  house_number: string | null;
  full_name: string | null;
  phone: string | null;
  existing_solar: string | null;
  installed_kw: number | null;
  installed_product: string | null;
  interest: "interested" | "not_interested" | "not_home" | "undecided" | null;
  interest_type: "new" | "upgrade" | null;
  note: string | null;
  visited_at: string | null;
  visited_by_name: string | null;
  visit_lat: number | null;
  visit_lng: number | null;
  line_id: string | null;
};

type StatusKey = "pending" | "contacted" | "interested" | "not_interested";

function cardStatus(p: Prospect): StatusKey {
  if (p.interest === "interested") return "interested";
  if (p.interest === "not_interested") return "not_interested";
  if (p.interest === "not_home" || p.visited_at || (p.note && p.note.trim())) return "contacted";
  return "pending";
}

function hasExistingSolar(p: Prospect): boolean {
  const s = typeof p.existing_solar === "string" ? p.existing_solar.trim() : "";
  if (s && !/^(ไม่มี|ยังไม่มี|no|none|-)/i.test(s)) return true;
  if (p.installed_kw != null && p.installed_kw > 0) return true;
  if (p.installed_product && p.installed_product.trim()) return true;
  return false;
}

export default function SeekerDashboardPage() {
  const dialog = useDialog();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [allProjects, setAllProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("seekerProjectFilter") : null;
    if (saved) setProjectFilter(saved);
    apiFetch(`/api/prospects?t=${Date.now()}`, { cache: "no-store" })
      .then(setProspects)
      .catch(console.error)
      .finally(() => setLoading(false));
    apiFetch("/api/projects")
      .then((list: { name: string }[]) => setAllProjects(list.map((p) => p.name)))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (projectFilter) localStorage.setItem("seekerProjectFilter", projectFilter);
    else localStorage.removeItem("seekerProjectFilter");
  }, [projectFilter]);

  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    for (const n of allProjects) if (n) set.add(n);
    for (const p of prospects) {
      const n = typeof p.project_name === "string" ? p.project_name.trim() : "";
      if (n) set.add(n);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
  }, [prospects, allProjects]);

  const scoped = useMemo(() => {
    if (!projectFilter) return prospects;
    return prospects.filter((p) => (typeof p.project_name === "string" ? p.project_name : "") === projectFilter);
  }, [prospects, projectFilter]);

  const stats = useMemo(() => {
    const s = {
      total: scoped.length,
      pending: 0,
      contacted: 0,
      interested: 0,
      interested_new: 0,
      interested_upgrade: 0,
      undecided: 0,
      not_home: 0,
      not_interested: 0,
      has_solar: 0,
      line_linked: 0,
    };
    for (const p of scoped) {
      const st = cardStatus(p);
      s[st]++;
      if (p.interest === "interested") {
        if (p.interest_type === "upgrade") s.interested_upgrade++;
        else if (p.interest_type === "new") s.interested_new++;
      }
      if (p.interest === "undecided") s.undecided++;
      if (p.interest === "not_home") s.not_home++;
      if (hasExistingSolar(p)) s.has_solar++;
      if (p.line_id) s.line_linked++;
    }
    return s;
  }, [scoped]);

  const byProject = useMemo(() => {
    const map = new Map<string, { total: number; pending: number; contacted: number; interested: number; not_interested: number }>();
    for (const p of scoped) {
      const key = (typeof p.project_name === "string" && p.project_name.trim()) || "— ไม่ระบุ —";
      if (!map.has(key)) map.set(key, { total: 0, pending: 0, contacted: 0, interested: 0, not_interested: 0 });
      const row = map.get(key)!;
      row.total++;
      row[cardStatus(p)]++;
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [scoped]);

  const recentVisits = useMemo(() => {
    return scoped
      .filter((p) => p.visited_at)
      .sort((a, b) => (a.visited_at! < b.visited_at! ? 1 : -1))
      .slice(0, 10);
  }, [scoped]);

  const coverage = stats.total === 0 ? 0 : Math.round(((stats.total - stats.pending) / stats.total) * 100);

  return (
    <div>
      <Header
        title="Seeker Dashboard"
        subtitle={projectFilter || "สรุปผลการเดินหา"}
        rightContent={
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="shrink-0 w-10 h-10 text-gray-700 hover:text-gray-900 flex items-center justify-center"
            aria-label="กรองโครงการ"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5.25h18M6 12h12m-9 6.75h6" />
            </svg>
          </button>
        }
      />

      <div className="px-4 md:px-5 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Top KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard icon="home" label="ทั้งหมด" value={stats.total.toLocaleString("en")} suffix="บ้าน" tint="gray" />
              <KpiCard icon="check" label="เยี่ยมแล้ว" value={`${coverage}%`} suffix={`${stats.total - stats.pending} / ${stats.total}`} tint="blue" />
              <KpiCard icon="heart" label="สนใจ" value={stats.interested.toLocaleString("en")} suffix={stats.total > 0 ? `${Math.round((stats.interested / stats.total) * 100)}%` : "0%"} tint="green" />
              <KpiCard icon="line" label="Add LINE OA" value={stats.line_linked.toLocaleString("en")} suffix={stats.total > 0 ? `${Math.round((stats.line_linked / stats.total) * 100)}%` : "0%"} tint="emerald" />
            </div>

            {/* Interest breakdown: donut + legend */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 relative">
              <button
                type="button"
                onClick={async () => {
                  const res = await fetch("/api/report/seeker-pdf", { headers: { ...getUserIdHeader() } });
                  if (!res.ok) { dialog.alert({ title: "โหลดไม่สำเร็จ", message: "โหลด PDF ไม่สำเร็จ", variant: "danger" }); return; }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `seeker_report_${new Date().toISOString().slice(0, 10)}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                }}
                className="absolute top-3 right-3 inline-flex items-center gap-1 h-8 px-2 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                title="ดาวน์โหลดรายงาน PDF"
                aria-label="ดาวน์โหลดรายงาน PDF"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                <span className="text-xs font-semibold">PDF</span>
              </button>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">สถานะการนำเสนอ</div>
              <div className="flex items-center gap-4">
                <InterestDonut
                  segments={[
                    { value: stats.interested_new, color: "#16a34a" },
                    { value: stats.interested_upgrade, color: "#2563eb" },
                    { value: stats.undecided, color: "#f59e0b" },
                    { value: stats.not_home, color: "#9ca3af" },
                    { value: stats.not_interested, color: "#dc2626" },
                    { value: stats.pending, color: "#e5e7eb" },
                  ]}
                  total={stats.total}
                />
                <div className="flex-1 min-w-0 text-xs space-y-1.5">
                  <LegendRow color="#16a34a" label="สนใจ-ติดตั้ง" value={stats.interested_new} total={stats.total} />
                  <LegendRow color="#2563eb" label="สนใจ-Upgrade" value={stats.interested_upgrade} total={stats.total} />
                  <LegendRow color="#f59e0b" label="ยังไม่ตัดสินใจ" value={stats.undecided} total={stats.total} />
                  <LegendRow color="#9ca3af" label="ไม่อยู่บ้าน" value={stats.not_home} total={stats.total} />
                  <LegendRow color="#dc2626" label="ไม่สนใจ" value={stats.not_interested} total={stats.total} />
                  <LegendRow color="#e5e7eb" label="ยังไม่ระบุ" value={stats.pending} total={stats.total} />
                </div>
              </div>
            </div>

            {/* Adoption mini-bars */}
            <div className="grid grid-cols-2 gap-3">
              <AdoptionBar label="Solar Adoption" value={stats.has_solar} total={stats.total} color="bg-amber-500" icon="solar" iconColor="text-amber-500" />
              <AdoptionBar label="LINE OA" value={stats.line_linked} total={stats.total} color="bg-emerald-500" icon="line" iconColor="text-emerald-500" />
            </div>

            {/* Coverage progress */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">ความคืบหน้า</div>
                <div className="text-2xl font-bold text-gray-900">{coverage}%</div>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${coverage}%` }} />
              </div>
              <div className="mt-2 text-xs text-gray-500">
                เยี่ยมแล้ว {stats.total - stats.pending} / {stats.total} หลัง
              </div>
            </div>


            {/* By project */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-bold text-gray-900">แยกตามโครงการ</h2>
              </div>
              {byProject.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">ไม่มีข้อมูล</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {byProject.map((row) => {
                    const pct = row.total === 0 ? 0 : Math.round(((row.total - row.pending) / row.total) * 100);
                    const segments: { key: string; count: number; color: string; label: string }[] = [
                      { key: "interested", count: row.interested, color: "bg-green-500", label: "สนใจ" },
                      { key: "contacted", count: row.contacted, color: "bg-amber-400", label: "กำลังติดต่อ" },
                      { key: "not_interested", count: row.not_interested, color: "bg-red-400", label: "ไม่สนใจ" },
                      { key: "pending", count: row.pending, color: "bg-gray-200", label: "ยังไม่เยี่ยม" },
                    ];
                    return (
                      <div key={row.name} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-gray-900 truncate min-w-0 flex-1">{row.name}</div>
                          <div className="text-sm font-semibold text-gray-700 shrink-0">{pct}%</div>
                        </div>
                        <div className="mt-2 flex h-2 rounded-full overflow-hidden bg-gray-100">
                          {segments.map((s) =>
                            s.count > 0 ? (
                              <div
                                key={s.key}
                                className={`${s.color} transition-all`}
                                style={{ width: `${(s.count / row.total) * 100}%` }}
                                title={`${s.label} ${s.count}`}
                              />
                            ) : null
                          )}
                        </div>
                        <div className="mt-1.5 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>ทั้งหมด {row.total}</span>
                          {row.interested > 0 && <span className="text-green-600">สนใจ {row.interested}</span>}
                          {row.contacted > 0 && <span className="text-amber-600">กำลังติดต่อ {row.contacted}</span>}
                          {row.not_interested > 0 && <span className="text-red-600">ไม่สนใจ {row.not_interested}</span>}
                          {row.pending > 0 && <span className="text-gray-500">ยังไม่เยี่ยม {row.pending}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent visits */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-bold text-gray-900">การเยี่ยมล่าสุด</h2>
              </div>
              {recentVisits.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">ยังไม่มีการเยี่ยม</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {recentVisits.map((p) => {
                    const st = cardStatus(p);
                    return (
                      <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {p.house_number || "-"} {p.full_name && <span className="font-normal text-gray-600">· {p.full_name}</span>}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5 truncate">
                            {p.project_name || ""}
                            {p.visited_by_name && <span> · โดย {p.visited_by_name}</span>}
                            {p.visited_at && <span> · {formatDateTime(p.visited_at)}</span>}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          {p.visit_lat != null && p.visit_lng != null && (
                            <a
                              href={`https://www.google.com/maps?q=${p.visit_lat},${p.visit_lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800"
                              title="เปิดตำแหน่งใน Google Maps"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                              </svg>
                            </a>
                          )}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${BADGE_COLOR[st]}`}>
                            {STATUS_LABEL[st]}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {pickerOpen && (
        <ProjectPickerModal
          value={projectFilter}
          options={projectOptions}
          onChange={(v) => {
            setProjectFilter(v);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

const STATUS_LABEL: Record<StatusKey, string> = {
  pending: "ยังไม่เยี่ยม",
  contacted: "กำลังติดต่อ",
  interested: "สนใจ",
  not_interested: "ไม่สนใจ",
};

const BADGE_COLOR: Record<StatusKey, string> = {
  pending: "bg-gray-100 text-gray-600 border-gray-200",
  contacted: "bg-amber-100 text-amber-700 border-amber-200",
  interested: "bg-green-100 text-green-700 border-green-200",
  not_interested: "bg-red-100 text-red-700 border-red-200",
};

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-2xl p-4 ${color}`}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </div>
  );
}

const KPI_TINTS: Record<string, { bg: string; icon: string }> = {
  gray: { bg: "bg-gray-50", icon: "text-gray-500" },
  blue: { bg: "bg-blue-50", icon: "text-blue-600" },
  green: { bg: "bg-green-50", icon: "text-green-600" },
  emerald: { bg: "bg-emerald-50", icon: "text-emerald-600" },
};

function KpiCard({ icon, label, value, suffix, tint }: { icon: "home" | "check" | "heart" | "line"; label: string; value: string; suffix: string; tint: keyof typeof KPI_TINTS }) {
  const t = KPI_TINTS[tint];
  return (
    <div className={`rounded-2xl p-4 ${t.bg}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={t.icon}>{renderKpiIcon(icon)}</span>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      </div>
      <div className="text-2xl md:text-3xl font-bold text-gray-900 tabular-nums leading-tight">{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{suffix}</div>
    </div>
  );
}

function renderKpiIcon(kind: "home" | "check" | "heart" | "line") {
  const cls = "w-4 h-4";
  if (kind === "home") return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75L12 3l9 6.75V21a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 21V9.75z" />
    </svg>
  );
  if (kind === "check") return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
  if (kind === "heart") return (
    <svg className={cls} fill="currentColor" viewBox="0 0 24 24">
      <path d="M11.645 20.91a.75.75 0 01-1.29 0C5.393 15.986 2.25 12.99 2.25 8.25 2.25 5.35 4.35 3 7.125 3c1.8 0 3.3.93 4.125 2.34A4.74 4.74 0 0115.375 3c2.775 0 4.875 2.35 4.875 5.25 0 4.74-3.143 7.736-8.105 12.66z" />
    </svg>
  );
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zM24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}

function InterestDonut({ segments, total }: { segments: { value: number; color: string }[]; total: number }) {
  const size = 120, r = 48, cx = 60, cy = 60, C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth="14" />
      {total > 0 && segments.map((s, i) => {
        if (s.value === 0) return null;
        const len = (s.value / total) * C;
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="14"
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
        offset += len;
        return el;
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" className="fill-gray-900" fontSize="18" fontWeight="700">{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="fill-gray-500" fontSize="9">หลัง</text>
    </svg>
  );
}

function LegendRow({ color, label, value, total }: { color: string; label: string; value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
      <span className="flex-1 truncate text-gray-700">{label}</span>
      <span className="font-bold text-gray-900 tabular-nums">{value}</span>
      <span className="text-gray-400 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

function AdoptionBar({ label, value, total, color, icon, iconColor }: { label: string; value: number; total: number; color: string; icon?: "solar" | "line"; iconColor?: string }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {icon && <span className={`shrink-0 ${iconColor || "text-gray-500"}`}>{renderAdoptionIcon(icon)}</span>}
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 truncate">{label}</div>
        </div>
        <div className="text-lg font-bold text-gray-900 tabular-nums shrink-0">{pct}%</div>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 text-[11px] text-gray-500 tabular-nums">{value.toLocaleString("en")} / {total.toLocaleString("en")}</div>
    </div>
  );
}

function renderAdoptionIcon(kind: "solar" | "line") {
  if (kind === "line") return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.44 3.317V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path d="M4 18L6.5 6h11L20 18H4z" strokeLinejoin="round" />
      <path d="M4 18h16" strokeLinecap="round" />
      <path d="M12 6v12" />
      <path d="M5.2 12h13.6" />
      <path d="M7.2 9h9.6" />
    </svg>
  );
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ProjectPickerModal({
  value,
  options,
  onChange,
  onClose,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">เลือกโครงการ</h2>
          <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-gray-100 text-gray-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาโครงการ..."
          className="w-full h-11 px-3 rounded-lg border border-gray-300 bg-white text-sm mb-3"
        />
        <div className="max-h-[60vh] overflow-y-auto -mx-2">
          <button
            type="button"
            onClick={() => onChange("")}
            className={`w-full text-left px-4 py-3 rounded-lg text-sm flex items-center justify-between hover:bg-gray-50 ${
              value === "" ? "text-primary font-semibold bg-primary/5" : "text-gray-700"
            }`}
          >
            <span>ทุกโครงการ</span>
            {value === "" && (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
          </button>
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">ไม่พบโครงการ</div>
          ) : (
            filtered.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onChange(name)}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm flex items-center justify-between hover:bg-gray-50 ${
                  value === name ? "text-primary font-semibold bg-primary/5" : "text-gray-700"
                }`}
              >
                <span className="truncate">{name}</span>
                {value === name && (
                  <svg className="w-5 h-5 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
