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
  const grouped = allStatuses.map((s) => ({
    status: s, config: STATUS_CONFIG[s], leads: filtered.filter((l) => l.status === s),
  })).filter((g) => g.leads.length > 0);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  const d = todayData!;
  const totalActions = d.overdue.length + d.today.length + d.untouched.length;

  return (
    <div>
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-primary-dark text-white px-5 pt-6 pb-4 safe-top">
        <div className="text-sm text-white/70">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
        <h1 className="text-xl font-bold mt-1">
          {tab === "today"
            ? totalActions > 0 ? `${totalActions} actions today` : "All caught up!"
            : `All Leads (${allLeads.length})`}
        </h1>

        {/* Search */}
        <div className="relative mt-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); if (e.target.value) setTab("allleads"); }}
            placeholder="Search name, phone, house..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/15 text-white placeholder-white/50 text-sm focus:outline-none focus:bg-white/25" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100 sticky top-0 z-10">
        <button onClick={() => setTab("today")}
          className={`flex-1 py-3 text-sm font-semibold transition-all ${tab === "today" ? "text-primary border-b-2 border-primary" : "text-gray border-b-2 border-transparent"}`}>
          Today {totalActions > 0 && `(${totalActions})`}
        </button>
        <button onClick={() => setTab("allleads")}
          className={`flex-1 py-3 text-sm font-semibold transition-all ${tab === "allleads" ? "text-primary border-b-2 border-primary" : "text-gray border-b-2 border-transparent"}`}>
          All Leads ({allLeads.length})
        </button>
      </div>

      {/* Filters — allleads only */}
      {tab === "allleads" && (
        <div className="px-4 py-2 bg-white border-b border-gray-100">
          <div className="flex gap-2">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
              <option value="all">All Status</option>
              {allStatuses.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>)}
            </select>
            <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
              <option value="all">All Source</option>
              <option value="walk-in">Walk-in</option>
              <option value="event">Event</option>
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4 space-y-5">
        {tab === "today" ? (
          <>
            {d.overdue.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full" />
                  <h2 className="text-sm font-bold text-red-600">OVERDUE ({d.overdue.length})</h2>
                </div>
                <div className="space-y-2">{d.overdue.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.today.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 bg-amber-500 rounded-full" />
                  <h2 className="text-sm font-bold text-amber-600">TODAY ({d.today.length})</h2>
                </div>
                <div className="space-y-2">{d.today.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.untouched.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full" />
                  <h2 className="text-sm font-bold text-blue-600">NEW — NOT CONTACTED ({d.untouched.length})</h2>
                </div>
                <div className="space-y-2">{d.untouched.map((l) => <LeadCard key={l.id} lead={l} compact />)}</div>
              </section>
            )}
            {totalActions === 0 && (
              <div className="text-center py-12 text-gray">
                <div className="font-medium">No pending actions</div>
                <div className="text-sm text-gray/60 mt-1">Switch to All Leads to see all leads</div>
              </div>
            )}
          </>
        ) : (
          <>
            {grouped.length === 0 ? (
              <div className="text-center py-16 text-gray">{search ? "No results" : "No leads yet"}</div>
            ) : (
              grouped.map((g) => (
                <section key={g.status}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${g.config.color}`} />
                    <h2 className={`text-sm font-bold ${g.config.text}`}>{g.config.label} ({g.leads.length})</h2>
                  </div>
                  <div className="space-y-2">{g.leads.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
                </section>
              ))
            )}
          </>
        )}
      </div>

      {/* FAB */}
      <Link href="/leads/new"
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 w-14 h-14 bg-primary text-white rounded-full shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform z-20">
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </Link>
    </div>
  );
}
