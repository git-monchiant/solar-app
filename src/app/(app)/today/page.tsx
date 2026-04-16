"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Link from "next/link";
import LeadCard, { LeadData } from "@/components/LeadCard";
import ListPageHeader from "@/components/ListPageHeader";
import { useActiveRoles, hasRole } from "@/lib/roles";

interface TodayData {
  newLeads: LeadData[];
  overdueBooking: LeadData[];
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
  const [scheduledSurveys, setScheduledSurveys] = useState<{ id: number; full_name: string; event_date: string; time_slot: string | null; event_type: string; status: string; zone: string | null }[]>([]);
  const [zones, setZones] = useState<{ id: number; name: string }[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>("all");
  const { activeRoles } = useActiveRoles();

  useEffect(() => {
    const savedTab = localStorage.getItem("todayTab");
    if (savedTab === "sales" || savedTab === "sales_solar" || savedTab === "solar" || savedTab === "calendar") setTab(savedTab);
    const savedZone = localStorage.getItem("selectedZone");
    if (savedZone) setSelectedZone(savedZone);

    apiFetch("/api/surveys/scheduled").then(setScheduledSurveys).catch(console.error);
    apiFetch("/api/zones").then(setZones).catch(console.error);
    apiFetch("/api/today").then((t) => {
      setTodayData(t);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  const raw = todayData!;

  const filterLeads = (leads: LeadData[]) => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(l => l.full_name?.toLowerCase().includes(q) || l.phone?.includes(q) || l.project_name?.toLowerCase().includes(q));
  };

  const d = {
    followUpOverdue: filterLeads(raw.followUpOverdue),
    followUpToday: filterLeads(raw.followUpToday),
    newLeads: filterLeads(raw.newLeads),
    overdueBooking: filterLeads(raw.overdueBooking),
    followUpUpcoming: filterLeads(raw.followUpUpcoming),
    surveyToday: filterLeads(raw.surveyToday),
    surveyPending: filterLeads(raw.surveyPending),
    quotationPending: filterLeads(raw.quotationPending),
    installPending: filterLeads(raw.installPending),
    installing: filterLeads(raw.installing || []),
    recentlyClosed: filterLeads(raw.recentlyClosed || []),
  };

  const followupCount = d.followUpOverdue.length + d.followUpToday.length + d.newLeads.length + d.overdueBooking.length + d.followUpUpcoming.length;
  const orderCount = d.installPending.length;
  const salesCount = followupCount + orderCount;
  const solarCount = d.surveyToday.length + d.surveyPending.length + d.quotationPending.length + d.installing.length;
  const salesSolarCount = d.quotationPending.length;

  const isSales = hasRole(activeRoles, "sales");
  const isSolar = hasRole(activeRoles, "solar");
  const allTabs = [
    isSales && { key: "sales", label: "Sales", count: salesCount },
    isSales && { key: "sales_solar", label: "Sales-Solar", count: salesSolarCount },
    isSolar && { key: "solar", label: "Solar", count: solarCount },
    { key: "calendar", label: "Calendar" },
  ].filter(Boolean) as { key: string; label: string; count?: number }[];

  return (
    <div>
      <ListPageHeader
        title="Today"
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาชื่อ, เบอร์..."
        tabs={allTabs}
        activeTab={tab}
        onTabChange={(k) => { setTab(k as "sales" | "sales_solar" | "solar" | "calendar"); localStorage.setItem("todayTab", k); }}
      />

      {/* Content */}
      <div className="p-4 space-y-5">
        {/* Sales Tab */}
        {tab === "sales" && (
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
                  <h2 className="text-xs font-bold tracking-wider uppercase text-blue-600">Lead ใหม่รอจอง</h2>
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{d.newLeads.length}</span>
                </div>
                <div className="space-y-3">{d.newLeads.map((l) => <LeadCard key={l.id} lead={l} compact />)}</div>
              </section>
            )}
            {d.overdueBooking.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-red-600">Leads ที่ต้องติดตาม</h2>
                  <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{d.overdueBooking.length}</span>
                </div>
                <div className="space-y-3">{d.overdueBooking.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
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
        {tab === "sales_solar" && (
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
        {tab === "solar" && (
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

        {/* Calendar Tab — list view with events per day */}
        {tab === "calendar" && (() => {
          const today = new Date();
          const filtered = selectedZone === "all" ? scheduledSurveys : scheduledSurveys.filter(s => s.zone === selectedZone);
          const surveyByDate: Record<string, typeof scheduledSurveys> = {};
          filtered.forEach(s => {
            const key = String(s.event_date).slice(0, 10);
            if (!surveyByDate[key]) surveyByDate[key] = [];
            surveyByDate[key].push(s);
          });

          // Generate days for 2 months from today
          const days: string[] = [];
          for (let i = 0; i < 60; i++) {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            days.push(key);
          }

          // Group by month
          const byMonth: Record<string, string[]> = {};
          days.forEach(dk => {
            const mk = dk.slice(0, 7);
            if (!byMonth[mk]) byMonth[mk] = [];
            byMonth[mk].push(dk);
          });

          const isToday = (dk: string) => {
            const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
            return dk === t;
          };

          const fmtDay = (dk: string) => {
            const d = new Date(dk + "T12:00:00");
            return {
              weekday: d.toLocaleDateString("th-TH", { weekday: "short" }),
              day: d.getDate(),
              hasJobs: (surveyByDate[dk]?.length || 0) > 0,
              jobs: surveyByDate[dk] || [],
            };
          };

          return (
            <div className="space-y-4">
              {/* Zone filter */}
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={() => { setSelectedZone("all"); localStorage.setItem("selectedZone", "all"); }} className={`px-3 h-8 rounded-lg text-xs font-semibold border transition-all ${selectedZone === "all" ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200"}`} style={{ minHeight: 0 }}>All</button>
                {zones.map(z => (
                  <button key={z.id} type="button" onClick={() => { setSelectedZone(z.name); localStorage.setItem("selectedZone", z.name); }} className={`px-3 h-8 rounded-lg text-xs font-semibold border transition-all ${selectedZone === z.name ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200"}`} style={{ minHeight: 0 }}>{z.name}</button>
                ))}
              </div>
              {Object.entries(byMonth).map(([mk, daysInMonth]) => (
                <div key={mk}>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
                    {new Date(mk + "-15T12:00:00").toLocaleDateString("th-TH", { month: "long", year: "numeric" })}
                  </div>
                  <div className="space-y-1">
                    {daysInMonth.map(dk => {
                      const { weekday, day, hasJobs, jobs } = fmtDay(dk);
                      const todayClass = isToday(dk);
                      return (
                        <div key={dk} className={`rounded-xl border p-3 ${todayClass ? "border-primary bg-primary/5" : hasJobs ? "border-gray-200 bg-white" : "border-transparent"}`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-10 text-center shrink-0 ${todayClass ? "text-primary" : "text-gray-500"}`}>
                              <div className="text-[10px] font-semibold uppercase">{weekday}</div>
                              <div className={`text-lg font-bold ${todayClass ? "text-primary" : hasJobs ? "text-gray-900" : "text-gray-400"}`}>{day}</div>
                            </div>
                            <div className="flex-1 min-w-0">
                              {jobs.length === 0 && !todayClass ? null : jobs.length === 0 ? (
                                <div className="text-xs text-gray-400 py-1">ไม่มีนัดหมาย</div>
                              ) : (
                                <div className="space-y-1">
                                  {jobs.map(j => {
                                    const STATUS_COLOR: Record<string, { bg: string; bar: string; label: string }> = {
                                      survey:  { bg: "bg-violet-100 hover:bg-violet-200",   bar: "bg-violet-500",  label: "สำรวจหน้างาน" },
                                      quote:   { bg: "bg-orange-100 hover:bg-orange-200",   bar: "bg-orange-500",  label: "รอใบเสนอราคา" },
                                      order:   { bg: "bg-green-100 hover:bg-green-200",     bar: "bg-green-500",   label: j.event_type === "install" ? "นัดติดตั้ง" : "รออนุมัติ/ชำระ" },
                                      install: { bg: "bg-emerald-100 hover:bg-emerald-200", bar: "bg-emerald-500", label: "กำลังติดตั้ง" },
                                    };
                                    const c = STATUS_COLOR[j.status] || { bg: "bg-gray-100 hover:bg-gray-200", bar: "bg-gray-400", label: j.status };
                                    return (
                                      <Link key={`${j.event_type}-${j.id}`} href={`/leads/${j.id}`} className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${c.bg}`}>
                                        <div className={`w-1.5 h-6 rounded-full shrink-0 ${c.bar}`} />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs font-semibold text-gray-900 truncate">{j.full_name}</div>
                                          <div className="text-[10px] text-gray-500">
                                            {j.time_slot === "morning" ? "09:00 - 12:00" : j.time_slot === "afternoon" ? "13:00 - 16:00" : ""} · {c.label}
                                          </div>
                                        </div>
                                      </Link>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
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
