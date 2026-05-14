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
  booking: LeadData[];
  stats: { pipeline: number; won: number; lost: number; new_this_week: number };
}

export default function TodayPage() {
  const [todayData, setTodayData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"sales_all" | "sales" | "booking" | "quote" | "sales_solar" | "solar" | "solar_survey" | "solar_quote" | "solar_install" | "calendar">("sales_all");
  const [search, setSearch] = useState("");
  const [zones, setZones] = useState<{ id: number; name: string; color?: string | null }[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>("กรุงเทพ ทีม 1");
  const [channelPickerOpen, setChannelPickerOpen] = useState(false);
  const [pickedChannel, setPickedChannel] = useState<ChannelCode | null>(null);
  const [sortField, setSortField] = useState<"follow_up" | "created" | "name" | "activity">("follow_up");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const { activeRoles } = useActiveRoles();

  useEffect(() => {
    const savedZone = localStorage.getItem("selectedZone");
    if (savedZone) setSelectedZone(savedZone);

    const savedSortField = localStorage.getItem("today.sortField");
    if (savedSortField === "follow_up" || savedSortField === "created" || savedSortField === "activity" || savedSortField === "name") {
      setSortField(savedSortField);
    }
    const savedSortOrder = localStorage.getItem("today.sortOrder");
    if (savedSortOrder === "asc" || savedSortOrder === "desc") {
      setSortOrder(savedSortOrder);
    }

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
    const isSolar = hasRole(activeRoles, "solar", "smartify");
    const validKeys: string[] = [];
    if (isSales) validKeys.push("sales_all", "sales", "booking", "quote", "sales_solar");
    if (isSolar) validKeys.push("solar", "solar_survey", "solar_quote", "solar_install");
    validKeys.push("calendar");
    if (!validKeys.includes(tab)) {
      const fallback = validKeys[0] as "sales_all" | "sales" | "booking" | "quote" | "sales_solar" | "solar" | "solar_survey" | "solar_quote" | "solar_install" | "calendar";
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
    booking: filterLeads(raw.booking || []),
  };

  const bookingCount = d.booking.length;
  // Solar เห็นเฉพาะ booking ที่จ่ายแล้ว (รอนัดสำรวจ); ส่วนที่รอชำระเป็นงาน sales
  const bookingPaidCount = d.booking.filter(l => l.payment_confirmed).length;
  // ติดตามลูกค้า tab — งานที่ sales ต้องตามวันนี้:
  // - ถึงวัน follow-up แล้ว (overdue + today) → แสดงบนสุด
  // - lead ใหม่ที่ยังไม่ได้ติดต่อ
  // installPending (รออนุมัติ/ชำระ) ไม่อยู่ที่นี่ — มี tab "เสนอราคา" แยกไว้แล้ว
  const salesCount =
    d.followUpOverdue.length +
    d.followUpToday.length +
    d.newLeads.length;
  const solarCount = bookingPaidCount + d.surveyToday.length + d.surveyPending.length + d.quotationPending.length + d.installing.length;
  const salesSolarCount = d.quotationPending.length;

  const isSales = hasRole(activeRoles, "sales");
  const isSolar = hasRole(activeRoles, "solar", "smartify");
  // Solar sub-tabs — survey/install grouped from the same data buckets the
  // ทีมโซลาร์ tab uses, so each section can be reached directly without
  // scrolling.
  const solarSurveyCount = bookingPaidCount + d.surveyToday.length + d.surveyPending.length;
  const solarQuoteCount = d.quotationPending.length;
  const solarInstallCount = d.installing.length;

  const sortLeads = (leads: LeadData[]): LeadData[] => {
    const dir = sortOrder === "asc" ? 1 : -1;
    const ts = (v: string | null | undefined, fallback: number) =>
      v ? new Date(v).getTime() : fallback;
    const arr = [...leads];
    arr.sort((a, b) => {
      if (sortField === "name") {
        return (a.full_name || "").localeCompare(b.full_name || "", "th") * dir;
      }
      const fallback = sortOrder === "asc" ? Number.POSITIVE_INFINITY : 0;
      // วันนัดติดตาม: fallback ใช้ activity ล่าสุด เพื่อให้ sort เห็นผลแม้ section
      // ที่ leads ไม่มี next_follow_up (survey/quote/install)
      const av =
        sortField === "follow_up" ? ts(a.next_follow_up ?? a.last_activity_date, fallback)
        : sortField === "created" ? ts(a.created_at, fallback)
        : ts(a.last_activity_date, fallback);
      const bv =
        sortField === "follow_up" ? ts(b.next_follow_up ?? b.last_activity_date, fallback)
        : sortField === "created" ? ts(b.created_at, fallback)
        : ts(b.last_activity_date, fallback);
      return (av - bv) * dir;
    });
    return arr;
  };

  // Sort dropdowns — rendered inline with the first visible section's count
  // badge so they sit on the same row as the group number across every tab.
  const sortControls = (
    <>
      <select
        value={sortField}
        onChange={(e) => {
          const v = e.target.value as typeof sortField;
          setSortField(v);
          localStorage.setItem("today.sortField", v);
        }}
        className="h-7 px-2 pr-6 rounded-md border border-gray-200 bg-white text-[11px] font-medium text-gray-700 focus:outline-none focus:border-gray-400"
      >
        <option value="follow_up">วันนัดติดตาม</option>
        <option value="created">วันที่สร้าง</option>
        <option value="activity">กิจกรรมล่าสุด</option>
        <option value="name">ชื่อลูกค้า</option>
      </select>
      <select
        value={sortOrder}
        onChange={(e) => {
          const v = e.target.value as typeof sortOrder;
          setSortOrder(v);
          localStorage.setItem("today.sortOrder", v);
        }}
        className="h-7 px-2 pr-6 rounded-md border border-gray-200 bg-white text-[11px] font-medium text-gray-700 focus:outline-none focus:border-gray-400"
      >
        <option value="asc">{sortField === "name" ? "ก-ฮ" : "เก่า → ใหม่"}</option>
        <option value="desc">{sortField === "name" ? "ฮ-ก" : "ใหม่ → เก่า"}</option>
      </select>
    </>
  );

  const salesAllCount =
    d.followUpOverdue.length +
    d.followUpToday.length +
    d.newLeads.length +
    bookingCount +
    d.installPending.length +
    d.quotationPending.length;

  const allTabs = [
    isSales && { key: "sales_all", label: "ทั้งหมด", count: salesAllCount },
    isSales && { key: "sales", label: "ติดตามลูกค้า", count: salesCount },
    isSales && { key: "booking", label: "รายการจอง", count: bookingCount },
    isSales && { key: "quote", label: "เสนอราคา", count: d.installPending.length },
    isSales && { key: "sales_solar", label: "ติดตามงาน", count: salesSolarCount },
    isSolar && { key: "solar", label: "ทั้งหมด", count: solarCount },
    isSolar && { key: "solar_survey", label: "สำรวจ", count: solarSurveyCount },
    isSolar && { key: "solar_quote", label: "ใบเสนอราคา", count: solarQuoteCount },
    isSolar && { key: "solar_install", label: "ติดตั้ง", count: solarInstallCount },
    { key: "calendar", label: "ปฏิทิน" },
  ].filter(Boolean) as { key: string; label: string; count?: number }[];

  // While effect re-syncs an invalid tab, render against an in-bounds key
  const visibleTab = (allTabs.some(t => t.key === tab) ? tab : (allTabs[0]?.key ?? "calendar")) as "sales_all" | "sales" | "booking" | "quote" | "sales_solar" | "solar" | "solar_survey" | "solar_quote" | "solar_install" | "calendar";

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
        onTabChange={(k) => setTab(k as "sales_all" | "sales" | "booking" | "quote" | "sales_solar" | "solar" | "solar_survey" | "solar_quote" | "solar_install" | "calendar")}
      />

      {/* Content */}
      <div className="p-4 space-y-5">
        {/* Sales · ทั้งหมด — รวมทุก section ของ sales tabs เรียงตามความเร่งด่วน */}
        {visibleTab === "sales_all" && (() => {
          // First-visible-section flag: sort dropdowns sit inline with that
          // section's count so they appear on the same row as the group number.
          const firstSection =
            d.followUpOverdue.length > 0 ? "followUpOverdue"
            : d.followUpToday.length > 0 ? "followUpToday"
            : d.newLeads.length > 0 ? "newLeads"
            : d.booking.length > 0 ? "booking"
            : d.installPending.length > 0 ? "installPending"
            : d.quotationPending.length > 0 ? "quotationPending"
            : null;
          return (
          <>
            {d.followUpOverdue.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-red-600">เลยกำหนดติดตาม</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "followUpOverdue" && sortControls}
                    <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{d.followUpOverdue.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.followUpOverdue).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.followUpToday.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-amber-600">รอติดตาม</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "followUpToday" && sortControls}
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{d.followUpToday.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.followUpToday).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.newLeads.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-blue-600">Lead ใหม่ ยังไม่ติดต่อ</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "newLeads" && sortControls}
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{d.newLeads.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.newLeads).map((l) => <LeadCard key={l.id} lead={l} compact />)}</div>
              </section>
            )}
            {d.booking.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-700">รายการจอง · รอนัดสำรวจ</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "booking" && sortControls}
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{d.booking.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.booking).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.installPending.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-violet-700">เสนอราคา · รอดำเนินการ</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "installPending" && sortControls}
                    <span className="text-xs font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">{d.installPending.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.installPending).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.quotationPending.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-violet-600">รอใบเสนอราคา</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "quotationPending" && sortControls}
                    <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">{d.quotationPending.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.quotationPending).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {salesAllCount === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงานที่ต้องดำเนินการ</div>
              </div>
            )}
          </>
          );
        })()}

        {/* Sales Tab — งานที่ต้องติดตามทั้งหมด.
         * บนสุด: ที่ถึงวัน follow-up แล้ว (overdue + today)
         * ถัดมา: lead ใหม่, รออนุมัติ/ชำระ
         * ที่ยังไม่ถึงวัน follow-up → ไปดู pipeline */}
        {visibleTab === "sales" && (() => {
          const firstSection =
            d.followUpOverdue.length > 0 ? "followUpOverdue"
            : d.followUpToday.length > 0 ? "followUpToday"
            : d.newLeads.length > 0 ? "newLeads"
            : null;
          return (
          <>
            {d.followUpOverdue.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-red-600">เลยกำหนดติดตาม</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "followUpOverdue" && sortControls}
                    <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{d.followUpOverdue.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.followUpOverdue).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.followUpToday.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-amber-600">นัดติดตามวันนี้</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "followUpToday" && sortControls}
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{d.followUpToday.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.followUpToday).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.newLeads.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-blue-600">Lead ใหม่ ยังไม่ติดต่อ</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "newLeads" && sortControls}
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{d.newLeads.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.newLeads).map((l) => <LeadCard key={l.id} lead={l} compact />)}</div>
              </section>
            )}
            {salesCount === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงานที่ต้องติดตาม</div>
              </div>
            )}
          </>
          );
        })()}

        {/* Booking Tab — "จอง" = จ่ายค่าสำรวจแล้ว (payment_confirmed=true)
            ยังอยู่ใน pre_survey รอนัดสำรวจ. ที่ยังไม่จ่ายจะอยู่ในแท็บ
            "ติดตามลูกค้า" ให้ sales ตามเก็บ. */}
        {visibleTab === "booking" && (
          d.booking.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </div>
              <div className="text-base font-semibold text-gray-900">ยังไม่มีรายการจอง</div>
              <div className="text-sm text-gray-500 mt-1">ลูกค้าที่ชำระค่าสำรวจแล้วจะปรากฏที่นี่</div>
            </div>
          ) : (
            <section>
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-700">รายการจอง · รอนัดสำรวจ</h2>
                <div className="flex items-center gap-2">
                  {sortControls}
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{d.booking.length}</span>
                </div>
              </div>
              <div className="space-y-3">{sortLeads(d.booking).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
            </section>
          )
        )}

        {/* Quote Tab — leads at status='order' (sales has to draft + send the
            quotation, follow up on payment). Reuses installPending data. */}
        {visibleTab === "quote" && (
          <>
            {d.installPending.length > 0 ? (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-violet-700">เสนอราคา · รอดำเนินการ</h2>
                  <div className="flex items-center gap-2">
                    {sortControls}
                    <span className="text-xs font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">{d.installPending.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.installPending).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-violet-50 flex items-center justify-center mb-3">
                  <svg className="w-8 h-8 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
                <div className="text-base font-semibold text-gray-900">ยังไม่มีรายการเสนอราคา</div>
                <div className="text-sm text-gray-500 mt-1">หลังสำรวจเสร็จและออกใบเสนอราคา จะปรากฏที่นี่</div>
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
                  <h2 className="text-xs font-bold tracking-wider uppercase text-violet-600">รอใบเสนอราคา</h2>
                  <div className="flex items-center gap-2">
                    {sortControls}
                    <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">{d.quotationPending.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.quotationPending).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
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
        {visibleTab === "solar" && (() => {
          const bookingReady = d.booking.filter(l => l.payment_confirmed);
          const firstSection =
            bookingReady.length > 0 ? "booking"
            : d.surveyToday.length > 0 ? "surveyToday"
            : d.surveyPending.length > 0 ? "surveyPending"
            : d.quotationPending.length > 0 ? "quotationPending"
            : d.installing.length > 0 ? "installing"
            : null;
          return (
          <>
            {/* Booking — เฉพาะ "จ่ายแล้ว" Solar ต้องนัดสำรวจ. ลูกค้ายังไม่จ่าย
             * เป็นงาน sales ตามเงิน — ไม่อยู่บน solar dashboard */}
            {bookingReady.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-700">รายการจอง · รอนัดสำรวจ</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "booking" && sortControls}
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{bookingReady.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(bookingReady).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.surveyToday.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-primary">Survey วันนี้</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "surveyToday" && sortControls}
                    <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{d.surveyToday.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.surveyToday).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.surveyPending.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-amber-600">Survey รอดำเนินการ</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "surveyPending" && sortControls}
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{d.surveyPending.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.surveyPending).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.quotationPending.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-violet-600">รอใบเสนอราคา</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "quotationPending" && sortControls}
                    <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">{d.quotationPending.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.quotationPending).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.installing.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-600">กำลังติดตั้ง</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "installing" && sortControls}
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{d.installing.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.installing).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
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
          );
        })()}

        {/* Solar · สำรวจ — booking ที่จ่ายแล้ว + survey วันนี้ + รอนัดสำรวจ */}
        {visibleTab === "solar_survey" && (() => {
          const bookingReady = d.booking.filter(l => l.payment_confirmed);
          const firstSection =
            bookingReady.length > 0 ? "booking"
            : d.surveyToday.length > 0 ? "surveyToday"
            : d.surveyPending.length > 0 ? "surveyPending"
            : null;
          return (
          <>
            {bookingReady.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-700">รายการจอง · รอนัดสำรวจ</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "booking" && sortControls}
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{bookingReady.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(bookingReady).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.surveyToday.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-primary">Survey วันนี้</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "surveyToday" && sortControls}
                    <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{d.surveyToday.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.surveyToday).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.surveyPending.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-amber-600">Survey รอดำเนินการ</h2>
                  <div className="flex items-center gap-2">
                    {firstSection === "surveyPending" && sortControls}
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{d.surveyPending.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.surveyPending).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {solarSurveyCount === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงานสำรวจ</div>
              </div>
            )}
          </>
          );
        })()}

        {/* Solar · ใบเสนอราคา — ใบเสนอราคาที่ยังรอจัดทำ */}
        {visibleTab === "solar_quote" && (
          <>
            {d.quotationPending.length > 0 ? (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-violet-600">รอใบเสนอราคา</h2>
                  <div className="flex items-center gap-2">
                    {sortControls}
                    <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">{d.quotationPending.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.quotationPending).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีใบเสนอราคาที่ต้องทำ</div>
              </div>
            )}
          </>
        )}

        {/* Solar · ติดตั้ง — งานที่กำลังติดตั้ง */}
        {visibleTab === "solar_install" && (
          <>
            {d.installing.length > 0 ? (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-600">กำลังติดตั้ง</h2>
                  <div className="flex items-center gap-2">
                    {sortControls}
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{d.installing.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.installing).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงานติดตั้ง</div>
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
