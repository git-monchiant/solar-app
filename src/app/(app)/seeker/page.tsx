"use client";

import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ListPageHeader from "@/components/layout/ListPageHeader";
import LinePickerModal from "@/components/modal/LinePickerModal";

type Prospect = {
  id: number;
  project_id: number | null;
  project_name: string | null;
  seq: number | null;
  house_number: string | null;
  full_name: string | null;
  phone: string | null;
  app_status: string | null;
  existing_solar: string | null;
  installed_kw: number | null;
  installed_product: string | null;
  ev_charger: string | null;
  interest: "interested" | "not_interested" | "not_home" | "undecided" | null;
  interest_type: "new" | "upgrade" | null;
  note: string | null;
  visited_by_name: string | null;
  visited_at: string | null;
  visit_count: number | null;
  visit_lat: number | null;
  visit_lng: number | null;
  line_id: string | null;
  contact_time: string | null;
  interest_reasons: string | null;
  interest_reason_note: string | null;
  created_at: string;
};

type CardStatusKey = "pending" | "contacted" | "interested" | "not_interested";

const CARD_STATUS: Record<CardStatusKey, { label: string; card: string; badge: string }> = {
  pending: {
    label: "",
    card: "bg-white border-gray-200 hover:border-primary",
    badge: "",
  },
  contacted: {
    label: "กำลังติดต่อ",
    card: "bg-amber-100 border-amber-300 hover:border-amber-500",
    badge: "bg-amber-200 text-amber-800 border-amber-300",
  },
  interested: {
    label: "สนใจ",
    card: "bg-green-100 border-green-300 hover:border-green-500",
    badge: "bg-green-200 text-green-800 border-green-300",
  },
  not_interested: {
    label: "ไม่สนใจ",
    card: "bg-red-100 border-red-300 hover:border-red-500",
    badge: "bg-red-200 text-red-800 border-red-300",
  },
};

function houseSortKey(h: string | null): [number, number, string] {
  if (!h) return [Number.MAX_SAFE_INTEGER, 0, ""];
  const parts = h.split("/");
  const base = parseInt(parts[0]);
  const unit = parts.length > 1 ? parseInt(parts[1]) : 0;
  return [isNaN(base) ? Number.MAX_SAFE_INTEGER : base, isNaN(unit) ? 0 : unit, h];
}

function compareHouse(a: Prospect, b: Prospect): number {
  const ka = houseSortKey(a.house_number);
  const kb = houseSortKey(b.house_number);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2].localeCompare(kb[2]);
}

function cardStatus(p: Prospect): CardStatusKey {
  if (p.interest === "interested") return "interested";
  if (p.interest === "not_interested") return "not_interested";
  if (p.interest === "not_home" || p.interest === "undecided" || p.visited_at || (p.note && p.note.trim())) return "contacted";
  return "pending";
}

function hasExistingSolar(p: Prospect): boolean {
  const s = (p.existing_solar || "").trim();
  if (s && !/^(ไม่มี|ยังไม่มี|no|none|-)/i.test(s)) return true;
  if (p.installed_kw != null && p.installed_kw > 0) return true;
  if (p.installed_product && p.installed_product.trim()) return true;
  return false;
}

function hasEvCharger(p: Prospect): boolean {
  const s = (p.ev_charger || "").trim();
  return !!s && !/^ไม่มี/i.test(s);
}


function SolarIcon() {
  return (
    <svg className="w-4 h-4 text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-label="ติด Solar แล้ว">
      <title>ติด Solar แล้ว — เสนอ upgrade</title>
      <path d="M4 18L6.5 6h11L20 18H4z" strokeLinejoin="round" />
      <path d="M4 18h16" strokeLinecap="round" />
      <path d="M12 6v12" />
      <path d="M5.2 12h13.6" />
      <path d="M7.2 9h9.6" />
      <path d="M4.6 15h14.8" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-label="เชื่อม LINE แล้ว">
      <title>เชื่อม LINE แล้ว</title>
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.44 3.317V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}

type ProjectCard = {
  name: string;
  assignee: string | null;
  prospect_count: number;
  interested_count: number;
  not_interested_count: number;
  pending_count: number;
  visited_count: number;
};

export default function SeekerPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [projectCards, setProjectCards] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "pending" | "contacted" | "interested" | "not_interested">("all");
  const [search, setSearch] = useState<string>("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectFilter = searchParams.get("project") || "";
  const setProjectFilter = (name: string) => {
    if (name) router.push(`/seeker?project=${encodeURIComponent(name)}`);
    else router.push("/seeker");
  };
  const [projectSearch, setProjectSearch] = useState<string>("");
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const list: ProjectCard[] = await apiFetch("/api/projects?has_prospects=1");
      setProjectCards(list);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSearch(localStorage.getItem("seekerSearch") || "");
    }
    setHydrated(true);
    fetchProjects().finally(() => setProjectsLoading(false));
  }, [fetchProjects]);

  useEffect(() => {
    if (!hydrated) return;
    if (projectFilter) refresh(projectFilter);
    else { setProspects([]); setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFilter, hydrated]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (search) localStorage.setItem("seekerSearch", search);
    else localStorage.removeItem("seekerSearch");
  }, [search]);

  function refresh(filter?: string) {
    setLoading(true);
    const effective = filter ?? projectFilter;
    const qs = new URLSearchParams({ t: String(Date.now()) });
    if (effective) qs.set("project_name", effective);
    apiFetch(`/api/prospects?${qs.toString()}`, { cache: "no-store" })
      .then(setProspects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projectCards;
    return projectCards.filter((p) => p.name.toLowerCase().includes(q));
  }, [projectCards, projectSearch]);

  const scopedByProject = useMemo(() => {
    if (!projectFilter) return prospects;
    return prospects.filter((p) => (typeof p.project_name === "string" ? p.project_name : "") === projectFilter);
  }, [prospects, projectFilter]);

  const counts = useMemo(() => {
    const c = { all: scopedByProject.length, pending: 0, contacted: 0, interested: 0, not_interested: 0 };
    for (const p of scopedByProject) {
      const s = cardStatus(p);
      c[s]++;
    }
    return c;
  }, [scopedByProject]);

  const filtered = useMemo(() => {
    let list = scopedByProject;
    if (tab !== "all") list = list.filter((p) => cardStatus(p) === tab);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          (p.full_name || "").toLowerCase().includes(q) ||
          (p.house_number || "").toLowerCase().includes(q) ||
          (p.phone || "").includes(q) ||
          (p.project_name || "").toLowerCase().includes(q)
      );
    }
    return [...list].sort(compareHouse);
  }, [scopedByProject, tab, search]);

  if (!projectFilter) {
    return (
      <ProjectLanding
        projects={filteredProjects}
        loading={projectsLoading}
        search={projectSearch}
        onSearchChange={setProjectSearch}
        onSelect={setProjectFilter}
      />
    );
  }

  return (
    <div>
      <ListPageHeader
        title={projectFilter}
        subtitle="LEADS SEEKER"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาบ้านเลขที่/ชื่อ/เบอร์..."
        tabs={[
          { key: "all", label: "ทั้งหมด", count: counts.all },
          { key: "pending", label: "ยังไม่เยี่ยม", count: counts.pending },
          { key: "contacted", label: "กำลังติดต่อ", count: counts.contacted },
          { key: "interested", label: "สนใจ", count: counts.interested },
          { key: "not_interested", label: "ไม่สนใจ", count: counts.not_interested },
        ]}
        activeTab={tab}
        onTabChange={(k) => setTab(k as typeof tab)}
      />

      <div className="px-3 md:px-5 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-16">ไม่มีข้อมูล</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {filtered.map((p) => {
              const status = cardStatus(p);
              return (
                <button
                  key={p.id}
                  onClick={() => setEditing(p)}
                  className={`text-left rounded-xl border px-4 py-3 hover:shadow-sm transition-all relative ${CARD_STATUS[status].card}`}
                  style={{ contentVisibility: "auto", containIntrinsicSize: "90px" }}
                >
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
                    </svg>
                    <span className="text-base font-bold text-gray-900 leading-tight truncate">{p.house_number || "-"}</span>
                    {p.line_id && <LineIcon />}
                    <div className="ml-auto flex items-center gap-1 shrink-0">
                      {(() => {
                        const count = p.visit_count ?? 0;
                        if (status === "interested" && p.interest_type === "upgrade") {
                          return (
                            <span className="text-[10px] text-blue-700 uppercase tracking-wider font-bold mr-1">Upgrade</span>
                          );
                        }
                        if (status === "contacted" || status === "not_interested") {
                          return (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border mr-1 ${CARD_STATUS[status].badge}`}>
                              {CARD_STATUS[status].label}
                              {status === "contacted" && count > 0 && (
                                <span className="ml-1 font-bold">×{count}</span>
                              )}
                            </span>
                          );
                        }
                        return null;
                      })()}
                      <span className={hasExistingSolar(p) ? "text-blue-600" : "text-gray-300"} title={hasExistingSolar(p) ? "มี Solar" : "ยังไม่มี Solar"}>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                          <path d="M4 18L6.5 6h11L20 18H4z" strokeLinejoin="round" />
                          <path d="M4 18h16" strokeLinecap="round" />
                          <path d="M12 6v12" />
                          <path d="M5.2 12h13.6" />
                          <path d="M7.2 9h9.6" />
                          <path d="M4.6 15h14.8" />
                        </svg>
                      </span>
                      <span className={hasEvCharger(p) ? "text-purple-600" : "text-gray-300"} title={hasEvCharger(p) ? "มี EV Charger" : "ยังไม่มี EV Charger"}>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                          <path d="M4 17V8a2 2 0 012-2h8a2 2 0 012 2v9" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M3 17h12" strokeLinecap="round" />
                          <path d="M16 11h2a2 2 0 012 2v3a1.5 1.5 0 01-3 0v-1" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M9 9l-2 4h3l-1 3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </div>
                  </div>
                  {p.full_name && (
                    <div className="mt-1 text-xs text-gray-600 truncate flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                      </svg>
                      <span className="truncate">{p.full_name}</span>
                    </div>
                  )}
                  {hasExistingSolar(p) && (
                    <div className="mt-1 text-xs text-blue-700 font-semibold truncate">
                      Solar: {p.installed_kw != null && p.installed_kw > 0 ? `${p.installed_kw} kW` : (p.existing_solar || p.installed_product || "ติดแล้ว")}
                    </div>
                  )}
                  <div className="mt-1 text-sm text-gray-500 font-mono flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                    <span>{p.phone || <span className="text-gray-300">-</span>}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <VisitModal
          prospect={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
          onRefresh={() => refresh()}
        />
      )}

    </div>
  );
}

const FAV_KEY = "seekerFavorites";

function ProjectLanding({
  projects,
  loading,
  search,
  onSearchChange,
  onSelect,
}: {
  projects: ProjectCard[];
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (name: string) => void;
}) {
  const [favs, setFavs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(FAV_KEY);
    if (saved) {
      try { setFavs(new Set(JSON.parse(saved))); } catch {}
    }
  }, []);

  const toggleFav = (name: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      if (typeof window !== "undefined") {
        localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
      }
      return next;
    });
  };

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      const fa = favs.has(a.name), fb = favs.has(b.name);
      if (fa && !fb) return -1;
      if (!fa && fb) return 1;
      return a.name.localeCompare(b.name, "th");
    });
  }, [projects, favs]);
  return (
    <div>
      <ListPageHeader
        title="Leads Seeker"
        subtitle="เลือกโครงการ"
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder="ค้นหาโครงการ..."
        tabs={[]}
        activeTab=""
        onTabChange={() => {}}
      />

      <div className="px-3 md:px-5 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-16">ไม่มีโครงการ</div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-200">
              {sortedProjects.map((p) => {
                const total = p.prospect_count || 0;
                const contacted = Math.max(0, total - p.interested_count - p.not_interested_count - p.pending_count);
                const pct = total === 0 ? 0 : Math.round(((total - p.pending_count) / total) * 100);
                const segments = [
                  { key: "interested", count: p.interested_count, color: "bg-green-500", label: "สนใจ" },
                  { key: "contacted", count: contacted, color: "bg-amber-400", label: "กำลังติดต่อ" },
                  { key: "not_interested", count: p.not_interested_count, color: "bg-red-400", label: "ไม่สนใจ" },
                  { key: "pending", count: p.pending_count, color: "bg-gray-200", label: "ยังไม่เยี่ยม" },
                ];
                const isFav = favs.has(p.name);
                return (
                  <div key={p.name} className="flex items-stretch hover:bg-gray-50 transition-colors">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleFav(p.name); }}
                      aria-label={isFav ? "เอาออกจาก favorites" : "เพิ่มใน favorites"}
                      className="shrink-0 pl-3 pr-1.5 flex items-center text-gray-300 hover:text-amber-400 cursor-pointer"
                    >
                      {isFav ? (
                        <svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelect(p.name)}
                      className="flex-1 text-left py-3 pr-4 min-w-0 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75L12 3l9 6.75V21a1.5 1.5 0 01-1.5 1.5H16.5v-6.75a1.5 1.5 0 00-1.5-1.5h-6a1.5 1.5 0 00-1.5 1.5V22.5H4.5A1.5 1.5 0 013 21V9.75z" />
                          </svg>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate">{p.name}</div>
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-gray-700 shrink-0">{pct}%</div>
                      </div>
                      <div className="mt-2 flex h-2 rounded-full overflow-hidden bg-gray-100">
                        {segments.map((s) =>
                          s.count > 0 ? (
                            <div key={s.key} className={`${s.color} transition-all`} style={{ width: `${(s.count / total) * 100}%` }} title={`${s.label} ${s.count}`} />
                          ) : null
                        )}
                      </div>
                      <div className="mt-1.5 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>ทั้งหมด {total}</span>
                        {p.interested_count > 0 && <span className="text-green-600">สนใจ {p.interested_count}</span>}
                        {contacted > 0 && <span className="text-amber-600">กำลังติดต่อ {contacted}</span>}
                        {p.not_interested_count > 0 && <span className="text-red-600">ไม่สนใจ {p.not_interested_count}</span>}
                        {p.pending_count > 0 && <span className="text-gray-500">ยังไม่เยี่ยม {p.pending_count}</span>}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VisitModal({ prospect, onClose, onSaved, onRefresh }: { prospect: Prospect; onClose: () => void; onSaved: () => void; onRefresh: () => void }) {
  const [modalTab, setModalTab] = useState<"visit" | "reasons" | "line">("visit");
  const [interest, setInterest] = useState<Prospect["interest"]>(prospect.interest);
  const [interestType, setInterestType] = useState<Prospect["interest_type"]>(prospect.interest_type);
  const [note, setNote] = useState(prospect.note || "");
  const [contactName, setContactName] = useState(prospect.full_name || "");
  const [contactHours, setContactHours] = useState<number[]>(() => {
    if (!prospect.contact_time) return [];
    return prospect.contact_time
      .split(",")
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n) && n >= 8 && n <= 19);
  });
  const [reasonCodes, setReasonCodes] = useState<string[]>(() =>
    prospect.interest_reasons ? prospect.interest_reasons.split(",").map((s) => s.trim()).filter(Boolean) : []
  );
  const [reasonNote, setReasonNote] = useState(prospect.interest_reason_note || "");
  const [reasonsSavedAt, setReasonsSavedAt] = useState<number | null>(null);
  const reasonsInitRef = useRef(true);

  // Auto-save reasons tab: debounced PATCH whenever chips or note change.
  useEffect(() => {
    if (reasonsInitRef.current) { reasonsInitRef.current = false; return; }
    const timer = setTimeout(async () => {
      try {
        await apiFetch(`/api/prospects/${prospect.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interest_reasons: reasonCodes.length ? reasonCodes.join(",") : null,
            interest_reason_note: reasonNote.trim() || null,
          }),
        });
        setReasonsSavedAt(Date.now());
        setTimeout(() => setReasonsSavedAt(null), 1500);
      } catch (e) {
        console.error("auto-save reasons failed", e);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [reasonCodes, reasonNote, prospect.id]);
  const [saving, setSaving] = useState(false);
  const [linePickerOpen, setLinePickerOpen] = useState(false);
  const [linkedLine, setLinkedLine] = useState<{ display_name: string; picture_url: string | null } | null>(null);

  useEffect(() => {
    if (!prospect.line_id) return;
    apiFetch("/api/line-users").then((data: Array<{ line_user_id: string; display_name: string; picture_url: string | null }>) => {
      const match = data.find((u) => u.line_user_id === prospect.line_id);
      if (match) setLinkedLine({ display_name: match.display_name || "", picture_url: match.picture_url });
    }).catch(() => {});
  }, [prospect.line_id]);

  function getLocation(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    });
  }

  async function save() {
    setSaving(true);
    try {
      const loc = await getLocation();
      await apiFetch(`/api/prospects/${prospect.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interest,
          interest_type: interest === "interested" ? interestType : null,
          note,
          full_name: contactName.trim() || null,
          contact_time: contactHours.length ? [...contactHours].sort((a, b) => a - b).join(",") : null,
          visit_lat: loc?.lat ?? null,
          visit_lng: loc?.lng ?? null,
        }),
      });
      onSaved();
    } catch (e) {
      console.error(e);
      alert("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  type VisitChoice = {
    key: string;
    label: string;
    interest: NonNullable<Prospect["interest"]>;
    type: Prospect["interest_type"];
    color: string;
  };
  const visitChoices: VisitChoice[] = [
    { key: "interested-new", label: "สนใจ - ติดตั้ง", interest: "interested", type: "new", color: "bg-green-600 border-green-600 text-white" },
    { key: "interested-upgrade", label: "สนใจ - Upgrade", interest: "interested", type: "upgrade", color: "bg-blue-600 border-blue-600 text-white" },
    { key: "undecided", label: "ยังไม่ตัดสินใจ", interest: "undecided", type: null, color: "bg-amber-500 border-amber-500 text-white" },
    { key: "not_home", label: "ไม่อยู่บ้าน", interest: "not_home", type: null, color: "bg-amber-500 border-amber-500 text-white" },
    { key: "not_interested", label: "ไม่สนใจ", interest: "not_interested", type: null, color: "bg-red-500 border-red-500 text-white" },
  ];

  const hasRecord = !!(prospect.interest || prospect.visited_at || (prospect.note && prospect.note.trim()));
  const action = hasRecord ? "แก้ไขการเยี่ยม" : "บันทึกการเยี่ยม";
  const flagItems = [
    {
      key: "solar",
      on: hasExistingSolar(prospect),
      onCls: "text-blue-600",
      title: hasExistingSolar(prospect) ? "มี Solar" : "ยังไม่มี Solar",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path d="M4 18L6.5 6h11L20 18H4z" strokeLinejoin="round" />
          <path d="M4 18h16" strokeLinecap="round" />
          <path d="M12 6v12" />
          <path d="M5.2 12h13.6" />
          <path d="M7.2 9h9.6" />
          <path d="M4.6 15h14.8" />
        </svg>
      ),
    },
    {
      key: "ev",
      on: hasEvCharger(prospect),
      onCls: "text-purple-600",
      title: hasEvCharger(prospect) ? "มี EV Charger" : "ยังไม่มี EV Charger",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path d="M4 17V8a2 2 0 012-2h8a2 2 0 012 2v9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 17h12" strokeLinecap="round" />
          <path d="M16 11h2a2 2 0 012 2v3a1.5 1.5 0 01-3 0v-1" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 9l-2 4h3l-1 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];
  const title = (
    <>
      <span className="truncate">
        {prospect.house_number ? `${prospect.house_number} · ${action}` : action}
      </span>
      <span className="flex items-center gap-1.5 shrink-0">
        {flagItems.map((i) => (
          <span key={i.key} title={i.title} className={i.on ? i.onCls : "text-gray-300"}>
            {i.icon}
          </span>
        ))}
      </span>
    </>
  );

  return (
    <Modal onClose={onClose} title={title}>
      <div className="flex border-b border-gray-200 -mx-5 px-5 mb-4">
        <button
          type="button"
          onClick={() => setModalTab("visit")}
          className={`flex-1 pb-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            modalTab === "visit" ? "text-primary border-primary" : "text-gray-400 border-transparent hover:text-gray-600"
          }`}
        >
          การเยี่ยม
        </button>
        <button
          type="button"
          onClick={() => setModalTab("reasons")}
          className={`flex-1 pb-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            modalTab === "reasons" ? "text-primary border-primary" : "text-gray-400 border-transparent hover:text-gray-600"
          }`}
        >
          เหตุผล
        </button>
        <button
          type="button"
          onClick={() => setModalTab("line")}
          className={`flex-1 pb-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors inline-flex items-center justify-center gap-1.5 ${
            modalTab === "line" ? "text-primary border-primary" : "text-gray-400 border-transparent hover:text-gray-600"
          }`}
        >
          {linkedLine && (
            <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </span>
          )}
          Add LINE
        </button>
      </div>

      <div className="min-h-[560px]">
      {modalTab === "line" ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <img src="/logos/logo-sena.png" alt="SENA SOLAR" className="h-10 w-auto" />
          <div className="text-sm text-gray-700">ให้ลูกค้าสแกนเพื่อเพิ่ม LINE</div>
          <img src="/api/line-qr" alt="LINE QR" className="w-64 h-64 rounded-lg border-4 border-[#06C755] p-1 bg-white" />
          <div className="text-xs font-semibold text-gray-700">SENA SOLAR ENERGY</div>

          <div className="w-64 mt-2">
            {linkedLine ? (
              <div className="w-full">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">LINE Profile</div>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white">
                  {linkedLine.picture_url ? (
                    <img src={linkedLine.picture_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-200 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{linkedLine.display_name || "LINE User"}</div>
                    <div className="text-xs text-emerald-600">● เชื่อมแล้ว</div>
                  </div>
                  <button
                    type="button"
                    title="ยกเลิกการเชื่อม"
                    onClick={async () => {
                      if (!confirm("ยกเลิกการเชื่อม LINE ของบ้านนี้?")) return;
                      await apiFetch(`/api/prospects/${prospect.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ line_id: null }),
                      });
                      setLinkedLine(null);
                      onRefresh();
                    }}
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setLinePickerOpen(true)}
                className="w-full inline-flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-800 py-2"
              >
                <span className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center text-base leading-none">+</span>
                เลือก LINE ของลูกค้า
              </button>
            )}
          </div>

          {linePickerOpen && (
            <LinePickerModal
              target={{ type: "prospect", id: prospect.id, label: prospect.house_number || contactName || "บ้านนี้" }}
              onClose={() => setLinePickerOpen(false)}
              onLinked={(linked) => { setLinkedLine(linked); onRefresh(); }}
            />
          )}
        </div>
      ) : (
      <>
      <div className="space-y-4">
        {modalTab === "visit" && <>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">ผลการเยี่ยม</div>
          <div className="grid grid-cols-2 gap-2">
            {visitChoices.map((c) => {
              const active = interest === c.interest && interestType === c.type;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    setInterest(c.interest);
                    setInterestType(c.type);
                  }}
                  className={`h-11 rounded-lg border text-sm font-semibold transition-colors ${
                    active ? c.color : "bg-white border-gray-300 text-gray-700 hover:border-gray-400"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="Contact Person (ชื่อคนที่เจอ)">
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="ชื่อเจ้าของ / คนที่พบที่บ้านเลขที่นี้"
            className="w-full h-11 px-3 rounded-lg border border-gray-300 bg-white text-sm"
          />
          <div className="mt-1 text-[11px] text-gray-400">ชื่อในระบบเป็นข้อมูลเก่า แก้ตามคนที่เจอจริงได้</div>
        </Field>

        <Field label="ช่วงเวลาที่สะดวกให้ติดต่อ">
          <div className="grid grid-cols-6 gap-1.5">
            {Array.from({ length: 12 }, (_, i) => i + 8).map((h) => {
              const on = contactHours.includes(h);
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() =>
                    setContactHours((prev) => (prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]))
                  }
                  className={`h-9 rounded-lg text-xs font-semibold tabular-nums transition-colors ${
                    on
                      ? "bg-primary text-white border border-primary"
                      : "bg-white text-gray-700 border border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {h}:00
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="บันทึก (optional)">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm resize-none"
          />
        </Field>
        </>}

        {modalTab === "reasons" && <>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">เหตุผลที่สนใจ (เลือกได้หลายข้อ)</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { code: "save_bill", label: "ประหยัดค่าไฟ" },
              { code: "sell_back", label: "ขายไฟคืน" },
              { code: "tax_deduction", label: "ใช้ลดหย่อนภาษี" },
              { code: "daytime_usage", label: "เปิดแอร์ทั้งวัน" },
              { code: "pet_ac", label: "เปิดแอร์ให้สัตว์เลี้ยง" },
              { code: "elderly_care", label: "ดูแลผู้สูงอายุ/ผู้ป่วย" },
              { code: "has_ev", label: "ชาร์จรถ EV" },
              { code: "environment", label: "รักสิ่งแวดล้อม" },
              { code: "home_business", label: "เปิดร้านที่บ้าน" },
              { code: "other", label: "อื่นๆ" },
            ].map((r) => {
              const on = reasonCodes.includes(r.code);
              return (
                <button
                  key={r.code}
                  type="button"
                  onClick={() =>
                    setReasonCodes((prev) => (prev.includes(r.code) ? prev.filter((x) => x !== r.code) : [...prev, r.code]))
                  }
                  className={`h-11 rounded-lg border text-sm font-semibold transition-colors ${
                    on
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="รายละเอียด / อื่นๆ (optional)">
          <textarea
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
            rows={3}
            placeholder="เหตุผลเพิ่มเติม หรือรายละเอียดจากลูกค้า..."
            className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm resize-none"
          />
        </Field>
        </>}
      </div>

      {modalTab === "visit" && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-11 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 h-11 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      )}
      {modalTab === "reasons" && (
        <div className="mt-4 text-center text-xs text-gray-400">
          {reasonsSavedAt ? "✓ บันทึกอัตโนมัติแล้ว" : "บันทึกอัตโนมัติเมื่อแก้ไข"}
        </div>
      )}
      </>
      )}
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-stretch md:items-center justify-center md:p-4" onClick={onClose}>
      <div
        className="bg-white w-full md:max-w-md md:rounded-2xl md:max-h-[90vh] overflow-y-auto flex flex-col"
        style={{
          paddingTop: "max(1.25rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
          paddingLeft: "1.25rem",
          paddingRight: "1.25rem",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 gap-2">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 min-w-0">{title}</h2>
          <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-gray-100 text-gray-500 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      {children}
    </label>
  );
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
    <Modal onClose={onClose} title="เลือกโครงการ">
      <div className="space-y-3">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาโครงการ..."
          className="w-full h-11 px-3 rounded-lg border border-gray-300 bg-white text-sm"
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
    </Modal>
  );
}
