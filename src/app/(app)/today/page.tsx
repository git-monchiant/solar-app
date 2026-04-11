"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Link from "next/link";
import LeadCard, { LeadData } from "@/components/LeadCard";
import { STATUSES, STATUS_CONFIG } from "@/lib/statuses";

interface TodayData {
  overdue: LeadData[];
  today: LeadData[];
  untouched: LeadData[];
  stats: { pipeline: number; won: number; lost: number; new_this_week: number };
}

export default function TodayPage() {
  const [todayData, setTodayData] = useState<TodayData | null>(null);
  const [allLeads, setAllLeads] = useState<LeadData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"today" | "allleads">("today");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSource, setFilterSource] = useState("all");

  useEffect(() => {
    Promise.all([
      apiFetch("/api/today"),
      apiFetch("/api/leads"),
    ]).then(([t, l]) => {
      setTodayData(t);
      setAllLeads(l);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // All Leads filter
  const filtered = allLeads.filter((l) => {
    if (filterStatus !== "all" && l.status !== filterStatus) return false;
    if (filterSource !== "all" && l.source !== filterSource) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return l.full_name?.toLowerCase().includes(q) || l.phone?.toLowerCase().includes(q) || l.house_number?.toLowerCase().includes(q);
    }
    return true;
  });

  const allStatuses = [...STATUSES, "lost"] as string[];
  const grouped = allStatuses
    .map((s) => ({ status: s, config: STATUS_CONFIG[s], leads: filtered.filter((l) => l.status === s) }))
    .filter((g) => g.leads.length > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  const d = todayData!;
  const totalActions = d.overdue.length + d.today.length + d.untouched.length;

  return (
    <div>
      {/* Top bar — fixed h-16 gradient, aligns with sidebar logo */}
      <div className="bg-gradient-to-br from-primary to-primary-dark text-white sticky top-0 z-10" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="h-16 px-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-white/60 leading-tight">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </div>
            <h1 className="text-2xl font-bold tracking-tight leading-tight mt-0.5 truncate">
              {tab === "today"
                ? totalActions > 0 ? `${totalActions} actions today` : "All caught up!"
                : `All Leads (${allLeads.length})`}
            </h1>
          </div>
          <Link
            href="/profile"
            className="rounded-full bg-white/15 backdrop-blur-sm ring-2 ring-white/30 flex items-center justify-center shrink-0 hover:bg-white/25 transition-colors shadow-sm shadow-black/10"
            style={{ width: "2.5rem", height: "2.5rem", minHeight: "2.5rem" }}
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Sub-header — search + tabs on white (below the 64px top bar) */}
      <div className="bg-white border-b border-gray-100">
        <div className="px-4 py-2">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); if (e.target.value) setTab("allleads"); }}
              placeholder="Search name, phone, house..."
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:border-active transition-colors"
            />
          </div>
        </div>
        <div className="flex">
          <button
            onClick={() => setTab("today")}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === "today" ? "text-active border-active" : "text-gray-500 border-transparent"
            }`}
          >
            Today {totalActions > 0 && `(${totalActions})`}
          </button>
          <button
            onClick={() => setTab("allleads")}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === "allleads" ? "text-active border-active" : "text-gray-500 border-transparent"
            }`}
          >
            All Leads ({allLeads.length})
          </button>
        </div>
      </div>

      {/* Filters — allleads only */}
      {tab === "allleads" && (
        <div className="px-3 py-2 bg-white border-b border-gray-100">
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="flex-1 h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm appearance-none focus:outline-none focus:border-primary"
            >
              <option value="all">All Status</option>
              {allStatuses.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>)}
            </select>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="flex-1 h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm appearance-none focus:outline-none focus:border-primary"
            >
              <option value="all">All Source</option>
              <option value="walk-in">Walk-in</option>
              <option value="event">Event</option>
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-3 space-y-4">
        {tab === "today" ? (
          <>
            {d.overdue.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="w-2 h-2 bg-red-500 rounded-full" />
                  <h2 className="text-xs font-bold tracking-wider uppercase text-red-600">Overdue ({d.overdue.length})</h2>
                </div>
                <div className="space-y-2">{d.overdue.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.today.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="w-2 h-2 bg-amber-500 rounded-full" />
                  <h2 className="text-xs font-bold tracking-wider uppercase text-amber-600">Today ({d.today.length})</h2>
                </div>
                <div className="space-y-2">{d.today.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.untouched.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="w-2 h-2 bg-blue-500 rounded-full" />
                  <h2 className="text-xs font-bold tracking-wider uppercase text-blue-600">New — Not Contacted ({d.untouched.length})</h2>
                </div>
                <div className="space-y-2">{d.untouched.map((l) => <LeadCard key={l.id} lead={l} compact />)}</div>
              </section>
            )}
            {totalActions === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-sm font-medium">No pending actions</div>
                <div className="text-xs mt-1">Switch to All Leads to see everything</div>
              </div>
            )}
          </>
        ) : (
          <>
            {grouped.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">
                {search ? "No results" : "No leads yet"}
              </div>
            ) : (
              grouped.map((g) => (
                <section key={g.status}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${g.config.color}`} />
                    <h2 className={`text-xs font-bold tracking-wider uppercase ${g.config.text}`}>
                      {g.config.label} ({g.leads.length})
                    </h2>
                  </div>
                  <div className="space-y-2">{g.leads.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
                </section>
              ))
            )}
          </>
        )}
      </div>

      {/* FAB */}
      <Link
        href="/leads/new"
        className="fixed bottom-24 right-4 md:bottom-6 md:right-6 w-14 h-14 bg-gradient-to-br from-primary to-primary-dark text-white rounded-full shadow-lg shadow-primary/30 flex items-center justify-center hover:brightness-110 transition-all z-20"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </Link>
    </div>
  );
}
