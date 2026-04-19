"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import Header from "@/components/layout/Header";

type Prospect = {
  id: number;
  project_name: string | null;
  house_number: string | null;
  full_name: string | null;
  phone: string | null;
  existing_solar: string | null;
  installed_kw: number | null;
  installed_product: string | null;
  interest: "interested" | "not_interested" | "not_home" | null;
  interest_type: "new" | "upgrade" | null;
  note: string | null;
  visited_at: string | null;
  visited_by_name: string | null;
  visit_lat: number | null;
  visit_lng: number | null;
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
  if (s && !/^(ไม่มี|ยังไม่มี|no|none|-)$/i.test(s)) return true;
  if (p.installed_kw != null && p.installed_kw > 0) return true;
  if (p.installed_product && p.installed_product.trim()) return true;
  return false;
}

export default function SeekerDashboardPage() {
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
      not_interested: 0,
      upgrade_candidates: 0,
    };
    for (const p of scoped) {
      const st = cardStatus(p);
      s[st]++;
      if (p.interest === "interested") {
        if (p.interest_type === "upgrade") s.interested_upgrade++;
        else if (p.interest_type === "new") s.interested_new++;
      }
      if (hasExistingSolar(p)) s.upgrade_candidates++;
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

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="ทั้งหมด" value={stats.total} color="bg-gray-50 text-gray-700" />
              <StatCard label="ยังไม่เยี่ยม" value={stats.pending} color="bg-white text-gray-700 border border-gray-200" />
              <StatCard label="กำลังติดต่อ" value={stats.contacted} color="bg-amber-50 text-amber-700" />
              <StatCard label="ไม่สนใจ" value={stats.not_interested} color="bg-red-50 text-red-700" />
            </div>

            {/* Interested breakdown */}
            <div className="bg-green-50 rounded-2xl p-4">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-green-700">สนใจ</div>
                <div className="text-3xl font-bold text-green-700">{stats.interested}</div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="bg-white rounded-lg px-3 py-2">
                  <div className="text-xs text-gray-500">ติดตั้งใหม่</div>
                  <div className="text-xl font-bold text-primary">{stats.interested_new}</div>
                </div>
                <div className="bg-white rounded-lg px-3 py-2">
                  <div className="text-xs text-gray-500">Upgrade</div>
                  <div className="text-xl font-bold text-amber-600">{stats.interested_upgrade}</div>
                </div>
              </div>
            </div>

            <StatCard label="ติด Solar แล้ว (upgrade candidate)" value={stats.upgrade_candidates} color="bg-amber-50 text-amber-700" />

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
