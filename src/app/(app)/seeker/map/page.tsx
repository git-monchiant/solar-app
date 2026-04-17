"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/Header";

type Prospect = {
  id: number;
  project_name: string | null;
  house_number: string | null;
  full_name: string | null;
  phone: string | null;
  interest: "interested" | "not_interested" | "not_home" | null;
  interest_type: "new" | "upgrade" | null;
  note: string | null;
  visited_at: string | null;
  visited_by_name: string | null;
  visit_lat: number | null;
  visit_lng: number | null;
};

type StatusKey = "pending" | "contacted" | "interested" | "not_interested" | "upgrade";

function statusOf(p: Prospect): StatusKey {
  if (p.interest === "interested") return p.interest_type === "upgrade" ? "upgrade" : "interested";
  if (p.interest === "not_interested") return "not_interested";
  if (p.interest === "not_home" || p.visited_at || (p.note && p.note.trim())) return "contacted";
  return "pending";
}

const MARKER_COLOR: Record<StatusKey, string> = {
  pending: "#9ca3af",
  contacted: "#f59e0b",
  interested: "#16a34a",
  upgrade: "#2563eb",
  not_interested: "#dc2626",
};

const STATUS_LABEL: Record<StatusKey, string> = {
  pending: "ยังไม่เยี่ยม",
  contacted: "กำลังติดต่อ",
  interested: "สนใจ (ใหม่)",
  upgrade: "สนใจ (Upgrade)",
  not_interested: "ไม่สนใจ",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletGlobal = any;

declare global {
  interface Window {
    L?: LeafletGlobal;
  }
}

export default function SeekerMapPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [allProjects, setAllProjects] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<StatusKey>>(
    new Set(["contacted", "interested", "upgrade", "not_interested"])
  );
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletGlobal>(null);
  const markerLayerRef = useRef<LeafletGlobal>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("seekerProjectFilter");
      if (saved) setProjectFilter(saved);
    }
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

  // Load Leaflet from CDN
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.L) return;
    const cssId = "leaflet-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    const scriptId = "leaflet-js";
    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script");
      s.id = scriptId;
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.async = true;
      s.onload = () => {
        // trigger re-render by bumping state
        setProspects((p) => [...p]);
      };
      document.body.appendChild(s);
    }
  }, []);

  const withCoords = useMemo(() => {
    return prospects.filter((p) => p.visit_lat != null && p.visit_lng != null);
  }, [prospects]);

  const filtered = useMemo(() => {
    let list = withCoords;
    if (projectFilter) list = list.filter((p) => (p.project_name || "") === projectFilter);
    list = list.filter((p) => activeFilters.has(statusOf(p)));
    return list;
  }, [withCoords, projectFilter, activeFilters]);

  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    for (const n of allProjects) if (n) set.add(n);
    for (const p of prospects) {
      const n = typeof p.project_name === "string" ? p.project_name.trim() : "";
      if (n) set.add(n);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
  }, [prospects, allProjects]);

  // Initialize / update map
  useEffect(() => {
    if (typeof window === "undefined") return;
    const L = window.L;
    if (!L || !mapRef.current) return;
    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current).setView([13.75, 100.55], 10);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      mapInstanceRef.current = map;
      markerLayerRef.current = L.layerGroup().addTo(map);
    }
    const L2 = window.L;
    const map = mapInstanceRef.current;
    const layer = markerLayerRef.current;
    if (!map || !layer || !L2) return;
    layer.clearLayers();
    const bounds: [number, number][] = [];
    for (const p of filtered) {
      const st = statusOf(p);
      const color = MARKER_COLOR[st];
      const icon = L2.divIcon({
        className: "seeker-marker",
        html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.45);"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const marker = L2.marker([p.visit_lat!, p.visit_lng!], { icon });
      const label = `<div style="min-width:180px"><div style="font-weight:600">${escapeHtml(p.house_number || "-")} ${p.full_name ? " · " + escapeHtml(p.full_name) : ""}</div>
        ${p.project_name ? `<div style="color:#6b7280;font-size:12px">${escapeHtml(p.project_name)}</div>` : ""}
        ${p.phone ? `<div style="color:#6b7280;font-size:12px">โทร: ${escapeHtml(p.phone)}</div>` : ""}
        <div style="margin-top:6px;padding:2px 8px;display:inline-block;border-radius:10px;background:${color};color:white;font-size:11px">${STATUS_LABEL[st]}</div>
        ${p.visited_at ? `<div style="color:#9ca3af;font-size:11px;margin-top:4px">${formatDT(p.visited_at)}${p.visited_by_name ? " · " + escapeHtml(p.visited_by_name) : ""}</div>` : ""}
        <a href="https://www.google.com/maps?q=${p.visit_lat},${p.visit_lng}" target="_blank" rel="noopener" style="display:block;margin-top:4px;color:#2563eb;font-size:11px">เปิดใน Google Maps →</a></div>`;
      marker.bindPopup(label);
      marker.addTo(layer);
      bounds.push([p.visit_lat!, p.visit_lng!]);
    }
    if (bounds.length > 0) {
      const opts = { padding: [40, 40], maxZoom: projectFilter ? 17 : 14, duration: 0.8 };
      if (typeof map.flyToBounds === "function") {
        map.flyToBounds(bounds, opts);
      } else {
        map.fitBounds(bounds, opts);
      }
    }
  }, [filtered, projectFilter]);

  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = { pending: 0, contacted: 0, interested: 0, upgrade: 0, not_interested: 0 };
    for (const p of withCoords) c[statusOf(p)]++;
    return c;
  }, [withCoords]);

  function toggleFilter(k: StatusKey) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const visibleStatuses: StatusKey[] = ["contacted", "interested", "upgrade", "not_interested"];

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 5rem)" }}>
      <Header
        title="Seeker Map"
        subtitle={projectFilter || "ตำแหน่งที่บันทึกทั้งหมด"}
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

      <div className="px-4 md:px-5 py-3 flex flex-wrap gap-2 bg-white border-b border-gray-200">
        {visibleStatuses.map((k) => {
          const active = activeFilters.has(k);
          return (
            <button
              key={k}
              onClick={() => toggleFilter(k)}
              className={`h-8 px-3 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                active ? "border-gray-400 bg-white text-gray-900" : "border-gray-200 bg-gray-50 text-gray-400"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: MARKER_COLOR[k], opacity: active ? 1 : 0.4 }} />
              {STATUS_LABEL[k]}
              <span className="opacity-70">({counts[k]})</span>
            </button>
          );
        })}
        <div className="ml-auto text-xs text-gray-500 self-center">
          แสดง {filtered.length} จุด / ทั้งหมด {withCoords.length}
        </div>
      </div>

      <div className="flex-1 relative min-h-[500px]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10">
            <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
          </div>
        )}
        {!loading && projectFilter && filtered.length === 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1100] bg-amber-50 border border-amber-300 text-amber-800 text-sm px-4 py-2 rounded-lg shadow">
            ยังไม่มีข้อมูลพิกัดในโครงการนี้
          </div>
        )}
        <div ref={mapRef} className="absolute inset-0" />
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDT(iso: string) {
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
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
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
            {value === "" && <CheckIcon />}
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
                {value === name && <CheckIcon />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
