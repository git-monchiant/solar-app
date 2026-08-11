"use client";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, PhoneIcon, PlusIcon, UserIcon, XIcon } from "@/components/ui/icons";
import { formatTHB } from "@/lib/utils/formatters";

import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ListPageHeader from "@/components/layout/ListPageHeader";
import LinePickerModal from "@/components/modal/LinePickerModal";
import { useDialog } from "@/components/ui/Dialog";
import ModalBase from "@/components/ui/ModalBase";
import { type ChannelValue } from "@/lib/constants/channels";
import SourceTag from "@/components/SourceTag";
import { getSourceStyle } from "@/lib/source-tag";
import ChannelPickerModal from "@/components/shared/ChannelPickerModal";
import PaymentSection from "@/components/payment/PaymentSection";
import DocumentScanner from "@/components/customer/DocumentScanner";
import { INTEREST_REASONS, PRIMARY_REASON_LABEL } from "@/lib/constants/info-labels";

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
  prospect_source: string | null;
  tag: string | null;
  project_alias: string | null;
  line_display_name: string | null;
  line_picture_url: string | null;
  lead_payment_confirmed?: boolean | number | null;
  lead_pre_total_price?: number | null;
  lead_pre_doc_no?: string | null;
  created_at: string;
};

type Contact = { name: string | null; phone: string | null; email?: string | null };

// Strip Thai title prefixes at the start of a name (นาย/นาง/นางสาว/น.ส./ด.ช./ด.ญ.).
// Longer prefixes first so "นางสาว" matches before "นาง".
function stripThaiTitle(s: string | null | undefined): string | null {
  if (!s) return null;
  const cleaned = s
    .trim()
    .replace(/^(นางสาว|นาง|นาย|น\.ส\.?|ด\.ช\.?|ด\.ญ\.?)\s*/u, "")
    .trim();
  return cleaned || null;
}

function parseContacts(raw: string | null): Contact[] {
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
    label: "ติดตาม",
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

// Lenient substring search: split query on whitespace, drop punctuation
// (".", ",", "-", "_", "/") on both sides, then every token must appear.
// Lets "รามอินทรา กม 9" match a name like "เสนา วิลเลจ รามอินทรา กม.9".
function matchesSearch(text: string | null | undefined, query: string): boolean {
  if (!query) return true;
  const normalize = (s: string) => s.toLowerCase().replace(/[\s.,\-_/]+/g, "");
  const haystack = normalize(text || "");
  return query.split(/\s+/).filter(Boolean).every((tok) => haystack.includes(normalize(tok)));
}

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


function LineIcon({ className = "w-4 h-4 text-emerald-500 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-label="เชื่อม LINE แล้ว">
      <title>เชื่อม LINE แล้ว</title>
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.44 3.317V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}

type ProjectCard = {
  id: number;
  name: string;
  assignee: string | null;
  prospect_count: number;
  interested_count: number;
  lead_created_count: number;
  not_interested_count: number;
  pending_count: number;
  visited_count: number;
  channels: string | null; // comma-separated distinct channels of prospects in this project
  is_pinned?: number | boolean;
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
  // URL uses ?pid=N (project_id) — name lookup from projectCards. Filtering
  // by id avoids false negatives when prospects.project_name has different
  // spacing/dashes from projects.name.
  const projectIdParam = searchParams.get("pid") || "";
  const projectFilterId = projectIdParam ? parseInt(projectIdParam) : 0;
  // Optional channel scope carried from the project-landing search — when
  // present, the prospect list inside the project hides everything except
  // prospects with this channel.
  const channelFilter = searchParams.get("ch") || "";
  const setProjectFilterId = (id: number, ch?: string | null) => {
    if (id) {
      const qs = ch ? `?pid=${id}&ch=${encodeURIComponent(ch)}` : `?pid=${id}`;
      router.push(`/seeker${qs}`);
    } else router.push("/seeker");
  };
  const projectFilter = projectCards.find((p) => p.id === projectFilterId)?.name || "";
  const [projectSearch, setProjectSearch] = useState<string>("");
  const [houseMatches, setHouseMatches] = useState<Prospect[]>([]);
  const [houseMatchesLoading, setHouseMatchesLoading] = useState(false);
  // Cross-project house lookup: fires when the landing search starts to look
  // like a house number (contains a digit + at least 2 chars). Lets seekers
  // verify "is 99/118 already in some other project?" before creating a dup.
  useEffect(() => {
    const q = projectSearch.trim();
    if (q.length < 2 || !/\d/.test(q)) { setHouseMatches([]); return; }
    setHouseMatchesLoading(true);
    const timer = setTimeout(() => {
      apiFetch(`/api/prospects?house_q=${encodeURIComponent(q)}&limit=20`)
        .then((rows: Prospect[]) => setHouseMatches(rows || []))
        .catch(() => setHouseMatches([]))
        .finally(() => setHouseMatchesLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [projectSearch]);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [creatingNew] = useState(false);
  const [channelPickerOpen, setChannelPickerOpen] = useState(false);

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
    if (projectFilterId) refresh(projectFilterId);
    else { setProspects([]); setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFilterId, hydrated]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (search) localStorage.setItem("seekerSearch", search);
    else localStorage.removeItem("seekerSearch");
  }, [search]);

  function refresh(filterId?: number) {
    setLoading(true);
    const effective = filterId ?? projectFilterId;
    const qs = new URLSearchParams({ t: String(Date.now()) });
    if (effective) qs.set("project_id", String(effective));
    apiFetch(`/api/prospects?${qs.toString()}`, { cache: "no-store" })
      .then(setProspects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  // When the project search text resolves to a known channel key (the1,
  // senxpm, ...), we want both: (a) only include projects that have that
  // channel, and (b) make their counts reflect ONLY prospects of that channel.
  const matchedChannelKey = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return null;
    // Try to resolve via SourceTag normalization. Accept either the raw key
    // (e.g. "the1") or the rendered label (e.g. "The1", "SENX PM").
    for (const p of projectCards) {
      if (!p.channels) continue;
      for (const ch of p.channels.split(",").filter(Boolean)) {
        const style = getSourceStyle(ch);
        if (ch.toLowerCase() === q || style.label.toLowerCase() === q) return ch;
        if (ch.toLowerCase().includes(q) || style.label.toLowerCase().includes(q)) return ch;
      }
    }
    return null;
  }, [projectCards, projectSearch]);

  // If search matches a channel, fetch counts of prospects (per project) that
  // have that channel — used to override the project card totals.
  const [channelCounts, setChannelCounts] = useState<Record<number, number>>({});
  useEffect(() => {
    if (!matchedChannelKey) { setChannelCounts({}); return; }
    apiFetch(`/api/prospects?channel=${encodeURIComponent(matchedChannelKey)}`).then((rows: Prospect[]) => {
      const counts: Record<number, number> = {};
      for (const r of rows) if (r.project_id != null) counts[r.project_id] = (counts[r.project_id] || 0) + 1;
      setChannelCounts(counts);
    }).catch(console.error);
  }, [matchedChannelKey]);

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projectCards;
    if (matchedChannelKey) {
      // Only projects that actually have prospects with this channel — and
      // override prospect_count + interested/not_interested with channel-only
      // counts so the card reflects what the user is searching for.
      return projectCards
        .filter((p) => (channelCounts[p.id] || 0) > 0)
        .map((p) => ({
          ...p,
          prospect_count: channelCounts[p.id] || 0,
          // Sub-status counts aren't channel-filtered here — easier to zero
          // them out than show numbers that exceed prospect_count.
          interested_count: 0,
          lead_created_count: 0,
          not_interested_count: 0,
          pending_count: channelCounts[p.id] || 0,
          visited_count: 0,
        }));
    }
    return projectCards.filter((p) => matchesSearch(p.name, q));
  }, [projectCards, projectSearch, matchedChannelKey, channelCounts]);

  const scopedByProject = useMemo(() => {
    if (!projectFilterId) return prospects;
    let list = prospects.filter((p) => p.project_id === projectFilterId);
    // Carry the channel filter from the project landing into the prospect list.
    if (channelFilter) {
      list = list.filter((p) => {
        if (p.prospect_source === channelFilter) return true;
        if (!p.tag) return false;
        try {
          const arr = JSON.parse(p.tag);
          return Array.isArray(arr) && arr.includes(channelFilter);
        } catch { return false; }
      });
    }
    return list;
  }, [prospects, projectFilterId, channelFilter]);

  // Any prospect that's been promoted into a lead is treated as "interested"
  // for the purposes of the tab filter and badge counts — even if their raw
  // interest value is undecided/not_interested. This keeps the "สนใจ" count
  // consistent with the lead_created total on the project rollup.
  const isInterestedTab = (p: Prospect) => cardStatus(p) === "interested" || (p.lead_id != null && !isReturnedProspect(p));

  const counts = useMemo(() => {
    const c = { all: scopedByProject.length, todo: 0, returned: 0, interested: 0, not_interested: 0 };
    for (const p of scopedByProject) {
      if (isReturnedProspect(p)) { c.returned++; continue; }
      if (isInterestedTab(p)) c.interested++;
      const s = cardStatus(p);
      if (s === "pending" || s === "contacted") {
        if (p.lead_id == null) c.todo++;
      } else if (s === "not_interested") {
        if (p.lead_id == null) c.not_interested++;
      }
    }
    return c;
  }, [scopedByProject]);

  const filtered = useMemo(() => {
    let list = scopedByProject;
    if (tab === "returned") list = list.filter((p) => isReturnedProspect(p));
    else if (tab === "todo") list = list.filter((p) => {
      if (isReturnedProspect(p)) return false;
      if (p.lead_id != null) return false;
      const s = cardStatus(p);
      return s === "pending" || s === "contacted";
    });
    else if (tab === "interested") list = list.filter((p) => !isReturnedProspect(p) && isInterestedTab(p));
    else if (tab === "not_interested") list = list.filter((p) => !isReturnedProspect(p) && p.lead_id == null && cardStatus(p) === "not_interested");
    else if (tab !== "all") list = list.filter((p) => !isReturnedProspect(p) && cardStatus(p) === tab);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          matchesSearch(p.full_name, q) ||
          matchesSearch(p.house_number, q) ||
          (p.phone || "").includes(q) ||
          matchesSearch(p.project_name, q)
      );
    }
    return [...list].sort(compareHouse);
  }, [scopedByProject, tab, search]);

  if (!projectFilterId) {
    return (
      <ProjectLanding
        projects={filteredProjects}
        totalCount={projectCards.length}
        loading={projectsLoading}
        search={projectSearch}
        onSearchChange={setProjectSearch}
        onSelect={(id) => setProjectFilterId(id, matchedChannelKey)}
        houseMatches={houseMatches}
        houseMatchesLoading={houseMatchesLoading}
        projectNameById={Object.fromEntries(projectCards.map((p) => [p.id, p.name]))}
        onOpenProspect={(p) => { if (p.project_id) setProjectFilterId(p.project_id, null); setEditing(p); }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ListPageHeader
        title={projectFilter}
        subtitle="LEADS SEEKER"
        backHref="/seeker"
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

      {channelFilter && (
        <div className="px-3 md:px-5 pt-2 flex items-center gap-2 text-xs">
          <span className="text-gray-500">กรองเฉพาะ:</span>
          <SourceTag value={channelFilter} size="xs" />
          <button
            type="button"
            onClick={() => router.push(`/seeker?pid=${projectFilterId}`)}
            className="text-gray-400 hover:text-red-500 transition-colors"
            title="ยกเลิกตัวกรอง"
          >× ยกเลิก</button>
        </div>
      )}
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
                      {p.project_alias && p.project_alias.trim() && (
                        <div className="text-xxs text-gray-500 truncate mt-0.5 pl-5" title={p.project_alias}>
                          {p.project_alias}
                        </div>
                      )}
                    </div>
                    {(() => {
                      if (isReturned) {
                        return (
                          <span className="shrink-0 text-xxs px-1.5 py-0.5 rounded-full border whitespace-nowrap bg-amber-200 text-amber-900 border-amber-400 font-semibold">
                            ส่งกลับ #{p.lead_id}
                          </span>
                        );
                      }
                      if (isSynced) {
                        return (
                          <span className="shrink-0 text-xxs px-1.5 py-0.5 rounded-full border whitespace-nowrap bg-blue-200 text-blue-800 border-blue-300 font-semibold">
                            LEAD #{p.lead_id}
                          </span>
                        );
                      }
                      const count = p.visit_count ?? 0;
                      if (status === "contacted" || status === "not_interested") {
                        return (
                          <span className={`shrink-0 text-xxs px-1.5 py-0.5 rounded-full border whitespace-nowrap ${CARD_STATUS[status].badge}`}>
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
                        <UserIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" strokeWidth={2} />
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
                      <PhoneIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">{p.phone || <span className="text-gray-300">-</span>}</span>
                      {p.line_id && (
                        <>
                          <span className="text-gray-400">,</span>
                          <LineIcon />
                        </>
                      )}
                    </div>
                  )}

                  {/* Row 3.5: deposit received — only when lead has paid the booking fee */}
                  {!!p.lead_payment_confirmed && (p.lead_pre_total_price ?? 0) > 0 && (
                    <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5 min-w-0">
                      <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 9v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="tabular-nums">฿{formatTHB(Number(p.lead_pre_total_price))}</span>
                    </div>
                  )}

                  {/* Row 4: indicators (Channel / Solar / EV / Upgrade) — split equally */}
                  {(() => {
                    const chips: React.ReactNode[] = [];
                    // First-touch source + any additional touchpoint tags.
                    const source: string | null = p.prospect_source || null;
                    const extraTags: string[] = (() => {
                      try {
                        if (p.tag) {
                          const arr = JSON.parse(p.tag);
                          if (Array.isArray(arr)) return arr.filter(Boolean);
                        }
                      } catch {}
                      return [];
                    })();
                    const allChips = [source, ...extraTags].filter((c, i, arr) => !!c && arr.indexOf(c) === i) as string[];
                    const isUpgrade = status === "interested" && p.interest_type === "upgrade";
                    const showSolar = hasExistingSolar(p);
                    const showEv = hasEvCharger(p);
                    if (allChips.length > 0 || isUpgrade || showSolar || showEv) {
                      chips.push(
                        <span key="channel" className="inline-flex items-center gap-0.5 py-0.5 shrink-0">
                          {allChips.map((c) => (
                            <SourceTag key={c} value={c} size="xs" />
                          ))}
                          {isUpgrade && (
                            <span title="Scale Up" className="inline-flex items-center text-blue-700 shrink-0 -ml-0.5">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M12 19V5m0 0l-7 7m7-7l7 7" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                          )}
                          {showSolar && (
                            <span title={p.installed_kw != null && p.installed_kw > 0 ? `Solar ${p.installed_kw} kW` : "Solar"} className="inline-flex items-center text-blue-700 shrink-0 -ml-0.5">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M4 18L6.5 6h11L20 18H4z" strokeLinejoin="round" />
                                <path d="M4 18h16" strokeLinecap="round" />
                                <path d="M12 6v12" />
                                <path d="M5.2 12h13.6" />
                              </svg>
                            </span>
                          )}
                          {showEv && (
                            <span title="EV Charger" className="inline-flex items-center text-purple-700 shrink-0 -ml-0.5">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M4 17V8a2 2 0 012-2h8a2 2 0 012 2v9" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M3 17h12" strokeLinecap="round" />
                                <path d="M16 11h2a2 2 0 012 2v3a1.5 1.5 0 01-3 0v-1" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M9 9l-2 4h3l-1 3" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                          )}
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
          key={editing.id || "draft"}
          prospect={editing}
          projects={projectCards}
          existingProspects={prospects}
          onClose={() => setEditing(null)}
          onRefresh={() => refresh()}
          onJumpToProspect={(p) => setEditing(p)}
        />
      )}

      <button
        type="button"
        disabled={creatingNew}
        onClick={() => setChannelPickerOpen(true)}
        title="สร้าง Prospect ใหม่"
        className="fixed bottom-24 md:bottom-8 right-5 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center disabled:opacity-60"
      >
        {creatingNew ? (
          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <PlusIcon className="w-7 h-7" strokeWidth={2.5} />
        )}
      </button>

      {channelPickerOpen && (
        <ChannelPickerModal
          onClose={() => setChannelPickerOpen(false)}
          onPick={(code) => {
            setChannelPickerOpen(false);
            setEditing({
              id: 0,
              project_id: projectFilterId || null,
              project_name: projectFilter || null,
              seq: null,
              house_number: null,
              full_name: null,
              phone: null,
              app_status: null,
              existing_solar: null,
              installed_kw: null,
              installed_product: null,
              ev_charger: null,
              interest: null,
              interest_type: null,
              note: null,
              visited_by: null,
              visited_by_name: null,
              visited_at: null,
              visit_count: 0,
              visit_lat: null,
              visit_lng: null,
              line_id: null,
              line_display_name: null,
              line_picture_url: null,
              contact_time: null,
              interest_reasons: null,
              interest_reason_note: null,
              interest_sizes: null,
              returned_at: null,
              lead_id: null,
              contacts: null,
              prospect_source: code,
              tag: null,
              project_alias: null,
              created_at: new Date().toISOString(),
            } as Prospect);
          }}
        />
      )}

    </div>
  );
}

const FAV_KEY = "seekerFavorites";

function ProjectLanding({
  projects,
  totalCount,
  loading,
  search,
  onSearchChange,
  onSelect,
  houseMatches,
  houseMatchesLoading,
  projectNameById,
  onOpenProspect,
}: {
  projects: ProjectCard[];
  totalCount: number;
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (id: number) => void;
  houseMatches: Prospect[];
  houseMatchesLoading: boolean;
  projectNameById: Record<number, string>;
  onOpenProspect: (p: Prospect) => void;
}) {
  const [favs, setFavs] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const saved = localStorage.getItem(FAV_KEY);
    if (!saved) return new Set();
    try { return new Set(JSON.parse(saved)); } catch { return new Set(); }
  });

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
      // Server-pinned projects always come first (e.g. "โครงการอื่นทั่วไป").
      const pa = !!a.is_pinned, pb = !!b.is_pinned;
      if (pa !== pb) return pa ? -1 : 1;
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
        {/^\d/.test(search.trim()) && search.trim().length >= 2 && (
          <div className="mb-3 rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <div className="text-xxs font-bold uppercase tracking-wider text-gray-500">
                บ้านที่ตรงกัน{houseMatchesLoading && " · กำลังค้น..."}
              </div>
              {houseMatches.length > 0 && (
                <span className="text-xxs text-gray-400 tabular-nums">{houseMatches.length} หลัง</span>
              )}
            </div>
            {houseMatches.length === 0 && !houseMatchesLoading ? (
              <div className="px-3 py-6 text-center text-xs text-gray-400">ไม่พบบ้านนี้ในระบบ — สร้างใหม่ได้</div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {houseMatches.map((p) => {
                  const projName = projectNameById[p.project_id || 0] || p.project_name || "—";
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onOpenProspect(p)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
                    >
                      <svg className="w-4 h-4 text-sky-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-gray-900 truncate">
                          {p.house_number}
                          <span className="ml-2 text-xxs font-normal text-gray-500">{projName}</span>
                        </div>
                        <div className="text-xxs text-gray-500 truncate">
                          {p.full_name || <span className="text-gray-400">(ยังไม่มีชื่อ)</span>}
                          {p.phone && <span> · {p.phone}</span>}
                        </div>
                      </div>
                      <ChevronRightIcon className="w-3.5 h-3.5 text-gray-300 shrink-0" strokeWidth={2} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-16">ไม่มีโครงการ</div>
        ) : (
          <>
          <div className="text-xs text-gray-500 mb-2 px-1 tabular-nums">
            {search.trim()
              ? <><span className="font-semibold text-gray-700">{projects.length}</span> / {totalCount} โครงการ</>
              : <><span className="font-semibold text-gray-700">{totalCount}</span> โครงการ</>
            }
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-200">
              {sortedProjects.map((p) => {
                const total = p.prospect_count || 0;
                const contacted = Math.max(0, total - p.interested_count - p.not_interested_count - p.pending_count);
                // lead_created is a *subset* of interested — split it out so
                // the bar shows the funnel: lead created (deepest green) vs
                // still-just-interested (regular green).
                const leadCreated = Math.min(p.lead_created_count || 0, p.interested_count);
                const interestedOnly = Math.max(0, p.interested_count - leadCreated);
                const pct = total === 0 ? 0 : Math.round(((total - p.pending_count) / total) * 100);
                const segments = [
                  { key: "lead_created", count: leadCreated, color: "bg-emerald-700", label: "สร้าง Lead" },
                  { key: "interested", count: interestedOnly, color: "bg-green-500", label: "สนใจ" },
                  { key: "contacted", count: contacted, color: "bg-amber-400", label: "ติดตาม" },
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
                      onClick={() => onSelect(p.id)}
                      className="flex-1 text-left py-3 pr-4 min-w-0 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <svg className="w-4 h-4 text-sky-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                      <div className="mt-1.5 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5 items-baseline justify-between">
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>ทั้งหมด {total}</span>
                          {leadCreated > 0 && <span className="text-emerald-700">สร้าง Lead {leadCreated}</span>}
                          {interestedOnly > 0 && <span className="text-green-600">สนใจ {interestedOnly}</span>}
                          {contacted > 0 && <span className="text-amber-600">ติดตาม {contacted}</span>}
                          {p.not_interested_count > 0 && <span className="text-red-600">ไม่สนใจ {p.not_interested_count}</span>}
                          {p.pending_count > 0 && <span className="text-gray-500">ยังไม่เยี่ยม {p.pending_count}</span>}
                        </div>
                        {p.assignee && (
                          <span className="text-gray-400 truncate ml-auto">
                            ผู้รับผิดชอบ: <span className="font-medium text-gray-600">{p.assignee.trim()}</span>
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

function VisitModal({ prospect, projects, existingProspects, onClose, onRefresh, onJumpToProspect }: { prospect: Prospect; projects: ProjectCard[]; existingProspects: Prospect[]; onClose: () => void; onRefresh: () => void; onJumpToProspect: (p: Prospect) => void }) {
  const dialog = useDialog();
  const [modalTab, setModalTab] = useState<"info" | "people" | "visit" | "line" | "reasons" | "payment" | "log">("info");
  // Collapsible step state for the timeline view in the "info" tab. Default is
  // all open so a returning seeker sees everything; clicking a step header
  // toggles its body.
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({
    house: true, contact: true, solar: true, line: true, time: true,
  });
  const toggleStep = (k: string) => setOpenSteps((p) => ({ ...p, [k]: !p[k] }));
  const [interest, setInterest] = useState<Prospect["interest"]>(prospect.interest);
  const [interestType, setInterestType] = useState<Prospect["interest_type"]>(prospect.interest_type);
  const [note, setNote] = useState(prospect.note || "");
  const [houseNumber, setHouseNumber] = useState(prospect.house_number || "");
  const [projectId, setProjectId] = useState<number | null>(prospect.project_id);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const selectedProject = projects.find((p) => p.id === projectId) || null;
  const projectName = selectedProject?.name ?? "";
  const isPinnedProject = !!selectedProject?.is_pinned;
  // Free-text alias — only shown when the picked project is pinned (the
  // "โครงการอื่นทั่วไป" catch-all bucket). Stored on prospects.project_alias
  // and displayed as a sub-line on the prospect card. For NEW prospects we
  // restore the last alias the seeker typed (kept in localStorage with a
  // 24-hour TTL) so a single event can be recorded on many houses without
  // retyping — but stale aliases from yesterday's event don't bleed in.
  const ALIAS_TTL_MS = 24 * 60 * 60 * 1000;
  const [customProjectName, setCustomProjectName] = useState<string>(() => {
    if (prospect.project_alias) return prospect.project_alias;
    if (prospect.id === 0 && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("seekerLastProjectAlias");
        if (raw) {
          const parsed = JSON.parse(raw) as { value: string; savedAt: number };
          if (parsed.value && Date.now() - parsed.savedAt < ALIAS_TTL_MS) {
            return parsed.value;
          }
          localStorage.removeItem("seekerLastProjectAlias");
        }
      } catch {
        localStorage.removeItem("seekerLastProjectAlias");
      }
    }
    return "";
  });
  // Persist whenever the alias changes under a pinned project so the next
  // draft picks it up automatically (within the 24h window).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isPinnedProject) return;
    const v = customProjectName.trim();
    if (v) {
      localStorage.setItem("seekerLastProjectAlias", JSON.stringify({ value: v, savedAt: Date.now() }));
    } else {
      localStorage.removeItem("seekerLastProjectAlias");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customProjectName, isPinnedProject]);
  // For draft prospects (clicked +, not yet POSTed), id is 0. After the first
  // valid auto-save we POST and then mirror the new id locally for subsequent
  // PATCHes — without re-mounting this modal.
  const [prospectId, setProspectId] = useState<number>(prospect.id);
  const isDraft = prospectId === 0;
  // First-touch source — set once on insert, never changes here.
  const prospectSource = (prospect.prospect_source as ChannelValue | null) || null;
  // Editable extra-touchpoint tags (JSON array).
  const [tagCodes, setTagCodes] = useState<ChannelValue[]>(() => {
    try {
      if (prospect.tag) {
        const arr = JSON.parse(prospect.tag);
        if (Array.isArray(arr)) return arr.filter(Boolean) as ChannelValue[];
      }
    } catch {}
    return [];
  });
  const tagsKey = tagCodes.join(",");
  const [visitChannelPickerOpen, setVisitChannelPickerOpen] = useState(false);
  const addTag = (c: ChannelValue) => {
    if (c === prospectSource) return; // source can't be added as a tag too
    setTagCodes((prev) => prev.includes(c) ? prev : [...prev, c]);
  };
  const removeTag = (c: ChannelValue) => {
    setTagCodes((prev) => prev.filter((x) => x !== c));
  };
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
      .map((c) => ({
        name: stripThaiTitle(c.name),
        phone: (c.phone || "").trim() || null,
        email: (c.email || "").trim() || null,
      }))
      .filter((c) => c.name || c.phone || c.email);
  }, [contacts, primaryIdx]);
  const contactsJson = useMemo(() => JSON.stringify(cleanContacts), [cleanContacts]);
  const addContact = (c: Contact) =>
    setContacts((prev) => [...prev, c]);
  const updateContact = (i: number, patch: Partial<Contact>) =>
    setContacts((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
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
  const [reasonNote] = useState(prospect.interest_reason_note || "");
  const [sizeCodes, setSizeCodes] = useState<string[]>(() =>
    prospect.interest_sizes ? prospect.interest_sizes.split(",").map((s) => s.trim()).filter(Boolean) : []
  );
  const [, setReasonsSavedAt] = useState<number | null>(null);
  const reasonsInitRef = useRef(true);

  // Auto-save reasons tab: debounced PATCH whenever chips or note change.
  // Gated on house_number + a real (non-draft) prospect id — drafts haven't
  // been POSTed yet so PATCH /api/prospects/0 would 404.
  useEffect(() => {
    if (reasonsInitRef.current) { reasonsInitRef.current = false; return; }
    if (!houseNumber.trim()) return;
    if (isDraft || !prospectId) return;
    const timer = setTimeout(async () => {
      try {
        await apiFetch(`/api/prospects/${prospectId}`, {
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
  }, [reasonCodes, reasonNote, sizeCodes, houseNumber, prospectId, isDraft]);

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
    tag: tagsKey,
    project_id: prospect.project_id,
    project_alias: prospect.project_alias || "",
    contactsJson,
  });
  const [, setVisitSavedAt] = useState<number | null>(null);
  useEffect(() => {
    const timer = setTimeout(async () => {
      const init = initialVisitRef.current;
      const nextHouse = houseNumber.trim();
      // Require house_number + at least one way to reach the customer (LINE link
      // or a contact with both name and phone). Empty shells / contactless
      // prospects pollute the seeker board.
      if (!nextHouse) return;
      const hasContact = !!linkedLine || cleanContacts.some((c) => c.name && c.phone);
      if (!hasContact) return;
      // Skip the save when the typed house_number would conflict with another
      // prospect in the same project. The unique index would 409 anyway and
      // the user already sees a warning chip — no point spamming the API.
      const normHouse = nextHouse.trim().toLowerCase().replace(/\s+/g, "");
      const conflict = existingProspects.some((p) =>
        p.id !== prospectId &&
        p.project_id === projectId &&
        (p.house_number || "").trim().toLowerCase().replace(/\s+/g, "") === normHouse
      );
      if (conflict) return;
      const nextContactTime = contactHours.length ? [...contactHours].sort((a, b) => a - b).join(",") : "";
      const nextInterestType = interest === "interested" ? interestType : null;

      const patch: Record<string, unknown> = {};
      if (interest !== init.interest) patch.interest = interest;
      if (nextInterestType !== init.interest_type) patch.interest_type = nextInterestType;
      if (note !== init.note) patch.note = note;
      if (nextHouse !== init.house_number) patch.house_number = nextHouse || null;
      if (nextContactTime !== init.contact_time) patch.contact_time = nextContactTime || null;
      if (tagsKey !== init.tag) patch.tag = tagCodes;
      if (projectId !== init.project_id) {
        patch.project_id = projectId;
        patch.project_name = projects.find((p) => p.id === projectId)?.name ?? null;
      }
      // Alias is independent of project_id — only meaningful when the picked
      // project is pinned, but we always trust the field if it changed.
      if (customProjectName.trim() !== (init.project_alias || "")) {
        patch.project_alias = customProjectName.trim() || null;
      }
      if (contactsJson !== init.contactsJson) patch.contacts = cleanContacts;

      if (Object.keys(patch).length === 0 && !isDraft) return;

      try {
        if (isDraft) {
          // First save for a draft — POST to create the row. Pass everything
          // we have so the server doesn't have to read the bare insert later.
          const created = await apiFetch(`/api/prospects`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: projectId,
              project_name: projects.find((p) => p.id === projectId)?.name ?? null,
              house_number: nextHouse,
              full_name: cleanContacts[0]?.name || null,
              phone: cleanContacts[0]?.phone || null,
              prospect_source: prospectSource,
              tag: tagCodes,
            }),
          }) as Prospect;
          setProspectId(created.id);
          // Apply remaining fields via PATCH so all the contacts / note / interest
          // also get persisted to the new row.
          await apiFetch(`/api/prospects/${created.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              note,
              contacts: cleanContacts,
              contact_time: nextContactTime || null,
              interest,
              interest_type: nextInterestType,
            }),
          });
        } else {
          await apiFetch(`/api/prospects/${prospectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
        }
        initialVisitRef.current = {
          interest,
          interest_type: nextInterestType,
          note,
          house_number: nextHouse,
          contact_time: nextContactTime,
          tag: tagsKey,
          project_id: projectId,
          project_alias: customProjectName.trim(),
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
  }, [interest, interestType, note, houseNumber, contactHours, contactsJson, tagsKey, projectId, customProjectName, isPinnedProject, prospectId, isDraft]);
  const [creatingLead, setCreatingLead] = useState(false);
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

  type VisitChoice = {
    key: string;
    label: string;
    interest: NonNullable<Prospect["interest"]>;
    type: Prospect["interest_type"];
    color: string;        // classes applied when active (filled)
    idle: string;         // classes applied when inactive (colored border hint)
    icon: "new" | "upgrade" | "undecided" | "not_home" | "not_interested";
  };

  const visitChoices: VisitChoice[] = [
    { key: "interested-new", label: "สนใจ - ติดตั้ง", interest: "interested", type: "new", color: "bg-green-600 border-green-600 text-white", idle: "bg-white border-green-500 text-green-700 hover:bg-green-50", icon: "new" },
    { key: "interested-upgrade", label: "สนใจ - Scale Up", interest: "interested", type: "upgrade", color: "bg-blue-600 border-blue-600 text-white", idle: "bg-white border-blue-500 text-blue-700 hover:bg-blue-50", icon: "upgrade" },
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
  const tagChipBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 24,
    minHeight: 24,
    maxHeight: 24,
    margin: 0,
    paddingTop: 0,
    paddingBottom: 0,
    borderWidth: 0,
    boxSizing: "border-box",
    lineHeight: 1,
    flexShrink: 0,
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };
  const title = (
    <div className="flex flex-col gap-1.5 min-w-0 flex-1 w-full">
      {/* Row 1: house number + flag icons + phone shortcut */}
      <div className="flex items-center gap-2 min-w-0 w-full">
        <span className="flex items-center gap-1.5 truncate min-w-0 flex-1">
          <svg className="w-5 h-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
          </svg>
          <span className="truncate">
            {houseNumber || <span className="text-gray-300">บ้านใหม่</span>}
          </span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {flagItems.map((i) => (
            <span key={i.key} title={i.title} className={i.on ? i.onCls : "text-gray-300"}>
              {i.icon}
            </span>
          ))}
        </span>
        {cleanContacts[0]?.phone && (
          <a
            href={`tel:${cleanContacts[0].phone}`}
            title={`โทร ${cleanContacts[0].phone}`}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 36, height: 36, minWidth: 36, minHeight: 36, borderRadius: "50%" }}
            className="shrink-0 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
          </a>
        )}
      </div>
      {/* Row 2: touchpoint chips (prospect_source + tag list + add button) */}
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        {prospectSource && (() => {
          const s = getSourceStyle(prospectSource);
          return (
            <span
              title="ช่องทางแรกที่พบ — แก้ไม่ได้"
              className={s.cls}
              style={{ ...tagChipBase, paddingLeft: 8, paddingRight: 8 }}
            >
              {s.label}
            </span>
          );
        })()}
        {tagCodes.map((c) => {
          const s = getSourceStyle(c);
          return (
            <button
              type="button"
              key={c}
              onClick={(e) => { e.stopPropagation(); removeTag(c); }}
              title={`คลิกเพื่อลบ ${s.label}`}
              className={`hover:opacity-80 ${s.cls}`}
              style={{ ...tagChipBase, paddingLeft: 8, paddingRight: 4, gap: 4 }}
            >
              {s.label}
              <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          );
        })}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setVisitChannelPickerOpen(true); }}
          title="เพิ่ม Touchpoint"
          className="text-gray-500 bg-gray-100 hover:bg-gray-200"
          style={{ ...tagChipBase, width: 24, minWidth: 24, maxWidth: 24, paddingLeft: 0, paddingRight: 0, fontSize: 0 }}
        >
          <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} style={{ display: "block" }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>
    </div>
  );

  // "ส่งต่อให้ฝ่ายขาย" content — extracted so it can be rendered inline at the
  // bottom of the Line tab (replaces the old standalone "ส่งต่อ" tab).
  const forwardSection = (
    <>
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
        <div className="space-y-1.5">
          {([
            { label: "เช้า", hours: [8, 9, 10, 11, 12] },
            { label: "บ่าย", hours: [13, 14, 15, 16, 17, 18, 19] },
          ] as const).map((group) => (
            <div key={group.label} className="flex items-center gap-2">
              <div className="text-xxs font-medium text-gray-400 w-7 shrink-0">{group.label}</div>
              <div className="grid grid-cols-7 gap-1 flex-1">
                {group.hours.map((h) => {
                  const on = contactHours.includes(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() =>
                        setContactHours((prev) => (prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]))
                      }
                      className={`h-7 rounded text-xxs font-semibold tabular-nums transition-colors ${
                        on
                          ? "bg-primary text-white border border-primary"
                          : "bg-white text-gray-700 border border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 text-xxs text-gray-400">เลือกได้หลายช่วง</div>
      </Field>

      {(() => {
        const picked = cleanContacts[0] || { name: null, phone: null };
        const hasContact = !!(picked.phone || prospect.line_id);
        const isInterested = interest === "interested";
        const canCreate = isInterested && hasContact;
        const isReturnedHere = !!localReturnedAt && !!leadIdLocal;
        const reason = !isInterested
          ? "ต้องเลือก \"สนใจ - ติดตั้ง\" หรือ \"สนใจ - Scale Up\" ก่อน"
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
                <div className="text-xxs text-amber-600 mt-1">ข้อความนี้จะไปเป็น activity บนลีดให้ทีมขายเห็น</div>
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
                  // Pass the short code straight through — lead.customer_type
                  // is now stored as 'new' / 'upgrade' to match the chip
                  // values in CustomerWizard, not Thai labels.
                  const customerType = interestType || null;
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
                    reasonCodes.length ? `เหตุผลที่สนใจ: ${reasonCodes.map(c => PRIMARY_REASON_LABEL[c] || c).join(", ")}` : "",
                    reasonNote ? `รายละเอียด: ${reasonNote}` : "",
                    contactHours.length ? `ติดต่อได้: ${[...contactHours].sort((a,b)=>a-b).map(h=>`${h}:00`).join(", ")}` : "",
                    ...existingSolarBits,
                  ].filter(Boolean).join("\n");
                  const preAppliances = hasEvCharger(prospect) ? "ev" : null;
                  const payload = {
                    full_name: (picked.name || prospect.full_name || prospect.house_number || "ลูกค้าจาก Seeker").trim(),
                    phone: picked.phone || prospect.phone || null,
                    email: picked.email || null,
                    project_id: prospect.project_id || null,
                    project_name: prospect.project_name || null,
                    project_alias: prospect.project_alias || null,
                    installation_address: houseNumber.trim() || prospect.house_number || null,
                    house_number: prospect.house_number || null,
                    customer_type: customerType,
                    // First-touch from the prospect's prospect_source. Fall
                    // back to "seeker" for legacy prospects that never had one.
                    source: prospect.prospect_source || "seeker",
                    // Carry over the editable tag array (additional
                    // touchpoints) — string is already JSON, the API accepts
                    // it as-is.
                    tag: prospect.tag || null,
                    note: note.trim() || null,
                    requirement: requirement || null,
                    pre_appliances: preAppliances,
                    line_id: prospect.line_id || null,
                  };

                  let leadId: number;
                  if (hasExistingLead && leadIdLocal) {
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
                    if (leadId) {
                      try {
                        await apiFetch(`/api/prospects/${prospectId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ lead_id: leadId }),
                        });
                      } catch {}
                    }
                  }
                  if (leadId) setLeadIdLocal(leadId);
                  if (isReturnedHere) {
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
                    try {
                      await apiFetch(`/api/prospects/${prospectId}`, {
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
                    <CheckIcon className="w-3 h-3" strokeWidth={3} />
                  </span>
                  <span>สร้างลีดแล้ว · #{leadIdLocal}</span>
                  <span className="text-indigo-400 text-xs font-normal">(กดเพื่อซิงก์ข้อมูล)</span>
                </>
              ) : (
                <>
                  <PlusIcon className="w-4 h-4" strokeWidth={2} />
                  สร้างข้อมูลลีดให้ฝ่ายขาย
                </>
              )}
            </button>
            <div className="mt-1.5 text-xxs text-gray-400">
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
    </>
  );

  return (
    <ModalBase onClose={onClose} title={title} size="xl">
      <div className="flex border-b border-gray-200 -mx-5 px-5 mb-2">
        <button
          type="button"
          onClick={() => setModalTab("info")}
          className={`flex-1 pb-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors inline-flex items-center justify-center gap-1.5 ${
            modalTab === "info" ? "text-primary border-primary" : "text-gray-400 border-transparent hover:text-gray-600"
          }`}
        >
          {linkedLine && (
            <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
              <CheckIcon className="w-2.5 h-2.5 text-white" strokeWidth={4} />
            </span>
          )}
          ข้อมูลลูกค้า
        </button>
        {leadIdLocal != null && (
          <button
            type="button"
            onClick={() => setModalTab("payment")}
            className={`flex-1 pb-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors inline-flex items-center justify-center gap-1.5 ${
              modalTab === "payment" ? "text-primary border-primary" : "text-gray-400 border-transparent hover:text-gray-600"
            }`}
          >
            {/* Match the LINE-linked checkmark style on the data tab —
                emerald circle with white check when payment confirmed, gray
                circle (same shape) when still unpaid. */}
            <span className={`w-4 h-4 rounded-full flex items-center justify-center ${prospect.lead_payment_confirmed ? "bg-emerald-500" : "bg-gray-300"}`}>
              <CheckIcon className="w-2.5 h-2.5 text-white" strokeWidth={4} />
            </span>
            รับเงินจอง
          </button>
        )}
        {/* Log tab — always last. Hidden for unsaved drafts (no prospect id
         * means no activity rows yet). */}
        {prospect.id > 0 && (
          <button
            type="button"
            onClick={() => setModalTab("log")}
            className={`flex-1 pb-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors inline-flex items-center justify-center gap-1.5 ${
              modalTab === "log" ? "text-primary border-primary" : "text-gray-400 border-transparent hover:text-gray-600"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Log
          </button>
        )}
      </div>

      <div className="flex-1">
      {modalTab === "info" && (
        <TimelineStep
          idx={0}
          total={4}
          title="ข้อมูลบ้าน"
          subtitle="โครงการ · บ้านเลขที่"
          summary={[projectName, houseNumber.trim()].filter(Boolean).join(" · ")}
          complete={!!projectId && !!houseNumber.trim()}
          expanded={!!openSteps.house}
          onToggle={() => toggleStep("house")}
          color="slate"
        >
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">โครงการ</label>
            <div className="flex items-center gap-2 h-8 pl-3 pr-1.5 rounded-lg border border-gray-200 bg-white">
              <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
              <span className="text-sm font-semibold text-gray-800 truncate min-w-0 flex-1">
                {projectName || <span className="text-gray-400 font-normal">ยังไม่เลือก</span>}
              </span>
              <button
                type="button"
                onClick={() => setProjectPickerOpen(true)}
                className="shrink-0 h-7 px-2.5 rounded-md text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
              >
                เปลี่ยน
              </button>
            </div>
          </div>

          {isPinnedProject && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">ระบุชื่อโครงการ / สถานที่</label>
              <input
                type="text"
                value={customProjectName}
                onChange={(e) => setCustomProjectName(e.target.value)}
                placeholder="เช่น หมู่บ้านสวยงาม ซอย 5"
                className="w-full h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">บ้านเลขที่</label>
            <div className="relative">
              <svg className="w-4 h-4 text-primary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
              </svg>
              <input
                type="text"
                value={houseNumber}
                onChange={(e) => setHouseNumber(e.target.value)}
                placeholder="เช่น 52/167"
                className="w-full h-8 pl-9 pr-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            {(() => {
              // Two modes:
              //  • Draft → full autocomplete (substring matches) so user can
              //    pick existing house instead of duplicating.
              //  • Edit  → only show EXACT-match conflict, since a unique
              //    index on (project_id, house_number) would otherwise let the
              //    PATCH fail silently with a 500.
              const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase().replace(/\s+/g, "");
              const q = norm(houseNumber);
              if (!q || q.length < 2) return null;
              if (!isDraft) {
                const conflict = existingProspects.find((p) =>
                  p.id !== prospectId &&
                  p.project_id === projectId &&
                  norm(p.house_number) === q
                );
                if (!conflict) return null;
                return (
                  <button
                    type="button"
                    onClick={() => onJumpToProspect(conflict)}
                    className="mt-2 w-full flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-left hover:bg-red-100 transition-colors"
                  >
                    <svg className="w-4 h-4 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-red-900">เลขนี้มีบ้านใช้อยู่แล้ว · บันทึกไม่ได้</div>
                      <div className="text-xxs text-red-700 truncate">
                        {conflict.house_number} · {conflict.full_name || "(ยังไม่มีชื่อ)"} · คลิกเพื่อเปิดบ้านนั้น
                      </div>
                    </div>
                  </button>
                );
              }
              const matches = existingProspects
                .filter((p) =>
                  p.id !== prospectId &&
                  p.project_id === projectId &&
                  norm(p.house_number).includes(q)
                )
                .slice(0, 6);
              if (matches.length === 0) return null;
              return (
                <div className="mt-2 rounded-lg border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100 shadow-sm">
                  <div className="px-3 py-1.5 bg-gray-50 text-xxs font-bold uppercase tracking-wider text-gray-500">
                    {matches.length} หลังที่ตรงกัน · คลิกเพื่อแก้ไข
                  </div>
                  {matches.map((dup) => {
                    const isExact = norm(dup.house_number) === q;
                    return (
                      <button
                        key={dup.id}
                        type="button"
                        onClick={() => onJumpToProspect(dup)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                          isExact ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-gray-50"
                        }`}
                      >
                        <svg className={`w-4 h-4 shrink-0 ${isExact ? "text-amber-600" : "text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs font-bold truncate ${isExact ? "text-amber-900" : "text-gray-900"}`}>
                            {dup.house_number}
                            {isExact && <span className="ml-1.5 text-xxs font-bold uppercase text-amber-700">มีอยู่แล้ว</span>}
                          </div>
                          <div className="text-xxs text-gray-500 truncate">
                            {dup.full_name || <span className="text-gray-400">(ยังไม่มีชื่อ)</span>}
                            {dup.phone && <span> · {dup.phone}</span>}
                          </div>
                        </div>
                        <ChevronRightIcon className="w-3.5 h-3.5 text-gray-300 shrink-0" strokeWidth={2} />
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>

        </TimelineStep>
      )}
      {modalTab === "info" && (
        <TimelineStep
          idx={1}
          total={4}
          title="ผู้ติดต่อ"
          subtitle="ผู้อยู่อาศัย"
          summary={[contacts[0]?.name, contacts[0]?.phone].filter(Boolean).join(" · ")}
          complete={cleanContacts.some((c) => c.name && c.phone)}
          expanded={!!openSteps.contact}
          onToggle={() => toggleStep("contact")}
          color="slate"
        >
          {projectPickerOpen && (
            <ProjectPickerById
              value={projectId}
              options={projects}
              onChange={(id) => { setProjectId(id); setProjectPickerOpen(false); }}
              onClose={() => setProjectPickerOpen(false)}
            />
          )}
          {visitChannelPickerOpen && (
            <ChannelPickerModal
              title="เพิ่ม tag ช่องทาง"
              onClose={() => setVisitChannelPickerOpen(false)}
              onPick={(code) => { addTag(code); setVisitChannelPickerOpen(false); }}
            />
          )}

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 block mb-1.5">
              กรุณาเลือกผู้ติดต่อหลัก
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {contacts.map((c, i) => {
                const isPrimary = i === primaryIdx;
                return (
                <div
                  key={i}
                  className={`rounded-xl border-2 bg-white overflow-hidden transition-colors ${
                    isPrimary ? "border-amber-400" : "border-gray-200"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setPrimaryIdx(i)}
                    disabled={isPrimary}
                    className={`w-full flex items-center gap-2 px-3 h-8 text-xs font-semibold transition-colors ${
                      isPrimary
                        ? "bg-amber-100 text-amber-700 cursor-default"
                        : "bg-gray-50 text-gray-500 hover:bg-amber-50 hover:text-amber-700"
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full border-2 inline-flex items-center justify-center shrink-0 ${
                      isPrimary ? "border-amber-500" : "border-gray-300"
                    }`}>
                      {isPrimary && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                    </span>
                    {isPrimary ? "ผู้ติดต่อหลัก" : "ตั้งเป็นผู้ติดต่อหลัก"}
                  </button>
                  <div className="p-2 space-y-1.5">
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-indigo-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={2} />
                    <input
                      type="text"
                      value={c.name || ""}
                      onChange={(e) => updateContact(i, { name: e.target.value || null })}
                      placeholder="ชื่อ-นามสกุล"
                      className="w-full h-8 pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="relative">
                    <PhoneIcon className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="tel"
                      value={c.phone || ""}
                      onChange={(e) => updateContact(i, { phone: e.target.value || null })}
                      placeholder="เบอร์โทร"
                      className="w-full h-8 pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="relative">
                    <svg className="w-4 h-4 text-amber-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                    <input
                      type="email"
                      value={c.email || ""}
                      onChange={(e) => updateContact(i, { email: e.target.value || null })}
                      placeholder="อีเมล (ไม่บังคับ)"
                      className="w-full h-8 pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  </div>
                </div>
                );
              })}
              {addingOpen ? (
                <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2">
                  <div className="text-xxs font-medium text-primary">เพิ่มผู้อยู่อาศัยใหม่</div>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-indigo-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={2} />
                    <input
                      type="text"
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submitAddContact(); if (e.key === "Escape") cancelAddContact(); }}
                      autoFocus
                      placeholder="ชื่อ-นามสกุล"
                      className="w-full h-8 pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="relative">
                    <PhoneIcon className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="tel"
                      value={addPhone}
                      onChange={(e) => setAddPhone(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submitAddContact(); if (e.key === "Escape") cancelAddContact(); }}
                      placeholder="เบอร์โทร (ไม่บังคับ)"
                      className="w-full h-8 pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
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
                  <PlusIcon className="w-4 h-4" strokeWidth={2.5} />
                  เพิ่มผู้อยู่อาศัย
                </button>
              )}
            </div>
          </div>
        </TimelineStep>
      )}
      {modalTab === "info" && (
      <TimelineStep
        idx={2}
        total={4}
        title="ความสนใจ Solar"
        subtitle="ระดับความสนใจ · เหตุผล · ขนาด"
        summary={interest === "interested" ? `สนใจ${interestType === "upgrade" ? " - Scale Up" : interestType === "new" ? " - ติดตั้ง" : ""}` : interest === "not_interested" ? "ไม่สนใจ" : ""}
        complete={!!interest}
        expanded={!!openSteps.solar}
        onToggle={() => toggleStep("solar")}
        color="slate"
      >
        {true && <>
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
            <div className="grid grid-cols-2 gap-2">
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
                    className={`h-11 rounded-lg border text-sm font-semibold transition-colors ${on
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
            {INTEREST_REASONS.map((r) => {
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
      </TimelineStep>
      )}
      {modalTab === "info" ? (
        <TimelineStep
          idx={3}
          total={4}
          title="LINE & ส่งต่อ"
          subtitle="เพิ่ม LINE OA · เวลาติดต่อ · สร้างลีด"
          summary={leadIdLocal ? `สร้างลีดแล้ว #${leadIdLocal}` : (linkedLine ? "เชื่อม LINE แล้ว" : "")}
          complete={!!leadIdLocal}
          expanded={!!openSteps.line}
          onToggle={() => toggleStep("line")}
          color="green"
        >
        <div className="flex flex-col items-center gap-3">
          {/* QR block — single clean card, no heavy borders */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="text-xs font-medium tracking-wider uppercase text-gray-400">
              สแกนเพื่อเพิ่ม LINE
            </div>
            <img
              src="/api/line-qr"
              alt="LINE QR"
              className="w-56 h-56 rounded-2xl p-2 bg-white ring-1 ring-gray-200"
            />
            <div className="text-sm font-bold tracking-wider text-gray-700">
              SENA SOLAR ENERGY
            </div>
          </div>

          {/* Linked profile or picker — minimal row */}
          <div className="w-56">
            {linkedLine ? (
              <div className="flex items-center gap-2.5 py-1.5">
                {linkedLine.picture_url ? (
                  <img src={linkedLine.picture_url} alt="" className="w-9 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-8 rounded-full bg-gray-200 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{linkedLine.display_name || "LINE User"}</div>
                  <div className="inline-flex items-center gap-0.5 text-xxs text-[#06C755] font-medium">
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
                    await apiFetch(`/api/prospects/${prospectId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ line_id: null }),
                    });
                    setLinkedLine(null);
                    onRefresh();
                  }}
                  className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50 transition-colors"
                >
                  <XIcon className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setLinePickerOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 h-8 rounded-lg border border-gray-200 bg-white text-[#06C755] text-sm font-medium hover:bg-gray-50 active:scale-[0.98] transition"
              >
                <LineIcon className="w-4 h-4 shrink-0" />
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

          {/* Forward section (contact hours + create lead button) */}
          <div className="border-t border-gray-100 pt-4 space-y-3 w-full">
            {forwardSection}
          </div>
        </TimelineStep>
      ) : null}

      {modalTab === "payment" && leadIdLocal != null && (
        <LeadDepositPaymentTab
          leadId={leadIdLocal}
          customerName={contacts[0]?.name || prospect.full_name || ""}
          lineId={prospect.line_id}
          onConfirmed={() => onRefresh()}
        />
      )}

      {modalTab === "log" && prospect.id > 0 && (
        <ProspectLogTab prospectId={prospect.id} />
      )}
      </div>

      {/* Step navigation — mirrors the PreSurvey sub-step footer */}
      {(() => {
        const order: Array<typeof modalTab> = ["info", ...(leadIdLocal != null ? ["payment" as const] : []), ...(prospect.id > 0 ? ["log" as const] : [])];
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
                <ChevronLeftIcon className="w-4 h-4" strokeWidth={2} />
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
                <ChevronRightIcon className="w-4 h-4" strokeWidth={2} />
              </button>
            )}
          </div>
        );
      })()}

    </ModalBase>
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


function ProjectPickerById({
  value,
  options,
  onChange,
  onClose,
}: {
  value: number | null;
  options: ProjectCard[];
  onChange: (id: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <ModalBase onClose={onClose} title="เลือกโครงการ">
      <div className="flex flex-col gap-3">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาโครงการ..."
          className="shrink-0 w-full h-11 px-3 rounded-lg border border-gray-300 bg-white text-sm"
        />
        <div className="-mx-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">ไม่พบโครงการ</div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange(p.id)}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm flex items-center justify-between hover:bg-gray-50 ${
                  value === p.id ? "text-primary font-semibold bg-primary/5" : "text-gray-700"
                }`}
              >
                <span className="truncate">{p.name}</span>
                {value === p.id && (
                  <CheckIcon className="w-5 h-5 shrink-0 ml-2" strokeWidth={2.5} />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </ModalBase>
  );
}

// Vertical timeline step with collapsible body. Each section of the prospect
// info tab is wrapped in one of these so the seeker sees their workflow as a
// 5-step progression with checkmarks for completed sections.
function TimelineStep({
  title, subtitle, summary, expanded, onToggle, color = "gray", children,
}: {
  idx: number;
  total: number;
  title: string;
  subtitle?: string;
  summary?: string;
  complete?: boolean;
  expanded: boolean;
  onToggle: () => void;
  color?: "sky" | "indigo" | "amber" | "green" | "gray" | "slate";
  children: React.ReactNode;
}) {
  const tones: Record<string, { badge: string; text: string; bar: string }> = {
    sky:    { badge: "bg-sky-100",     text: "text-sky-700",     bar: "bg-sky-50" },
    indigo: { badge: "bg-indigo-100",  text: "text-indigo-700",  bar: "bg-indigo-50" },
    amber:  { badge: "bg-amber-100",   text: "text-amber-700",   bar: "bg-amber-50" },
    green:  { badge: "bg-emerald-200", text: "text-emerald-800", bar: "bg-emerald-200" },
    gray:   { badge: "bg-gray-200",    text: "text-gray-800",    bar: "bg-gray-200" },
    slate:  { badge: "bg-teal-100",    text: "text-teal-800",    bar: "bg-teal-100" },
  };
  const c = tones[color] || tones.gray;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-start text-left gap-2 px-3 py-2 rounded-lg ${c.bar} hover:brightness-95 transition`}
      >
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-bold ${c.text}`}>{title}</div>
          {subtitle && <div className="text-xxs text-gray-500">{subtitle}</div>}
          {!expanded && summary && (
            <div className="text-xs text-gray-700 truncate mt-0.5">{summary}</div>
          )}
        </div>
        <svg className={`w-4 h-4 ${c.text} shrink-0 mt-0.5 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {expanded && (
        <div className="space-y-3 pt-3 pb-5">
          {children}
        </div>
      )}
    </div>
  );
}

// Booking-deposit payment for a lead that was promoted from this prospect.
// Mirrors PreSurveyStep — collects the customer-info fields the receipt
// requires (id card, install address, etc.) above the standard PaymentSection
// so the seeker can take the 1,000 baht deposit without leaving the modal.
type LeadDepositInfo = {
  id: number;
  full_name: string;
  email: string | null;
  id_card_number: string | null;
  id_card_address: string | null;
  installation_address: string | null;
  project_name: string | null;
  pre_total_price: number | null;
  pre_doc_no: string | null;
  pre_slip_url: string | null;
  payment_confirmed: boolean | number | null;
};

const DEFAULT_DEPOSIT_AMOUNT = 1000;

// Activity timeline for a prospect — shows everything the audit table captured
// (created, interest changes, lead link, house edits, etc.) newest-first.
type ProspectActivity = {
  id: number;
  activity_type: string;
  title: string | null;
  note: string | null;
  old_value: string | null;
  new_value: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
};

const ACTIVITY_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  created:               { label: "สร้าง Prospect", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /> },
  interest_change:       { label: "สนใจ", cls: "bg-amber-50 text-amber-700 ring-amber-200", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /> },
  interest_type_change:  { label: "ประเภทความสนใจ", cls: "bg-amber-50 text-amber-700 ring-amber-200", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" /> },
  note_change:           { label: "หมายเหตุ", cls: "bg-blue-50 text-blue-700 ring-blue-200", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /> },
  lead_link:             { label: "ผูก/ปลด Lead", cls: "bg-indigo-50 text-indigo-700 ring-indigo-200", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /> },
  house_change:          { label: "ย้ายบ้าน/โครงการ", cls: "bg-teal-50 text-teal-700 ring-teal-200", icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" /> },
};

function fmtRelativeThai(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const diffSec = Math.round((Date.now() - t) / 1000);
  if (diffSec < 60) return "เมื่อกี้นี้";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} นาทีที่แล้ว`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ชม.ที่แล้ว`;
  if (diffSec < 7 * 86400) return `${Math.floor(diffSec / 86400)} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

function ProspectLogTab({ prospectId }: { prospectId: number }) {
  const [items, setItems] = useState<ProspectActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Loading is reset when switching to a different prospect id.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    apiFetch(`/api/prospects/${prospectId}/activities`)
      .then((rows: ProspectActivity[]) => { if (!cancelled) setItems(rows); })
      .catch((e) => console.error("load prospect activities failed", e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [prospectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (items.length === 0) {
    return <div className="py-10 text-center text-sm text-gray-400">ยังไม่มีกิจกรรม</div>;
  }

  return (
    <div className="py-2 space-y-2">
      {items.map((it) => {
        const meta = ACTIVITY_META[it.activity_type] || {
          label: it.activity_type,
          cls: "bg-gray-50 text-gray-700 ring-gray-200",
          icon: <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
        };
        const showDiff = it.old_value !== null || it.new_value !== null;
        return (
          <div key={it.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-white border border-gray-100">
            <span className={`shrink-0 w-7 h-7 rounded-full ring-1 flex items-center justify-center ${meta.cls}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {meta.icon}
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-800">{meta.label}</span>
                {it.title && <span className="text-xs text-gray-500 truncate">{it.title}</span>}
              </div>
              {showDiff && (
                <div className="mt-1 text-xs text-gray-600">
                  <span className="line-through text-gray-400">{it.old_value ?? "—"}</span>
                  <span className="mx-1.5 text-gray-300">→</span>
                  <span className="text-gray-800 font-semibold">{it.new_value ?? "—"}</span>
                </div>
              )}
              {it.note && <div className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">{it.note}</div>}
              <div className="mt-1 flex items-center gap-2 text-xxs text-gray-400">
                <span>{fmtRelativeThai(it.created_at)}</span>
                {it.created_by_name && (<><span>·</span><span>โดย {it.created_by_name}</span></>)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeadDepositPaymentTab({
  leadId,
  customerName,
  lineId,
  onConfirmed,
}: {
  leadId: number;
  customerName: string;
  lineId: string | null;
  onConfirmed: () => void;
}) {
  const [lead, setLead] = useState<LeadDepositInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [idCardNumber, setIdCardNumber] = useState("");
  const [idCardAddress, setIdCardAddress] = useState("");
  const [installAddress, setInstallAddress] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const initialRef = useRef({ full_name: "", email: "", id_card_number: "", id_card_address: "", installation_address: "" });

  const firstLoadRef = useRef(true);
  const refresh = useCallback(async (resetForm: boolean) => {
    if (firstLoadRef.current) setLoading(true);
    try {
      const d: LeadDepositInfo = await apiFetch(`/api/leads/${leadId}`);
      // Default the deposit amount to 1,000 the first time this tab is opened
      // — avoids an empty PaymentSection that the seeker would otherwise have
      // to set elsewhere.
      if ((d.pre_total_price ?? 0) <= 0) {
        await apiFetch(`/api/leads/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pre_total_price: DEFAULT_DEPOSIT_AMOUNT }),
        });
        d.pre_total_price = DEFAULT_DEPOSIT_AMOUNT;
      }
      setLead(d);
      // Only seed the form on first load — later refreshes (after slip upload
      // / payment confirm) must NOT clobber whatever the user is currently
      // typing or just typed; that's what was causing the form + slip preview
      // to flash on every onVerified callback.
      if (resetForm) {
        setFullName(d.full_name || "");
        setEmail(d.email || "");
        setIdCardNumber(d.id_card_number || "");
        setIdCardAddress(d.id_card_address || "");
        setInstallAddress(d.installation_address || "");
        initialRef.current = {
          full_name: d.full_name || "",
          email: d.email || "",
          id_card_number: d.id_card_number || "",
          id_card_address: d.id_card_address || "",
          installation_address: d.installation_address || "",
        };
      }
    } catch (e) {
      console.error("load lead failed", e);
    } finally {
      if (firstLoadRef.current) {
        setLoading(false);
        firstLoadRef.current = false;
      }
    }
  }, [leadId]);

  useEffect(() => { refresh(true); }, [refresh]);

  // Debounced autosave for the customer-info fields so the form behaves like
  // the rest of the prospect modal (no Save button to remember).
  useEffect(() => {
    if (loading) return;
    const init = initialRef.current;
    const patch: Record<string, unknown> = {};
    if (fullName !== init.full_name) patch.full_name = fullName.trim() || null;
    if (email !== init.email) patch.email = email.trim() || null;
    if (idCardNumber !== init.id_card_number) patch.id_card_number = idCardNumber.trim() || null;
    if (idCardAddress !== init.id_card_address) patch.id_card_address = idCardAddress.trim() || null;
    if (installAddress !== init.installation_address) patch.installation_address = installAddress.trim() || null;
    if (Object.keys(patch).length === 0) return;
    const timer = setTimeout(async () => {
      try {
        await apiFetch(`/api/leads/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        initialRef.current = {
          full_name: fullName,
          email: email,
          id_card_number: idCardNumber,
          id_card_address: idCardAddress,
          installation_address: installAddress,
        };
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 1500);
      } catch (e) {
        console.error("save customer info failed", e);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [fullName, email, idCardNumber, idCardAddress, installAddress, leadId, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!lead) {
    return <div className="py-8 text-center text-sm text-gray-400">โหลดข้อมูลลีดไม่สำเร็จ</div>;
  }

  const amount = Number(lead.pre_total_price || DEFAULT_DEPOSIT_AMOUNT);
  const confirmed = !!lead.payment_confirmed;

  const labelCls = "text-xs font-semibold uppercase tracking-wider text-gray-500 block mb-1.5";
  const requiredMark = <span className="text-red-500">*</span>;
  const inputCls = "w-full h-8 pl-9 pr-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary";
  // Address textarea — taller (2 rows) so wrapped Thai addresses are readable on mobile
  const addrTextareaCls = "w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none";
  const iconCls = "w-4 h-4 text-primary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none";
  // Icon sits at the top of the textarea instead of vertical center so it
  // doesn't drift to the middle of a 2-line address
  const iconTopCls = "w-4 h-4 text-primary absolute left-3 top-3 pointer-events-none";

  return (
    <div className="py-2 space-y-3">
      <DocumentScanner
        fields={["id_card_number", "id_card_address", "installation_address"]}
        onResult={(patch) => {
          if (patch.id_card_number) setIdCardNumber(patch.id_card_number);
          if (patch.id_card_address) setIdCardAddress(patch.id_card_address);
          if (patch.installation_address) setInstallAddress(patch.installation_address);
        }}
      />
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">ข้อมูลออกใบเสร็จ</div>
        {savedAt && <span className="text-xxs text-emerald-600 font-semibold">บันทึกแล้ว</span>}
      </div>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>ชื่อ-นามสกุล {requiredMark}</label>
          <div className="relative">
            <UserIcon className={iconCls} strokeWidth={2} />
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>อีเมล {requiredMark}</label>
          <div className="relative">
            <svg className={iconCls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@mail.com" className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>เลขบัตรประชาชน {requiredMark}</label>
          <div className="relative">
            <svg className={iconCls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5h16.5v15H3.75v-15zM7.5 12h.008v.008H7.5V12zm3 0h6m-6 3h6" />
            </svg>
            <input
              type="text"
              inputMode="numeric"
              value={idCardNumber}
              onChange={(e) => setIdCardNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 13))}
              className={`${inputCls} font-mono tabular-nums`}
              placeholder="13 หลัก"
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>ที่อยู่ตามบัตร {requiredMark}</label>
          <div className="relative">
            <svg className={iconTopCls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
            </svg>
            <textarea
              value={idCardAddress}
              onChange={(e) => setIdCardAddress(e.target.value)}
              rows={3}
              className={addrTextareaCls}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls + " mb-0"}>ที่อยู่ติดตั้ง {requiredMark}</label>
            <label className="text-xs text-gray-600 inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 accent-primary cursor-pointer"
                checked={!!idCardAddress && installAddress === idCardAddress}
                onChange={(e) => { if (e.target.checked) setInstallAddress(idCardAddress); }}
              />
              เหมือนที่อยู่ตามบัตร
            </label>
          </div>
          <div className="relative">
            <svg className={iconTopCls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            <textarea
              value={installAddress}
              onChange={(e) => setInstallAddress(e.target.value)}
              rows={3}
              className={addrTextareaCls}
            />
          </div>
        </div>
      </div>

      <PaymentSection
        paymentTitle="เงินจอง · Solar Rooftop Booking"
        amountLabel="เงินจอง"
        amount={amount}
        leadId={lead.id}
        leadName={fullName || lead.full_name || customerName}
        lineId={lineId}
        slipUrl={lead.pre_slip_url}
        slipField="pre_slip_url"
        stepNo={1}
        description="ค่าจอง Survey"
        docNo={lead.pre_doc_no ? `${lead.pre_doc_no}-0` : null}
        confirmed={confirmed}
        onConfirmed={async () => {
          // Mirror PreSurveyStep — when the seeker confirms the deposit and
          // the lead doesn't have a pre_doc_no yet, hit /book so the doc
          // number / payment_confirmed flag get set on the lead row.
          if (!lead.pre_doc_no) {
            try {
              await apiFetch(`/api/leads/${lead.id}/book`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ total_price: amount }),
              });
            } catch (e) { console.error("/book failed", e); }
          }
          await refresh(false);
          onConfirmed();
        }}
        onUndone={async () => { await refresh(false); onConfirmed(); }}
        onVerified={() => refresh(false)}
      />
    </div>
  );
}
