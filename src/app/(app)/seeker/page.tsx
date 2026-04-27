"use client";

import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ListPageHeader from "@/components/layout/ListPageHeader";
import LinePickerModal from "@/components/modal/LinePickerModal";
import { useDialog } from "@/components/ui/Dialog";
import ModalCloseButton from "@/components/ui/ModalCloseButton";

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
  lead_id: number | null;
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
  interest_sizes: string | null;
  returned_at: string | null;
  contacts: string | null;
  line_display_name: string | null;
  line_picture_url: string | null;
  created_at: string;
};

export type Contact = { name: string | null; phone: string | null };

// Strip Thai title prefixes at the start of a name (นาย/นาง/นางสาว/น.ส./ด.ช./ด.ญ.).
// Longer prefixes first so "นางสาว" matches before "นาง".
export function stripThaiTitle(s: string | null | undefined): string | null {
  if (!s) return null;
  const cleaned = s
    .trim()
    .replace(/^(นางสาว|นาง|นาย|น\.ส\.?|ด\.ช\.?|ด\.ญ\.?)\s*/u, "")
    .trim();
  return cleaned || null;
}

export function parseContacts(raw: string | null): Contact[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((c): Contact => ({
        name: typeof c?.name === "string" ? c.name : null,
        phone: typeof c?.phone === "string" ? c.phone : null,
      }))
      .filter((c) => c.name || c.phone);
  } catch {
    return [];
  }
}

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

// Returned from sales: sales explicitly sent this back via the
// "return to seeker" flow. Uses a dedicated flag so seeker can edit fields
// freely (auto-save) without flipping the card out of the "returned" bucket —
// the flag is only cleared when seeker clicks the orange sync button.
function isReturnedProspect(p: Prospect): boolean {
  return !!p.lead_id && !!p.returned_at;
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
  const [tab, setTab] = useState<"all" | "todo" | "returned" | "interested" | "not_interested">("all");
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
  const [creatingNew, setCreatingNew] = useState(false);
  const dialog = useDialog();

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
    const c = { all: scopedByProject.length, todo: 0, returned: 0, interested: 0, not_interested: 0 };
    for (const p of scopedByProject) {
      if (isReturnedProspect(p)) { c.returned++; continue; }
      const s = cardStatus(p);
      if (s === "pending" || s === "contacted") c.todo++;
      else if (s === "interested") c.interested++;
      else if (s === "not_interested") c.not_interested++;
    }
    return c;
  }, [scopedByProject]);

  const filtered = useMemo(() => {
    let list = scopedByProject;
    if (tab === "returned") list = list.filter((p) => isReturnedProspect(p));
    else if (tab === "todo") list = list.filter((p) => {
      if (isReturnedProspect(p)) return false;
      const s = cardStatus(p);
      return s === "pending" || s === "contacted";
    });
    else if (tab !== "all") list = list.filter((p) => !isReturnedProspect(p) && cardStatus(p) === tab);
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
    <div className="flex flex-col h-full overflow-hidden">
      <ListPageHeader
        title={projectFilter}
        subtitle="LEADS SEEKER"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาบ้านเลขที่/ชื่อ/เบอร์..."
        tabs={[
          { key: "all", label: "ทั้งหมด", count: counts.all },
          { key: "todo", label: "อยู่ระหว่างดำเนินการ", count: counts.todo },
          { key: "returned", label: "ถูกส่งกลับ", count: counts.returned },
          { key: "interested", label: "สนใจ", count: counts.interested },
          { key: "not_interested", label: "ไม่สนใจ", count: counts.not_interested },
        ]}
        activeTab={tab}
        onTabChange={(k) => setTab(k as typeof tab)}
      />

      <div className="px-3 md:px-5 py-3 flex-1 overflow-y-auto">
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
              const isReturned = isReturnedProspect(p);
              const isSynced = !!p.lead_id && !isReturned;
              const cardClass = isReturned
                ? "bg-amber-100 border-amber-400 hover:border-amber-500"
                : isSynced
                ? "bg-blue-100 border-blue-300 hover:border-blue-500"
                : CARD_STATUS[status].card;
              return (
                <button
                  key={p.id}
                  onClick={() => setEditing(p)}
                  className={`text-left rounded-xl border px-3 py-3 hover:shadow-sm transition-all relative flex flex-col gap-1.5 ${cardClass}`}
                  style={{ contentVisibility: "auto", containIntrinsicSize: "110px" }}
                >
                  {/* Row 1: house number (prominent, full width) + status badge on right */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <svg className="w-4 h-4 text-primary shrink-0 translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
                        </svg>
                        <span className="text-base font-bold text-gray-900 leading-tight break-all">{p.house_number || "-"}</span>
                      </div>
                    </div>
                    {(() => {
                      if (isReturned) {
                        return (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap bg-amber-200 text-amber-900 border-amber-400 font-semibold">
                            ส่งกลับ #{p.lead_id}
                          </span>
                        );
                      }
                      if (isSynced) {
                        return (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap bg-blue-200 text-blue-800 border-blue-300 font-semibold">
                            LEAD #{p.lead_id}
                          </span>
                        );
                      }
                      const count = p.visit_count ?? 0;
                      if (status === "contacted" || status === "not_interested") {
                        return (
                          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap ${CARD_STATUS[status].badge}`}>
                            {CARD_STATUS[status].label}
                            {status === "contacted" && count > 0 && <span className="ml-1 font-bold">×{count}</span>}
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {/* Row 2: primary name + "และอีก N คน" trailing text for extras */}
                  {p.full_name && (() => {
                    const others = Math.max(0, parseContacts(p.contacts).length - 1);
                    return (
                      <div className="text-xs text-gray-600 leading-snug flex items-center gap-1 min-w-0">
                        <svg className="w-3.5 h-3.5 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                        </svg>
                        <span className="truncate min-w-0" title={p.full_name}>{p.full_name}</span>
                        {others > 0 && (
                          <span className="shrink-0 text-indigo-600 font-semibold">(+{others})</span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Row 3: primary phone + LINE icon */}
                  {(p.phone || p.line_id) && (
                    <div className="text-xs text-gray-600 font-mono tabular-nums flex items-center gap-1.5 min-w-0">
                      <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.05-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.24 1.05l-2.21 2.17z" />
                      </svg>
                      <span className="truncate">{p.phone || <span className="text-gray-300">-</span>}</span>
                      {p.line_id && (
                        <>
                          <span className="text-gray-400">,</span>
                          <LineIcon />
                        </>
                      )}
                    </div>
                  )}

                  {/* Row 4: indicators (LINE / Solar / EV / Upgrade) — split equally */}
                  {(() => {
                    const chips: React.ReactNode[] = [];
                    if (hasExistingSolar(p)) {
                      chips.push(
                        <span key="solar" className="flex-1 inline-flex items-center justify-start gap-1 text-xs font-semibold text-blue-700 py-0.5">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                            <path d="M4 18L6.5 6h11L20 18H4z" strokeLinejoin="round" />
                            <path d="M4 18h16" strokeLinecap="round" />
                            <path d="M12 6v12" />
                            <path d="M5.2 12h13.6" />
                          </svg>
                          {p.installed_kw != null && p.installed_kw > 0 ? `${p.installed_kw} kW` : "Solar"}
                        </span>
                      );
                    }
                    if (hasEvCharger(p)) {
                      chips.push(
                        <span key="ev" className="flex-1 inline-flex items-center justify-start gap-1 text-xs font-semibold text-purple-700 py-0.5">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                            <path d="M4 17V8a2 2 0 012-2h8a2 2 0 012 2v9" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M3 17h12" strokeLinecap="round" />
                            <path d="M16 11h2a2 2 0 012 2v3a1.5 1.5 0 01-3 0v-1" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M9 9l-2 4h3l-1 3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          EV
                        </span>
                      );
                    }
                    if (status === "interested" && p.interest_type === "upgrade") {
                      chips.push(
                        <span key="upgrade" className="flex-1 inline-flex items-center justify-start text-xs font-bold tracking-wider uppercase text-blue-700 py-0.5">
                          Upgrade
                        </span>
                      );
                    }
                    if (!chips.length) return null;
                    return (
                      <div className="mt-auto flex items-center gap-1 pt-1 border-t border-gray-100">
                        {chips}
                      </div>
                    );
                  })()}
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

      <button
        type="button"
        disabled={creatingNew}
        onClick={async () => {
          if (creatingNew) return;
          setCreatingNew(true);
          try {
            const projectId = scopedByProject.find((p) => p.project_id)?.project_id ?? null;
            const created: Prospect = await apiFetch("/api/prospects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                project_id: projectId,
                project_name: projectFilter,
              }),
            });
            setProspects((prev) => [created, ...prev]);
            setEditing(created);
          } catch (e) {
            dialog.alert({
              title: "สร้าง Prospect ไม่สำเร็จ",
              message: e instanceof Error ? e.message : "เกิดข้อผิดพลาด",
              variant: "danger",
            });
          } finally {
            setCreatingNew(false);
          }
        }}
        title="สร้าง Prospect ใหม่"
        className="fixed bottom-24 md:bottom-8 right-5 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center disabled:opacity-60"
      >
        {creatingNew ? (
          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        )}
      </button>

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
    <div className="flex flex-col h-full overflow-hidden">
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

      <div className="px-3 md:px-5 py-3 flex-1 overflow-y-auto">
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
  const dialog = useDialog();
  const [modalTab, setModalTab] = useState<"line" | "people" | "visit" | "reasons">("line");
  const [interest, setInterest] = useState<Prospect["interest"]>(prospect.interest);
  const [interestType, setInterestType] = useState<Prospect["interest_type"]>(prospect.interest_type);
  const [note, setNote] = useState(prospect.note || "");
  const [houseNumber, setHouseNumber] = useState(prospect.house_number || "");
  // Contacts: everyone living at this house. The primary contact is mirrored
  // server-side into legacy full_name / phone. We keep `contacts` in stable
  // insertion order and track `primaryIdx` separately so marking someone as
  // primary doesn't visually reorder the list — the gold border just moves.
  const [contacts, setContacts] = useState<Contact[]>(() => {
    const parsed = parseContacts(prospect.contacts);
    if (parsed.length > 0) return parsed;
    const fallback: Contact = {
      name: prospect.full_name || null,
      phone: prospect.phone || null,
    };
    return fallback.name || fallback.phone ? [fallback] : [{ name: null, phone: null }];
  });
  const [primaryIdx, setPrimaryIdx] = useState(0);
  const contactName = contacts[0]?.name || "";
  const setContactName = (v: string) =>
    setContacts((prev) => {
      const next = prev.length ? [...prev] : [{ name: null, phone: null }];
      next[0] = { ...next[0], name: v || null };
      return next;
    });
  const cleanContacts = useMemo(() => {
    // Reorder so the marked primary goes to index 0 for serialization
    // (server mirrors contacts[0] → full_name/phone). Display order is
    // preserved by rendering `contacts` directly, not this array.
    const primary = contacts[primaryIdx];
    const reordered = primary
      ? [primary, ...contacts.filter((_, i) => i !== primaryIdx)]
      : [...contacts];
    return reordered
      .map((c) => ({ name: stripThaiTitle(c.name), phone: (c.phone || "").trim() || null }))
      .filter((c) => c.name || c.phone);
  }, [contacts, primaryIdx]);
  const contactsJson = useMemo(() => JSON.stringify(cleanContacts), [cleanContacts]);
  const addContact = (c: Contact) =>
    setContacts((prev) => [...prev, c]);
  const updateContact = (i: number, patch: Partial<Contact>) =>
    setContacts((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const promoteContact = (i: number) =>
    setContacts((prev) => {
      if (i <= 0 || i >= prev.length) return prev;
      const next = [...prev];
      const [picked] = next.splice(i, 1);
      next.unshift(picked);
      return next;
    });
  // Inline "add resident" form shown at the bottom of the contacts list.
  const [addingOpen, setAddingOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const canSubmitAdd = !!(addName.trim() || addPhone.trim());
  const submitAddContact = () => {
    if (!canSubmitAdd) return;
    addContact({ name: stripThaiTitle(addName), phone: addPhone.trim() || null });
    setAddName("");
    setAddPhone("");
    setAddingOpen(false);
  };
  const cancelAddContact = () => {
    setAddName("");
    setAddPhone("");
    setAddingOpen(false);
  };

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
  const [sizeCodes, setSizeCodes] = useState<string[]>(() =>
    prospect.interest_sizes ? prospect.interest_sizes.split(",").map((s) => s.trim()).filter(Boolean) : []
  );
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
            interest_sizes: sizeCodes.length ? sizeCodes.join(",") : null,
          }),
        });
        setReasonsSavedAt(Date.now());
        setTimeout(() => setReasonsSavedAt(null), 1500);
      } catch (e) {
        console.error("auto-save reasons failed", e);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [reasonCodes, reasonNote, sizeCodes, prospect.id]);

  // Auto-save visit + line tab fields (interest, note, contact, house number).
  // Skips GPS — that's only captured when user explicitly "visits" (on mount).
  // Snapshot the initial prospect values so we only PATCH fields that actually
  // changed; otherwise a spurious effect fire (e.g. React StrictMode remount
  // preserving our guard ref) would send `interest` back to the server, which
  // treats any `interest` in the body as a visit event.
  const initialVisitRef = useRef({
    interest: prospect.interest ?? null,
    interest_type: prospect.interest_type ?? null,
    note: prospect.note || "",
    house_number: prospect.house_number || "",
    contact_time: prospect.contact_time || "",
    contactsJson,
  });
  const [visitSavedAt, setVisitSavedAt] = useState<number | null>(null);
  useEffect(() => {
    const timer = setTimeout(async () => {
      const init = initialVisitRef.current;
      const nextHouse = houseNumber.trim();
      const nextContactTime = contactHours.length ? [...contactHours].sort((a, b) => a - b).join(",") : "";
      const nextInterestType = interest === "interested" ? interestType : null;

      const patch: Record<string, unknown> = {};
      if (interest !== init.interest) patch.interest = interest;
      if (nextInterestType !== init.interest_type) patch.interest_type = nextInterestType;
      if (note !== init.note) patch.note = note;
      if (nextHouse !== init.house_number) patch.house_number = nextHouse || null;
      if (nextContactTime !== init.contact_time) patch.contact_time = nextContactTime || null;
      if (contactsJson !== init.contactsJson) patch.contacts = cleanContacts;

      if (Object.keys(patch).length === 0) return;

      try {
        await apiFetch(`/api/prospects/${prospect.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        initialVisitRef.current = {
          interest,
          interest_type: nextInterestType,
          note,
          house_number: nextHouse,
          contact_time: nextContactTime,
          contactsJson,
        };
        setVisitSavedAt(Date.now());
        setTimeout(() => setVisitSavedAt(null), 1500);
        onRefresh();
      } catch (e) {
        console.error("auto-save visit failed", e);
      }
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interest, interestType, note, houseNumber, contactHours, contactsJson, prospect.id]);
  const [saving, setSaving] = useState(false);
  const [creatingLead, setCreatingLead] = useState(false);
  // When >1 contact lives at this house, seeker must pick ONE for the lead.
  const [leadContactIdx, setLeadContactIdx] = useState(0);
  const [leadIdLocal, setLeadIdLocal] = useState<number | null>(prospect.lead_id);
  const [linePickerOpen, setLinePickerOpen] = useState(false);
  // Seed from JOIN data (line_display_name / line_picture_url) when present,
  // so the card renders the profile on first paint instead of flashing the
  // "เลือก LINE" button and then swapping after an async fetch.
  const [linkedLine, setLinkedLine] = useState<{ display_name: string; picture_url: string | null } | null>(
    prospect.line_id && (prospect.line_display_name || prospect.line_picture_url)
      ? { display_name: prospect.line_display_name || "", picture_url: prospect.line_picture_url }
      : null
  );
  const [returnInfo, setReturnInfo] = useState<{ note: string | null; created_by_name: string | null; created_at: string } | null>(null);
  const [returnBackNote, setReturnBackNote] = useState("");
  // Local mirror of prospect.returned_at so the UI flips out of the returned
  // state immediately after the seeker clicks "ส่งข้อมูลกลับไปที่ลีด" —
  // without waiting for the parent list to re-fetch and re-render this modal
  // with fresh props.
  const [localReturnedAt, setLocalReturnedAt] = useState<string | null>(prospect.returned_at);

  useEffect(() => {
    // Skip fetch if the JOIN already gave us profile data on mount.
    if (!prospect.line_id || linkedLine) return;
    apiFetch(`/api/line-users?line_user_id=${encodeURIComponent(prospect.line_id)}`).then((u: { display_name: string; picture_url: string | null } | null) => {
      if (u) setLinkedLine({ display_name: u.display_name || "", picture_url: u.picture_url });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospect.line_id]);

  // Auto-fill contact name from the LINE display name when we have no name yet.
  // Runs both on initial fetch (pre-existing line_id) and when the user picks a
  // LINE profile from the picker.
  useEffect(() => {
    if (linkedLine?.display_name && !contactName.trim()) {
      setContactName(linkedLine.display_name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedLine]);

  // If this prospect was returned from sales, fetch the latest
  // returned_to_prospect activity so we can show the reason on STEP-3.
  useEffect(() => {
    if (!prospect.lead_id || !localReturnedAt) { setReturnInfo(null); return; }
    apiFetch(`/api/leads/${prospect.lead_id}/activities`).then((acts: Array<{ activity_type: string; note: string | null; created_by_name: string | null; created_at: string }>) => {
      const r = acts.find((a) => a.activity_type === "returned_to_prospect");
      if (r) setReturnInfo({ note: r.note, created_by_name: r.created_by_name, created_at: r.created_at });
    }).catch(() => {});
  }, [prospect.lead_id, localReturnedAt]);

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
          contacts: cleanContacts,
          house_number: houseNumber.trim() || null,
          contact_time: contactHours.length ? [...contactHours].sort((a, b) => a - b).join(",") : null,
          visit_lat: loc?.lat ?? null,
          visit_lng: loc?.lng ?? null,
        }),
      });
      onSaved();
    } catch (e) {
      console.error(e);
      dialog.toast({ message: "บันทึกไม่สำเร็จ", variant: "danger" });
    } finally {
      setSaving(false);
    }
  }

  type VisitChoice = {
    key: string;
    label: string;
    interest: NonNullable<Prospect["interest"]>;
    type: Prospect["interest_type"];
    color: string;        // classes applied when active (filled)
    idle: string;         // classes applied when inactive (colored border hint)
    icon: "new" | "upgrade" | "undecided" | "not_home" | "not_interested";
  };

  const renderChoiceIcon = (kind: VisitChoice["icon"]) => {
    switch (kind) {
      case "new":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        );
      case "upgrade":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75" />
          </svg>
        );
      case "undecided":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
          </svg>
        );
      case "not_home":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        );
      case "not_interested":
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
    }
  };
  const visitChoices: VisitChoice[] = [
    { key: "interested-new", label: "สนใจ - ติดตั้ง", interest: "interested", type: "new", color: "bg-green-600 border-green-600 text-white", idle: "bg-white border-green-500 text-green-700 hover:bg-green-50", icon: "new" },
    { key: "interested-upgrade", label: "สนใจ - Upgrade", interest: "interested", type: "upgrade", color: "bg-blue-600 border-blue-600 text-white", idle: "bg-white border-blue-500 text-blue-700 hover:bg-blue-50", icon: "upgrade" },
    { key: "undecided", label: "ยังไม่ตัดสินใจ", interest: "undecided", type: null, color: "bg-amber-500 border-amber-500 text-white", idle: "bg-white border-amber-400 text-amber-700 hover:bg-amber-50", icon: "undecided" },
    { key: "not_home", label: "ไม่อยู่บ้าน", interest: "not_home", type: null, color: "bg-amber-500 border-amber-500 text-white", idle: "bg-white border-amber-400 text-amber-700 hover:bg-amber-50", icon: "not_home" },
    { key: "not_interested", label: "ไม่สนใจ", interest: "not_interested", type: null, color: "bg-red-500 border-red-500 text-white", idle: "bg-white border-red-400 text-red-700 hover:bg-red-50", icon: "not_interested" },
  ];

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
        {houseNumber || "-"}
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
          Line
        </button>
        <button
          type="button"
          onClick={() => setModalTab("people")}
          className={`flex-1 pb-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            modalTab === "people" ? "text-primary border-primary" : "text-gray-400 border-transparent hover:text-gray-600"
          }`}
        >
          สมาชิก
        </button>
        <button
          type="button"
          onClick={() => setModalTab("visit")}
          className={`flex-1 pb-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            modalTab === "visit" ? "text-primary border-primary" : "text-gray-400 border-transparent hover:text-gray-600"
          }`}
        >
          ความสนใจ
        </button>
        <button
          type="button"
          onClick={() => setModalTab("reasons")}
          className={`flex-1 pb-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            modalTab === "reasons" ? "text-primary border-primary" : "text-gray-400 border-transparent hover:text-gray-600"
          }`}
        >
          ส่งต่อ
        </button>
      </div>

      <div className="flex-1">
      {modalTab === "line" ? (
        <div className="flex flex-col items-center gap-6 py-6">
          <img src="/logos/logo-sena.png" alt="SENA SOLAR" className="h-12 w-auto" />

          {/* QR block — single clean card, no heavy borders */}
          <div className="flex flex-col items-center gap-3">
            <div className="text-xs font-medium tracking-wider uppercase text-gray-400">
              สแกนเพื่อเพิ่ม LINE
            </div>
            <img
              src="/api/line-qr"
              alt="LINE QR"
              className="w-56 h-56 rounded-2xl p-3 bg-white ring-1 ring-gray-200"
            />
          </div>

          {/* Linked profile or picker — minimal row */}
          <div className="w-56">
            {linkedLine ? (
              <div className="flex items-center gap-2.5 py-1.5">
                {linkedLine.picture_url ? (
                  <img src={linkedLine.picture_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gray-200 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{linkedLine.display_name || "LINE User"}</div>
                  <div className="inline-flex items-center gap-0.5 text-[10px] text-[#06C755] font-medium">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17l-3.88-3.88a1 1 0 10-1.41 1.41l4.58 4.59a1 1 0 001.42 0l10.59-10.59a1 1 0 10-1.41-1.41L9 16.17z" /></svg>
                    เชื่อมกับบ้านนี้แล้ว
                  </div>
                </div>
                <button
                  type="button"
                  title="ยกเลิกการเชื่อม"
                  onClick={async () => {
                    const ok = await dialog.confirm({
                      title: "ยกเลิกการเชื่อม LINE",
                      message: "ยกเลิกการเชื่อม LINE ของบ้านนี้?",
                      variant: "danger",
                      confirmText: "ยกเลิกการเชื่อม",
                    });
                    if (!ok) return;
                    await apiFetch(`/api/prospects/${prospect.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ line_id: null }),
                    });
                    setLinkedLine(null);
                    onRefresh();
                  }}
                  className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setLinePickerOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg border border-gray-200 bg-white text-[#06C755] text-sm font-medium hover:bg-gray-50 active:scale-[0.98] transition"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.44 3.317V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                </svg>
                + Add Profile
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
      ) : modalTab === "people" ? (
        <div className="flex flex-col gap-4 py-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 block mb-2">บ้านเลขที่</label>
            <div className="relative">
              <svg className="w-4 h-4 text-primary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
              </svg>
              <input
                type="text"
                value={houseNumber}
                onChange={(e) => setHouseNumber(e.target.value)}
                placeholder="เช่น 52/167"
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 block mb-2">
              กรุณาเลือกผู้ติดต่อหลัก
            </div>
            <div className="space-y-2.5">
              {contacts.map((c, i) => {
                const isPrimary = i === primaryIdx;
                return (
                <div
                  key={i}
                  onClick={() => { if (!isPrimary) setPrimaryIdx(i); }}
                  className={`rounded-xl border-2 bg-white p-2 space-y-1.5 transition-colors ${
                    isPrimary
                      ? "border-amber-400 cursor-default"
                      : "border-gray-200 cursor-pointer hover:border-gray-300"
                  }`}
                >
                  <div className="relative">
                    <svg className="w-4 h-4 text-indigo-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                    </svg>
                    <input
                      type="text"
                      value={c.name || ""}
                      onChange={(e) => updateContact(i, { name: e.target.value || null })}
                      placeholder="ชื่อ-นามสกุล"
                      className={`w-full h-10 pl-9 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary ${
                        isPrimary ? "pr-24" : "pr-3"
                      }`}
                    />
                    {isPrimary && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                        ผู้ติดต่อหลัก
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <svg className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.05-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.24 1.05l-2.21 2.17z" />
                    </svg>
                    <input
                      type="tel"
                      value={c.phone || ""}
                      onChange={(e) => updateContact(i, { phone: e.target.value || null })}
                      placeholder="เบอร์โทร"
                      className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
                );
              })}
              {addingOpen ? (
                <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2">
                  <div className="text-[11px] font-medium text-primary">เพิ่มผู้อยู่อาศัยใหม่</div>
                  <div className="relative">
                    <svg className="w-4 h-4 text-indigo-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                    </svg>
                    <input
                      type="text"
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submitAddContact(); if (e.key === "Escape") cancelAddContact(); }}
                      autoFocus
                      placeholder="ชื่อ-นามสกุล"
                      className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="relative">
                    <svg className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.05-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.24 1.05l-2.21 2.17z" />
                    </svg>
                    <input
                      type="tel"
                      value={addPhone}
                      onChange={(e) => setAddPhone(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submitAddContact(); if (e.key === "Escape") cancelAddContact(); }}
                      placeholder="เบอร์โทร (ไม่บังคับ)"
                      className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" onClick={cancelAddContact} className="h-8 px-3 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                      ยกเลิก
                    </button>
                    <button type="button" onClick={submitAddContact} disabled={!canSubmitAdd} className="h-8 px-3 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90">
                      เพิ่ม
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingOpen(true)}
                  className="w-full h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 font-medium hover:text-primary hover:border-primary hover:bg-primary/5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  เพิ่มผู้อยู่อาศัย
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
      <>
      <div className="space-y-4">
        {modalTab === "visit" && <>
        <div>
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
                  className={`h-11 rounded-lg border text-sm font-semibold transition-colors ${active ? c.color : c.idle}`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {interest === "interested" && (
          <Field label="ขนาดที่สนใจ (เลือกได้หลายข้อ)">
            <div className="flex flex-wrap gap-2">
              {[
                { code: "3", label: "3 kW" },
                { code: "5", label: "5 kW" },
                { code: "7", label: "7 kW" },
                { code: "10", label: "10 kW" },
                { code: "bat", label: "+ Battery" },
              ].map((s) => {
                const on = sizeCodes.includes(s.code);
                return (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() =>
                      setSizeCodes((prev) => (prev.includes(s.code) ? prev.filter((x) => x !== s.code) : [...prev, s.code]))
                    }
                    className={`h-9 px-3.5 rounded-lg border text-sm font-semibold transition-colors ${on
                      ? s.code === "bat"
                        ? "bg-green-600 border-green-600 text-white"
                        : "bg-primary border-primary text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"}`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        <Field label="เหตุผลที่สนใจ (เลือกได้หลายข้อ)">
          <div className="flex flex-wrap gap-1.5">
            {[
              { code: "save_bill", label: "ประหยัดค่าไฟ" },
              { code: "sell_back", label: "ขายไฟคืน" },
              { code: "tax_deduction", label: "ลดหย่อนภาษี" },
              { code: "daytime_usage", label: "เปิดแอร์ทั้งวัน" },
              { code: "pet_ac", label: "แอร์ให้สัตว์เลี้ยง" },
              { code: "elderly_care", label: "ดูแลผู้สูงอายุ" },
              { code: "has_ev", label: "ชาร์จ EV" },
              { code: "environment", label: "รักษ์โลก" },
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
                  className={`h-7 px-2.5 rounded-full border text-xs font-semibold transition-colors ${
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
        </Field>

        <Field label="บันทึก (optional)">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="รายละเอียดเพิ่มเติม / เหตุผลอื่นๆ จากลูกค้า..."
            className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm resize-none"
          />
        </Field>
        </>}

        {modalTab === "reasons" && <>
        {returnInfo && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-amber-900">ถูกส่งกลับจากทีมขาย</div>
                <div className="text-xs text-amber-700 mt-0.5">
                  {returnInfo.created_by_name || "Sales"}
                  {" · "}
                  {new Date(returnInfo.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                </div>
                {returnInfo.note ? (
                  <div className="mt-2 text-sm text-gray-800 whitespace-pre-wrap break-words">{returnInfo.note}</div>
                ) : (
                  <div className="mt-2 text-xs italic text-amber-600">ไม่ได้ระบุเหตุผล</div>
                )}
              </div>
            </div>
          </div>
        )}
        <Field label="เวลาที่สะดวกให้ติดต่อลูกค้า">
          <div className="space-y-2">
            {([
              { label: "เช้า", hours: [8, 9, 10, 11, 12] },
              { label: "บ่าย", hours: [13, 14, 15, 16, 17, 18, 19] },
            ] as const).map((group) => (
              <div key={group.label}>
                <div className="text-[11px] font-medium text-gray-400 mb-1">{group.label}</div>
                <div className="grid grid-cols-4 gap-1.5">
                  {group.hours.map((h) => {
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
              </div>
            ))}
          </div>
          <div className="mt-1.5 text-[11px] text-gray-400">เลือกได้หลายช่วง — ใช้เตือนเวลาติดตามต่อ</div>
        </Field>

        {/* Convert prospect → lead for the sales team — always uses the
            primary contact (cleanContacts[0], mirrored from primaryIdx). */}
        {(() => {
          const picked = cleanContacts[0] || { name: null, phone: null };
          const hasContact = !!(picked.phone || prospect.line_id);
          const isInterested = interest === "interested";
          const canCreate = isInterested && hasContact;
          const isReturnedHere = !!localReturnedAt && !!leadIdLocal;
          const reason = !isInterested
            ? "ต้องเลือก \"สนใจ - ติดตั้ง\" หรือ \"สนใจ - Upgrade\" ก่อน"
            : !hasContact
              ? "ต้องมีเบอร์โทรหรือ LINE อย่างน้อย 1 อย่าง"
              : "";
          return (
        <div className="pt-2 border-t border-gray-100 space-y-2">
          {isReturnedHere && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-amber-700 block mb-1">
                บันทึกให้ทีมขาย <span className="text-red-500">*</span>
              </label>
              <textarea
                value={returnBackNote}
                onChange={(e) => setReturnBackNote(e.target.value)}
                rows={3}
                placeholder="เช่น ติดต่อได้แล้ว เปลี่ยนเบอร์ใหม่ 089-xxx, นัดทีมขายโทรตอนบ่าย 2..."
                className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 focus:outline-none focus:border-amber-500 text-sm resize-none"
              />
              <div className="text-[11px] text-amber-600 mt-1">ข้อความนี้จะไปเป็น activity บนลีดให้ทีมขายเห็น</div>
            </div>
          )}
          <button
            type="button"
            disabled={creatingLead || !canCreate || (isReturnedHere && !returnBackNote.trim())}
            title={reason || (isReturnedHere && !returnBackNote.trim() ? "กรอกบันทึกให้ทีมขายก่อน" : undefined)}
            onClick={async () => {
              if (creatingLead || !canCreate) return;
              const hasExistingLead = !!leadIdLocal;
              const confirmMsg = isReturnedHere
                ? `ส่งข้อมูลกลับไปให้ทีมขายติดตามต่อ (ลีด #${leadIdLocal})?`
                : hasExistingLead
                ? "ซิงก์ข้อมูลล่าสุดไปที่ลีดเดิม?"
                : "สร้างข้อมูลลีดให้ฝ่ายขายจากบ้านหลังนี้?";
              const ok = await dialog.confirm({
                title: isReturnedHere ? "ส่งกลับให้ทีมขาย" : hasExistingLead ? "ซิงก์ข้อมูลไปที่ลีด" : "สร้างข้อมูลลีด",
                message: confirmMsg,
                variant: isReturnedHere ? "warning" : hasExistingLead ? "info" : "success",
                confirmText: isReturnedHere ? "ส่งกลับให้ทีมขาย" : hasExistingLead ? "ซิงก์ข้อมูล" : "สร้างลีด",
              });
              if (!ok) return;
              setCreatingLead(true);
              try {
                const interestTypeMap: Record<string, string> = { new: "ลูกค้าใหม่", upgrade: "Upgrade" };
                const customerType = interestType && interestTypeMap[interestType] ? interestTypeMap[interestType] : null;
                // Seeker-only context that has no direct column on leads — fold
                // into `requirement` so sales sees it on the pre-survey screen.
                const existingSolarBits = [
                  hasExistingSolar(prospect)
                    ? [
                        "มี Solar อยู่แล้ว",
                        prospect.installed_kw ? `${prospect.installed_kw} kW` : "",
                        prospect.installed_product ? `(${prospect.installed_product})` : "",
                      ].filter(Boolean).join(" ")
                    : "",
                  prospect.existing_solar && !hasExistingSolar(prospect) ? `Solar: ${prospect.existing_solar}` : "",
                ].filter(Boolean);
                const sizeLabel = (c: string) => (c === "bat" ? "+Battery" : `${c} kW`);
                const requirement = [
                  sizeCodes.length ? `ขนาดที่สนใจ: ${sizeCodes.map(sizeLabel).join(", ")}` : "",
                  reasonCodes.length ? `เหตุผลที่สนใจ: ${reasonCodes.join(", ")}` : "",
                  reasonNote ? `รายละเอียด: ${reasonNote}` : "",
                  contactHours.length ? `ติดต่อได้: ${[...contactHours].sort((a,b)=>a-b).map(h=>`${h}:00`).join(", ")}` : "",
                  ...existingSolarBits,
                ].filter(Boolean).join("\n");
                const preAppliances = hasEvCharger(prospect) ? "ev" : null;
                const payload = {
                  full_name: (picked.name || prospect.full_name || prospect.house_number || "ลูกค้าจาก Seeker").trim(),
                  phone: picked.phone || prospect.phone || null,
                  project_id: prospect.project_id || null,
                  installation_address: houseNumber.trim() || prospect.house_number || null,
                  customer_type: customerType,
                  source: "seeker",
                  note: note.trim() || null,
                  requirement: requirement || null,
                  pre_appliances: preAppliances,
                  line_id: prospect.line_id || null,
                };

                let leadId: number;
                if (hasExistingLead && leadIdLocal) {
                  // Sync existing lead — overwrite fields with latest prospect data.
                  // If the lead was previously returned, reactivate it by moving
                  // status back to 'pre_survey' so sales picks it up again.
                  const syncPayload = isReturnedHere
                    ? { ...payload, status: "pre_survey" }
                    : payload;
                  await apiFetch(`/api/leads/${leadIdLocal}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(syncPayload),
                  });
                  leadId = leadIdLocal;
                } else {
                  const created = await apiFetch("/api/leads", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  leadId = created?.id;
                  // Store the lead_id on the prospect so re-clicking syncs
                  // instead of duplicating.
                  if (leadId) {
                    try {
                      await apiFetch(`/api/prospects/${prospect.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ lead_id: leadId }),
                      });
                    } catch {}
                  }
                }
                if (leadId) setLeadIdLocal(leadId);
                if (isReturnedHere) {
                  // Log as an "other" contact activity so it appears in the
                  // lead's log with the standard styling, but prefix the note
                  // with a clear marker so sales sees why this lead came back
                  // into their queue.
                  if (returnBackNote.trim()) {
                    try {
                      await apiFetch(`/api/leads/${leadId}/activities`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          activity_type: "other",
                          note: `ลีดถูกส่งกลับมาที่ทีมขายอีกครั้ง · ${returnBackNote.trim()}`,
                        }),
                      });
                    } catch {}
                  }
                  // Clear the returned flag on the prospect so the card drops
                  // out of the "ถูกส่งกลับ" tab and back into the normal blue
                  // "LEAD #N" synced state.
                  try {
                    await apiFetch(`/api/prospects/${prospect.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ returned_at: null }),
                    });
                  } catch {}
                  setReturnInfo(null);
                  setReturnBackNote("");
                  setLocalReturnedAt(null);
                }
                onRefresh();
                dialog.toast({
                  message: isReturnedHere
                    ? `ส่งข้อมูลลีด #${leadId} กลับให้ทีมขายแล้ว`
                    : hasExistingLead
                    ? `ซิงก์ลีด #${leadId} สำเร็จ`
                    : `สร้างลีด #${leadId} สำเร็จ`,
                  variant: "success",
                });
              } catch (e) {
                dialog.alert({
                  title: leadIdLocal ? "ซิงก์ไม่สำเร็จ" : "สร้างลีดไม่สำเร็จ",
                  message: e instanceof Error ? e.message : "เกิดข้อผิดพลาด",
                  variant: "danger",
                });
              } finally {
                setCreatingLead(false);
              }
            }}
            className={`w-full h-11 rounded-lg text-sm font-semibold disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 ${
              !canCreate
                ? "bg-gray-200 text-gray-500"
                : isReturnedHere
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : leadIdLocal
                ? "bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {creatingLead ? (
              <>
                <div className={`w-4 h-4 border-2 rounded-full animate-spin ${isReturnedHere ? "border-white/30 border-t-white" : leadIdLocal ? "border-indigo-300 border-t-indigo-700" : "border-white/30 border-t-white"}`} />
                {isReturnedHere ? "กำลังส่งกลับ…" : leadIdLocal ? "กำลังซิงก์…" : "กำลังสร้าง…"}
              </>
            ) : isReturnedHere ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span>ส่งข้อมูลกลับไปที่ลีด #{leadIdLocal}</span>
              </>
            ) : leadIdLocal ? (
              <>
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </span>
                <span>สร้างลีดแล้ว · #{leadIdLocal}</span>
                <span className="text-indigo-400 text-xs font-normal">(กดเพื่อซิงก์ข้อมูล)</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                สร้างข้อมูลลีดให้ฝ่ายขาย
              </>
            )}
          </button>
          <div className="mt-1.5 text-[11px] text-gray-400">
            {!canCreate
              ? reason
              : isReturnedHere
                ? "กลับไปเป็นลีดใหม่ ทีมขายจะได้เห็นในรายการอีกครั้ง"
                : leadIdLocal
                ? `ลีดนี้สร้างแล้ว — กดอีกครั้งเพื่อซิงก์ข้อมูลล่าสุด`
                : "ข้อมูลลูกค้าจะถูกส่งต่อให้ฝ่ายขายสำรวจพื้นที่"}
          </div>
        </div>
          );
        })()}
        </>}
      </div>

      </>
      )}
      </div>

      {/* Step navigation — mirrors the PreSurvey sub-step footer */}
      {(() => {
        const order: Array<typeof modalTab> = ["line", "people", "visit", "reasons"];
        const idx = order.indexOf(modalTab);
        const prev = idx > 0 ? order[idx - 1] : null;
        const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
        return (
          <div className="mt-4 flex gap-2">
            {prev && (
              <button
                type="button"
                onClick={() => setModalTab(prev)}
                className="flex-1 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                ย้อนกลับ
              </button>
            )}
            {next && (
              <button
                type="button"
                onClick={() => setModalTab(next)}
                className="flex-1 h-11 rounded-lg text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-colors flex items-center justify-center gap-1"
              >
                ถัดไป
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            )}
          </div>
        );
      })()}

    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-stretch md:items-center justify-center md:p-4" onClick={onClose}>
      <div
        className="bg-white w-full md:max-w-md md:rounded-2xl md:h-[720px] md:max-h-[90vh] overflow-y-auto flex flex-col"
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
          <ModalCloseButton onClick={onClose} />
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
