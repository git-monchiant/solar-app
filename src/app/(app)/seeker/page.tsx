"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import ListPageHeader from "@/components/layout/ListPageHeader";

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
  interest: "interested" | "not_interested" | "not_home" | null;
  interest_type: "new" | "upgrade" | null;
  note: string | null;
  visited_by_name: string | null;
  visited_at: string | null;
  visit_count: number | null;
  visit_lat: number | null;
  visit_lng: number | null;
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
  if (p.interest === "not_home" || p.visited_at || (p.note && p.note.trim())) return "contacted";
  return "pending";
}

function hasExistingSolar(p: Prospect): boolean {
  const s = (p.existing_solar || "").trim();
  if (s && !/^(ไม่มี|ยังไม่มี|no|none|-)$/i.test(s)) return true;
  if (p.installed_kw != null && p.installed_kw > 0) return true;
  if (p.installed_product && p.installed_product.trim()) return true;
  return false;
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

export default function SeekerPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [allProjects, setAllProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "pending" | "contacted" | "interested" | "not_interested">("all");
  const [search, setSearch] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [editing, setEditing] = useState<Prospect | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSearch(localStorage.getItem("seekerSearch") || "");
      setProjectFilter(localStorage.getItem("seekerProjectFilter") || "");
    }
    setHydrated(true);
    apiFetch("/api/projects")
      .then((list: { name: string }[]) => setAllProjects(list.map((p) => p.name)))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (typeof window !== "undefined") {
      if (projectFilter) localStorage.setItem("seekerProjectFilter", projectFilter);
      else localStorage.removeItem("seekerProjectFilter");
    }
    refresh(projectFilter);
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

  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    for (const name of allProjects) if (name) set.add(name);
    for (const p of prospects) {
      const n = typeof p.project_name === "string" ? p.project_name.trim() : "";
      if (n) set.add(n);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
  }, [prospects, allProjects]);

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

  return (
    <div>
      <ListPageHeader
        title="Leads Seeker"
        subtitle="เดินหาลูกค้า"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={projectFilter ? `ค้นหาใน ${projectFilter}` : "ค้นหาบ้านเลขที่/ชื่อ/เบอร์..."}
        actionIcon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5.25h18M6 12h12m-9 6.75h6" />
          </svg>
        }
        onAction={() => setProjectPickerOpen(true)}
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
                  {(() => {
                    const count = p.visit_count ?? 0;
                    if (status === "interested") {
                      if (p.interest_type === "upgrade") {
                        return (
                          <span className="absolute top-2 right-2 text-[11px] text-blue-700 uppercase tracking-wider font-bold">
                            Upgrade
                          </span>
                        );
                      }
                      return null;
                    }
                    if (status === "pending") return null;
                    return (
                      <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full border ${CARD_STATUS[status].badge}`}>
                        {CARD_STATUS[status].label}
                        {status === "contacted" && count > 0 && (
                          <span className="ml-1 font-bold">×{count}</span>
                        )}
                      </span>
                    );
                  })()}
                  <div className="text-base font-bold text-gray-900 leading-tight flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
                    </svg>
                    <span>{p.house_number || "-"}</span>
                    {hasExistingSolar(p) && <SolarIcon />}
                  </div>
                  <div className="mt-1 text-sm text-gray-800 truncate">
                    {p.full_name || <span className="text-gray-400">ไม่มีชื่อ</span>}
                  </div>
                  <div className="mt-0.5 text-sm text-gray-500 font-mono">
                    {p.phone || <span className="text-gray-300">-</span>}
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
        />
      )}

      {projectPickerOpen && (
        <ProjectPickerModal
          value={projectFilter}
          options={projectOptions}
          onChange={(v) => {
            setProjectFilter(v);
            setProjectPickerOpen(false);
          }}
          onClose={() => setProjectPickerOpen(false)}
        />
      )}
    </div>
  );
}

function VisitModal({ prospect, onClose, onSaved }: { prospect: Prospect; onClose: () => void; onSaved: () => void }) {
  const [interest, setInterest] = useState<Prospect["interest"]>(prospect.interest);
  const [interestType, setInterestType] = useState<Prospect["interest_type"]>(prospect.interest_type);
  const [note, setNote] = useState(prospect.note || "");
  const [projectName, setProjectName] = useState(prospect.project_name || "");
  const [saving, setSaving] = useState(false);

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
          project_name: projectName.trim() || null,
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

  const buttons: { key: NonNullable<Prospect["interest"]>; label: string; color: string }[] = [
    { key: "interested", label: "สนใจ", color: "bg-green-600 border-green-600 text-white" },
    { key: "not_interested", label: "ไม่สนใจ", color: "bg-red-500 border-red-500 text-white" },
    { key: "not_home", label: "ไม่อยู่บ้าน", color: "bg-gray-500 border-gray-500 text-white" },
  ];

  const hasRecord = !!(prospect.interest || prospect.visited_at || (prospect.note && prospect.note.trim()));

  return (
    <Modal onClose={onClose} title={hasRecord ? "แก้ไขการเยี่ยม" : "บันทึกการเยี่ยม"}>
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-3 text-sm">
          <div className="font-semibold text-gray-900">
            {prospect.house_number || "-"} {prospect.full_name && `· ${prospect.full_name}`}
          </div>
          <div className="mt-1 text-xs text-gray-500 space-y-0.5">
            {prospect.project_name && <div>โครงการ: {prospect.project_name}</div>}
            {prospect.phone && <div>โทร: {prospect.phone}</div>}
            {prospect.app_status && <div>App Sen Prop: {prospect.app_status}</div>}
            {prospect.existing_solar && <div>Solar เดิม: {prospect.existing_solar}</div>}
            {prospect.installed_kw != null && <div>ขนาด: {prospect.installed_kw} kW</div>}
            {prospect.installed_product && <div>ผลิตภัณฑ์: {prospect.installed_product}</div>}
            {prospect.ev_charger && <div>EV Charger: {prospect.ev_charger}</div>}
            {prospect.visited_at && (
              <div className="text-amber-700">
                เยี่ยมล่าสุด: {formatThaiDateTime(prospect.visited_at)}
                {prospect.visited_by_name && ` · โดย ${prospect.visited_by_name}`}
                {prospect.visit_count != null && prospect.visit_count > 1 && ` · ×${prospect.visit_count}`}
              </div>
            )}
            {prospect.visit_lat != null && prospect.visit_lng != null && (
              <a
                href={`https://www.google.com/maps?q=${prospect.visit_lat},${prospect.visit_lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                ตำแหน่งที่บันทึก (เปิด Google Maps)
              </a>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">ผลการเยี่ยม</div>
          <div className="grid grid-cols-3 gap-2">
            {buttons.map((b) => {
              const active = interest === b.key;
              return (
                <button
                  key={b.key}
                  onClick={() => setInterest(b.key)}
                  className={`h-11 rounded-lg border text-sm font-semibold transition-all ${
                    active ? b.color : "bg-white border-gray-300 text-gray-700 hover:border-gray-400"
                  }`}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">ประเภท (ถ้าสนใจ)</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setInterestType("new");
                setInterest("interested");
              }}
              className={`h-11 rounded-lg border text-sm font-semibold transition-all ${
                interest === "interested" && interestType === "new"
                  ? "bg-primary border-primary text-white"
                  : "bg-white border-gray-300 text-gray-700 hover:border-gray-400"
              }`}
            >
              ติดตั้งใหม่
            </button>
            <button
              onClick={() => {
                setInterestType("upgrade");
                setInterest("interested");
              }}
              className={`h-11 rounded-lg border text-sm font-semibold transition-all ${
                interest === "interested" && interestType === "upgrade"
                  ? "bg-amber-500 border-amber-500 text-white"
                  : "bg-white border-gray-300 text-gray-700 hover:border-gray-400"
              }`}
            >
              Upgrade
            </button>
          </div>
        </div>

        <Field label="โครงการ">
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="เช่น เสนา วิลล์ - คลอง 1"
            className="w-full h-11 px-3 rounded-lg border border-gray-300 bg-white text-sm"
          />
        </Field>

        <Field label="บันทึก (optional)">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm resize-none"
          />
        </Field>
      </div>

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
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-gray-100 text-gray-500">
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

function formatThaiDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
