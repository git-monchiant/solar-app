"use client";
import { PlusIcon } from "@/components/ui/icons";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Header from "@/components/layout/Header";
import EventCalendarList from "@/components/calendar/EventCalendarList";
import EventCalendarMonth from "@/components/calendar/EventCalendarMonth";
import NewAppointmentModal from "@/components/calendar/NewAppointmentModal";
import { useMe } from "@/lib/roles";

// Calendar page — open to every authenticated role. Toggles between a
// month-grid and a list view; both back the same data source as Today's
// "ปฏิทิน" tab.
export default function CalendarPage() {
  const { me } = useMe();
  const searchParams = useSearchParams();
  // โหมดนัดติดตาม (เมนูปฏิทินของ Sales → /calendar?team=followup):
  // แสดงเฉพาะนัดติดตาม (leads.next_follow_up) — ไม่มี legend/ปุ่มกรองทีม/สร้างนัด
  const followupMode = searchParams.get("team") === "followup";
  // default view: นัดติดตาม = list เสมอ · ปฏิทินทีม = list บนมือถือ (ตาราง
  // เดือนแน่นเกินบนจอเล็ก) / month บนจอใหญ่ตามเดิม
  const [view, setView] = useState<"month" | "list">(() => {
    if (followupMode) return "list";
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) return "list";
    return "month";
  });
  const [newOpen, setNewOpen] = useState(false);
  const [newPrefillDate, setNewPrefillDate] = useState<string | undefined>(undefined);
  // Team filter — calendar shows the survey team's bookings or the solar
  // (install) team's bookings. Replaced the per-zone chips since we don't
  // split work by zone any more.
  const [selectedTeam, setSelectedTeam] = useState<"all" | "survey" | "install" | "block">("all");
  const team = followupMode ? ("followup" as const) : selectedTeam;

  // เลื่อนไปแถววันนี้: วัดความสูง sticky header สดๆ แล้ว scroll เอง — offset
  // ตายตัว (scroll-mt) ทำแถวมุดใต้ header เพราะความสูง header เปลี่ยนตามโหมด/จอ
  const snapToDay = (k: string) => {
    const el = document.getElementById(`day-${k}`);
    if (!el) return false;
    const main = el.closest("main");
    const sticky = main?.querySelector<HTMLElement>(".sticky");
    if (main instanceof HTMLElement) {
      const top = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
      main.scrollTo({ top: top - (sticky?.offsetHeight ?? 0) - 12 });
    } else {
      el.scrollIntoView({ behavior: "auto", block: "start" });
    }
    return true;
  };

  // Snap to today's row whenever the list view becomes active — both on first
  // mount and every time the user switches back from month view. Also resets
  // the anchor month so the visible header label snaps back to today's month.
  useEffect(() => {
    if (view !== "list") return;
    const t = new Date();
    setListAnchor({ y: t.getFullYear(), m: t.getMonth() });
    setVisibleMonth({ y: t.getFullYear(), m: t.getMonth() });
    const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    let tries = 0;
    const tick = () => {
      if (snapToDay(k)) return;
      if (++tries < 20) setTimeout(tick, 50);
    };
    tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  const [refreshKey, setRefreshKey] = useState(0);
  const TH_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const [listAnchor, setListAnchor] = useState(() => {
    const t = new Date();
    const a = new Date(t.getFullYear(), t.getMonth() - 1, 1);
    return { y: a.getFullYear(), m: a.getMonth() };
  });
  // Visible month label tracks scroll — updated by EventCalendarList via
  // onVisibleMonthChange. Falls back to anchor when nothing's been observed.
  const [visibleMonth, setVisibleMonth] = useState<{ y: number; m: number }>(listAnchor);
  const listGoPrev = () => setListAnchor((a) => { const d = new Date(a.y, a.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const listGoNext = () => setListAnchor((a) => { const d = new Date(a.y, a.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const listGoToday = () => {
    const t = new Date();
    setListAnchor({ y: t.getFullYear(), m: t.getMonth() });
    setVisibleMonth({ y: t.getFullYear(), m: t.getMonth() });
    // After re-render, snap today's row into view so the cursor lands on the
    // actual current date — not the 1st of the month.
    setTimeout(() => {
      const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
      snapToDay(k);
    }, 0);
  };

  // เดือนของ month view — คุมจาก toolbar sticky (Month component ซ่อน nav ของตัวเอง)
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() };
  });
  const shiftMonth = (a: { y: number; m: number }, d: number) => {
    const x = new Date(a.y, a.m + d, 1);
    return { y: x.getFullYear(), m: x.getMonth() };
  };
  const goPrev = () => (view === "month" ? setMonthAnchor((a) => shiftMonth(a, -1)) : listGoPrev());
  const goNext = () => (view === "month" ? setMonthAnchor((a) => shiftMonth(a, 1)) : listGoNext());
  const goToday = () => {
    if (view === "month") {
      const t = new Date();
      setMonthAnchor({ y: t.getFullYear(), m: t.getMonth() });
    } else listGoToday();
  };
  const shownMonth = view === "month" ? monthAnchor : visibleMonth;

  if (!me) return null;

  const viewToggle = (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
      <button type="button" onClick={() => setView("month")}
        className={`h-8 px-3 text-xs font-semibold ${view === "month" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-50"}`}
        title="Month">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      </button>
      <button type="button" onClick={() => setView("list")}
        className={`h-8 px-3 text-xs font-semibold ${view === "list" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-50"}`}
        title="List">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6h16.5M3.75 12h16.5m-16.5 6h16.5" />
        </svg>
      </button>
    </div>
  );

  return (
    <div>
      <Header title="ปฏิทิน" subtitle={followupMode ? "ลูกค้าที่มีการลงวันที่ติดตาม" : "CALENDAR"}>
        {/* Toolbar — sticky แถวเดียวใช้ทุกโหมดทุก view: nav เดือน (คุมทั้ง month/list
            จากที่นี่ ไม่มีแถบเลื่อนซ้อนในเนื้อหาอีก) + กรองทีม + สร้างนัด + สลับ view */}
        <div className="bg-white border-t border-gray-100 px-3 md:px-5 py-2">
          <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={goPrev} className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center" title="เดือนก่อน">
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button type="button" onClick={goNext} className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center" title="เดือนถัดไป">
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
              <button type="button" onClick={goToday} className="h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-semibold hover:bg-gray-50">วันนี้</button>
              <div className="text-sm md:text-base font-bold ml-1 mr-1">{TH_MONTHS[shownMonth.m]} {shownMonth.y + 543}</div>
          {/* ปุ่มกรองทีม — จุดสีในปุ่มทำหน้าที่ legend ไปในตัว (แถว legend แยกถูกยุบทิ้ง
              เพราะสื่อสีซ้ำกับปุ่มจนหน้าดูซ้อนเป็นชั้นๆ) */}
          {!followupMode && (
            <span className="inline-flex items-center gap-1.5 flex-wrap">
              {[
                { value: "all" as const, label: "ทั้งหมด", dot: null, activeCls: "bg-gray-800 text-white border-gray-800" },
                { value: "survey" as const, label: "ทีม Survey", dot: "bg-active", activeCls: "bg-active text-white border-active" },
                { value: "install" as const, label: "ทีมติดตั้ง", dot: "bg-orange-500", activeCls: "bg-orange-500 text-white border-orange-500" },
                { value: "block" as const, label: "งานอื่น", dot: "bg-gray-400", activeCls: "bg-gray-500 text-white border-gray-500" },
              ].map((opt) => {
                const active = selectedTeam === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => setSelectedTeam(opt.value)}
                    className={`px-2.5 h-8 rounded-lg text-xs font-semibold border transition-all inline-flex items-center gap-1.5 ${active ? opt.activeCls : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}
                    style={{ minHeight: 0 }}>
                    {opt.dot && <span className={`w-2.5 h-2.5 rounded-full ${active ? "bg-white/80" : opt.dot}`} />}
                    {opt.label}
                  </button>
                );
              })}
            </span>
          )}
          <div className="flex-1" />
          {!followupMode && (
            <button type="button" onClick={() => { setNewPrefillDate(undefined); setNewOpen(true); }}
              className="h-8 px-3 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-dark inline-flex items-center gap-1">
              <PlusIcon className="w-4 h-4" strokeWidth={2.5} />
              สร้างนัด
            </button>
          )}
          {viewToggle}
          </div>
        </div>
      </Header>

      <div className="px-3 md:px-5 pt-3 pb-4">
        {view === "month"
          ? <EventCalendarMonth
              key={refreshKey}
              team={team}
              year={monthAnchor.y}
              month={monthAnchor.m}
              hideNav
              onEmptyDayClick={followupMode ? undefined : (dk) => { setNewPrefillDate(dk); setNewOpen(true); }}
            />
          : <EventCalendarList
              key={refreshKey}
              monthsBack={1}
              monthsForward={3}
              hideNav
              controlledTeam={team}
              anchor={listAnchor}
              onVisibleMonthChange={(mk) => {
                const [y, m] = mk.split("-").map(Number);
                setVisibleMonth({ y, m: m - 1 });
              }}
            />}
      </div>
      {newOpen && (
        <NewAppointmentModal
          initialDate={newPrefillDate}
          onClose={() => setNewOpen(false)}
          onCreated={() => { setNewOpen(false); setRefreshKey(k => k + 1); }}
        />
      )}
    </div>
  );
}
