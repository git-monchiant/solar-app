"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Link from "next/link";
import LeadCard, { LeadData } from "@/components/LeadCard";
import LeadGroupList from "@/components/LeadGroupList";
import ListPageHeader from "@/components/ListPageHeader";
import { STATUSES, STATUS_CONFIG } from "@/lib/statuses";

interface TodayData {
  newLeads: LeadData[];
  overdueBooking: LeadData[];
  followUpToday: LeadData[];
  followUpOverdue: LeadData[];
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
  const [filterOpen, setFilterOpen] = useState(false);

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
      return l.full_name?.toLowerCase().includes(q) || l.phone?.toLowerCase().includes(q) || l.installation_address?.toLowerCase().includes(q);
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
  const totalActions = d.newLeads.length + d.overdueBooking.length + d.followUpToday.length + d.followUpOverdue.length;

  return (
    <div>
      <ListPageHeader
        title={tab === "today" ? (totalActions > 0 ? `${totalActions} actions today` : "All caught up") : `${allLeads.length} leads`}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
        search={search}
        onSearchChange={(v) => { setSearch(v); if (v) setTab("allleads"); }}
        searchPlaceholder="ค้นหาชื่อ, เบอร์, บ้านเลขที่..."
        tabs={[
          { key: "today", label: "Today", count: totalActions },
          { key: "allleads", label: "All Leads", count: allLeads.length },
        ]}
        activeTab={tab}
        onTabChange={(k) => setTab(k as "today" | "allleads")}
        tabsRight={tab === "allleads" ? (
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            style={{ minHeight: 0 }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
              filterStatus !== "all" || filterSource !== "all"
                ? "bg-active text-white"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
          </button>
        ) : undefined}
      />

      {/* Filter popup — allleads only */}
      {filterOpen && tab === "allleads" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setFilterOpen(false)} />
          <div className="relative bg-white rounded-2xl w-[85%] max-w-sm p-4 animate-slide-up space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-900">Filter</span>
              {(filterStatus !== "all" || filterSource !== "all") && (
                <button type="button" onClick={() => { setFilterStatus("all"); setFilterSource("all"); }} style={{ minHeight: 0 }} className="text-xs text-active font-semibold">ล้าง</button>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-400 mb-2">Status</div>
              <div className="flex flex-wrap gap-1.5">
                {[{ key: "all", label: "All" }, ...allStatuses.map(s => ({ key: s, label: STATUS_CONFIG[s]?.label || s }))].map(s => (
                  <button key={s.key} type="button" onClick={() => setFilterStatus(s.key)} style={{ minHeight: 0 }}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      filterStatus === s.key ? "bg-active text-white" : "bg-gray-100 text-gray-600"
                    }`}
                  >{s.label}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-400 mb-2">Source</div>
              <div className="flex flex-wrap gap-1.5">
                {[{ key: "all", label: "All" }, { key: "walk-in", label: "Walk-in" }, { key: "event", label: "Event" }].map(s => (
                  <button key={s.key} type="button" onClick={() => setFilterSource(s.key)} style={{ minHeight: 0 }}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      filterSource === s.key ? "bg-active text-white" : "bg-gray-100 text-gray-600"
                    }`}
                  >{s.label}</button>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => setFilterOpen(false)}
              className="w-full h-10 rounded-xl text-sm font-semibold bg-gray-900 text-white mt-1"
            >ตกลง</button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4 space-y-5">
        {tab === "today" ? (
          <>
            {d.overdueBooking.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-red-600">เกินกำหนดจอง</h2>
                  <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{d.overdueBooking.length}</span>
                </div>
                <div className="space-y-3">{d.overdueBooking.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.followUpOverdue.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-red-600">เลยกำหนดติดตาม</h2>
                  <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{d.followUpOverdue.length}</span>
                </div>
                <div className="space-y-3">{d.followUpOverdue.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.followUpToday.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-amber-600">นัดติดตามวันนี้</h2>
                  <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{d.followUpToday.length}</span>
                </div>
                <div className="space-y-3">{d.followUpToday.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.newLeads.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-blue-600">Lead ใหม่รอจอง</h2>
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{d.newLeads.length}</span>
                </div>
                <div className="space-y-3">{d.newLeads.map((l) => <LeadCard key={l.id} lead={l} compact />)}</div>
              </section>
            )}
            {totalActions === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงานที่ต้องทำวันนี้</div>
              </div>
            )}
          </>
        ) : (
          <>
            {grouped.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">
                {search ? "ไม่พบผลลัพธ์" : "ยังไม่มี lead"}
              </div>
            ) : (
              grouped.map((g) => (
                <section key={g.status}>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h2 className={`text-xs font-bold tracking-wider uppercase ${g.config.text}`}>
                      {g.config.label}
                    </h2>
                    <span className={`text-xs font-semibold ${g.config.text} ${g.config.bg} px-2 py-0.5 rounded-full`}>{g.leads.length}</span>
                  </div>
                  <div className="space-y-3">{g.leads.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
                </section>
              ))
            )}
          </>
        )}
      </div>

      {/* FAB — primary teal */}
      <Link
        href="/leads/new"
        className="fixed bottom-24 right-5 md:bottom-6 md:right-6 w-14 h-14 bg-gradient-to-b from-primary via-primary to-primary rounded-full shadow-lg shadow-primary/30 flex items-center justify-center hover:bg-primary-dark transition-all z-20"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </Link>
    </div>
  );
}
