"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import LeadCard, { LeadData } from "@/components/lead/LeadCard";
import ListPageHeader from "@/components/layout/ListPageHeader";
import NewLeadModal from "@/components/modal/NewLeadModal";
import ChannelPickerModal from "@/components/shared/ChannelPickerModal";
import type { ChannelCode } from "@/lib/constants/channels";
import { useActiveRoles, hasRole } from "@/lib/roles";
import EventCalendarList from "@/components/calendar/EventCalendarList";

interface TodayData {
  newLeads: LeadData[];
  overduePreSurvey: LeadData[];
  followUpToday: LeadData[];
  followUpOverdue: LeadData[];
  followUpUpcoming: LeadData[];
  surveyToday: LeadData[];
  surveyPending: LeadData[];
  quotationPending: LeadData[];
  installPending: LeadData[];
  installing: LeadData[];
  recentlyClosed: LeadData[];
  stats: { pipeline: number; won: number; lost: number; new_this_week: number };
}

export default function TodayPage() {
  const [todayData, setTodayData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"sales" | "sales_solar" | "solar" | "calendar">("sales");
  const [search, setSearch] = useState("");
  const [zones, setZones] = useState<{ id: number; name: string; color?: string | null }[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>("กรุงเทพ ทีม 1");
  const [channelPickerOpen, setChannelPickerOpen] = useState(false);
  const [pickedChannel, setPickedChannel] = useState<ChannelCode | null>(null);
  const { activeRoles } = useActiveRoles();

  useEffect(() => {
    const savedZone = localStorage.getItem("selectedZone");
    if (savedZone) setSelectedZone(savedZone);

    apiFetch("/api/zones").then(setZones).catch(console.error);
    apiFetch("/api/today").then((t) => {
      setTodayData(t);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  // If saved tab no longer valid for current role, fall back to first available.
  // Skip while activeRoles is still loading (empty) — otherwise we'd downgrade a
  // valid "sales" tab to "calendar" on first render before /api/me resolves.
  useEffect(() => {
    if (activeRoles.length === 0) return;
    const isSales = hasRole(activeRoles, "sales");
    const isSolar = hasRole(activeRoles, "solar");
    const validKeys: string[] = [];
    if (isSales) validKeys.push("sales", "sales_solar");
    if (isSolar) validKeys.push("solar");
    validKeys.push("calendar");
    if (!validKeys.includes(tab)) {
      const fallback = validKeys[0] as "sales" | "sales_solar" | "solar" | "calendar";
      setTab(fallback);
    }
  }, [activeRoles, tab]);

  // Snap to today's row whenever the calendar tab becomes visible — the list
  // window starts at the 1st of the current month, so without this the user
  // lands on past dates instead of today.
  useEffect(() => {
    if (tab !== "calendar") return;
    const t = new Date();
    const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    let tries = 0;
    const tick = () => {
      const el = document.getElementById(`day-${k}`);
      if (el) { el.scrollIntoView({ behavior: "auto", block: "start" }); return; }
      if (++tries < 30) setTimeout(tick, 50);
    };
    tick();
  }, [tab]);

  if (loading || activeRoles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  const raw = todayData!;

  const filterLeads = (leads: LeadData[]) => {
    if (!search.trim()) return leads;
    const q = search.trim().toLowerCase();
    return leads.filter(l =>
      l.full_name?.toLowerCase().includes(q) ||
      l.phone?.includes(q) ||
      l.project_name?.toLowerCase().includes(q) ||
      l.installation_address?.toLowerCase().includes(q) ||
      l.house_number?.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q) ||
      l.source?.toLowerCase().includes(q) ||
      l.note?.toLowerCase().includes(q) ||
      l.assigned_name?.toLowerCase().includes(q) ||
      l.pre_doc_no?.toLowerCase().includes(q)
    );
  };

  const d = {
    followUpOverdue: filterLeads(raw.followUpOverdue),
    followUpToday: filterLeads(raw.followUpToday),
    newLeads: filterLeads(raw.newLeads),
    overduePreSurvey: filterLeads(raw.overduePreSurvey),
    followUpUpcoming: filterLeads(raw.followUpUpcoming),
    surveyToday: filterLeads(raw.surveyToday),
    surveyPending: filterLeads(raw.surveyPending),
    quotationPending: filterLeads(raw.quotationPending),
    installPending: filterLeads(raw.installPending),
    installing: filterLeads(raw.installing || []),
    recentlyClosed: filterLeads(raw.recentlyClosed || []),
  };

  const followupCount = d.followUpOverdue.length + d.followUpToday.length + d.newLeads.length + d.overduePreSurvey.length + d.followUpUpcoming.length;
  const orderCount = d.installPending.length;
  const salesCount = followupCount + orderCount;
  const solarCount = d.surveyToday.length + d.surveyPending.length + d.quotationPending.length + d.installing.length;
  const salesSolarCount = d.quotationPending.length;

  const isSales = hasRole(activeRoles, "sales");
  const isSolar = hasRole(activeRoles, "solar");
  const allTabs = [
    isSales && { key: "sales", label: "ติดตามลูกค้า", count: salesCount },
    isSales && { key: "sales_solar", label: "ติดตามงาน", count: salesSolarCount },
    isSolar && { key: "solar", label: "ทีมโซลาร์", count: solarCount },
    { key: "calendar", label: "ปฏิทิน" },
  ].filter(Boolean) as { key: string; label: string; count?: number }[];

  // While effect re-syncs an invalid tab, render against an in-bounds key
  const visibleTab = (allTabs.some(t => t.key === tab) ? tab : (allTabs[0]?.key ?? "calendar")) as "sales" | "sales_solar" | "solar" | "calendar";

  return (
    <div>
      <ListPageHeader
        title="Today"
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาชื่อ, เบอร์..."
        tabs={allTabs}
        activeTab={visibleTab}
        onTabChange={(k) => setTab(k as "sales" | "sales_solar" | "solar" | "calendar")}
      />

      {/* Content */}
      <div className="p-4 space-y-5">
        {/* Sales Tab */}
        {visibleTab === "sales" && (
          <>
            {/* Order — top */}
            {d.installPending.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-green-600">รออนุมัติ/ชำระ</h2>
                  <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{d.installPending.length}</span>
                </div>
                <div className="space-y-3">{d.installPending.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}

            {/* Follow-up — bottom */}
            {followupCount > 0 && (
              <div className="space-y-4 pt-2">
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
                  <h2 className="text-xs font-bold tracking-wider uppercase text-blue-600">Lead ใหม่ยังไม่มีการติดต่อ</h2>
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{d.newLeads.length}</span>
                </div>
                <div className="space-y-3">{d.newLeads.map((l) => <LeadCard key={l.id} lead={l} compact />)}</div>
              </section>
            )}
            {d.overduePreSurvey.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-red-600">Leads ที่ต้องติดตาม</h2>
                  <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{d.overduePreSurvey.length}</span>
                </div>
                <div className="space-y-3">{d.overduePreSurvey.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.followUpUpcoming.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-gray-500">นัดติดตามที่ยังไม่ถึง</h2>
                  <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{d.followUpUpcoming.length}</span>
                </div>
                <div className="space-y-3">{d.followUpUpcoming.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
              </div>
            )}

            {salesCount === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงาน Sales วันนี้</div>
              </div>
            )}
          </>
        )}

        {/* Sales-Solar Tab — sales follows up on solar team's progress */}
        {visibleTab === "sales_solar" && (
          <>
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
              รายการที่รอใบเสนอราคา — เร่ง Solar ให้รีบทำให้ลูกค้า
            </div>
            {d.quotationPending.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-violet-600">รอเสนอราคา</h2>
                  <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">{d.quotationPending.length}</span>
                </div>
                <div className="space-y-3">{d.quotationPending.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {salesSolarCount === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงานรอใบเสนอราคา</div>
              </div>
            )}
          </>
        )}

        {/* Solar Tab */}
        {visibleTab === "solar" && (
          <>
            {d.surveyToday.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-primary">Survey วันนี้</h2>
                  <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{d.surveyToday.length}</span>
                </div>
                <div className="space-y-3">{d.surveyToday.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.surveyPending.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-amber-600">Survey รอดำเนินการ</h2>
                  <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{d.surveyPending.length}</span>
                </div>
                <div className="space-y-3">{d.surveyPending.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.quotationPending.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-violet-600">รอเสนอราคา</h2>
                  <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">{d.quotationPending.length}</span>
                </div>
                <div className="space-y-3">{d.quotationPending.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.installing.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-600">กำลังติดตั้ง</h2>
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{d.installing.length}</span>
                </div>
                <div className="space-y-3">{d.installing.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {solarCount === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงาน Solar วันนี้</div>
              </div>
            )}
          </>
        )}

        {/* Calendar Tab — shared list view (same component as /calendar) */}
        {visibleTab === "calendar" && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => { setSelectedZone("all"); localStorage.setItem("selectedZone", "all"); }}
                className={`px-3 h-8 rounded-lg text-xs font-semibold border transition-all ${selectedZone === "all" ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200"}`}
                style={{ minHeight: 0 }}
              >
                All
              </button>
              {zones.map((z) => {
                const active = selectedZone === z.name;
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => { setSelectedZone(z.name); localStorage.setItem("selectedZone", z.name); }}
                    className="px-3 h-8 rounded-lg text-xs font-semibold border transition-all inline-flex items-center gap-1.5"
                    style={{
                      minHeight: 0,
                      backgroundColor: active && z.color ? z.color : "white",
                      borderColor: z.color || "#e5e7eb",
                      color: active ? "white" : (z.color || "#4b5563"),
                    }}
                  >
                    {!active && z.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: z.color }} />}
                    {z.name}
                  </button>
                );
              })}
            </div>
            <EventCalendarList monthsBack={0} monthsForward={2} controlledZone={selectedZone} hideNav />
          </div>
        )}
      </div>

      {/* FAB — primary teal */}
      <button
        type="button"
        onClick={() => setChannelPickerOpen(true)}
        className="fixed bottom-24 right-5 md:bottom-6 md:right-6 w-14 h-14 bg-gradient-to-b from-primary via-primary to-primary rounded-full shadow-lg shadow-primary/30 flex items-center justify-center hover:bg-primary-dark transition-all z-20"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      {channelPickerOpen && (
        <ChannelPickerModal
          onClose={() => setChannelPickerOpen(false)}
          onPick={(code) => {
            setChannelPickerOpen(false);
            setPickedChannel(code);
          }}
        />
      )}

      {pickedChannel && (
        <NewLeadModal
          initialSource={pickedChannel}
          onClose={() => setPickedChannel(null)}
        />
      )}
    </div>
  );
}
