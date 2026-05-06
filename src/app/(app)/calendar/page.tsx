"use client";

import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import EventCalendarList from "@/components/calendar/EventCalendarList";
import EventCalendarMonth from "@/components/calendar/EventCalendarMonth";
import NewAppointmentModal from "@/components/calendar/NewAppointmentModal";
import { useMe } from "@/lib/roles";
import { apiFetch } from "@/lib/api";

// Admin-only calendar page. Toggles between a month-grid and a list view —
// both back the same data source as Today's "ปฏิทิน" tab.
export default function CalendarPage() {
  const { me } = useMe();
  const isAdmin = (me?.roles || []).includes("admin");
  const [view, setView] = useState<"month" | "list">("list");
  const [newOpen, setNewOpen] = useState(false);
  const [newPrefillDate, setNewPrefillDate] = useState<string | undefined>(undefined);
  const [zones, setZones] = useState<{ id: number; name: string; color?: string | null }[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>("all");
  useEffect(() => { apiFetch("/api/zones").then(setZones).catch(console.error); }, []);

  // First load: snap to today's row so the calendar opens AT today, not at
  // the top of the back-extended window. We retry briefly to wait for the
  // list rendering to finish.
  useEffect(() => {
    if (view !== "list") return;
    const t = new Date();
    const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    let tries = 0;
    const tick = () => {
      const el = document.getElementById(`day-${k}`);
      if (el) { el.scrollIntoView({ behavior: "auto", block: "start" }); return; }
      if (++tries < 20) setTimeout(tick, 50);
    };
    tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
      const el = document.getElementById(`day-${k}`);
      if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
    }, 0);
  };

  if (!me) return null;
  if (!isAdmin) {
    return (
      <div>
        <Header title="ตารางงาน" subtitle="CALENDAR" />
        <div className="p-4 md:p-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500 text-center">
            ต้องเป็น admin เท่านั้น
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="ตารางงาน" subtitle="CALENDAR">
        {/* Toolbar lives inside Header so the entire title row + controls
            stays as ONE sticky block — nothing in here scrolls away. */}
        <div className="bg-white border-t border-gray-100 px-3 md:px-5 py-2">
          <div className="flex items-center gap-2 flex-wrap">
          {view === "list" && (
            <>
              <button type="button" onClick={listGoPrev} className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center" title="เดือนก่อน">
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button type="button" onClick={listGoNext} className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center" title="เดือนถัดไป">
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
              <button type="button" onClick={listGoToday} className="h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-semibold hover:bg-gray-50">วันนี้</button>
              <div className="text-sm md:text-base font-bold ml-1">{TH_MONTHS[visibleMonth.m]} {visibleMonth.y + 543}</div>
            </>
          )}
          <span className="inline-flex items-center gap-3 text-xs ml-2 flex-wrap">
            {zones.map((z) => (
              <span key={z.id} className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: z.color || "#9ca3af" }} />
                {z.name}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-300 border border-gray-400" />งานอื่น</span>
          </span>
          <div className="flex-1" />
          <button type="button" onClick={() => { setNewPrefillDate(undefined); setNewOpen(true); }}
            className="h-9 px-3 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-dark inline-flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            สร้างนัด
          </button>
          <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
            <button type="button" onClick={() => setView("month")}
              className={`h-9 px-3 text-xs font-semibold ${view === "month" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-50"}`}
              title="Month">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </button>
            <button type="button" onClick={() => setView("list")}
              className={`h-9 px-3 text-xs font-semibold ${view === "list" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-50"}`}
              title="List">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6h16.5M3.75 12h16.5m-16.5 6h16.5" />
              </svg>
            </button>
          </div>
          </div>
          {/* Zone chips — second row, still inside the sticky Header. */}
          <div className="flex gap-2 flex-wrap mt-2">
            <button type="button" onClick={() => setSelectedZone("all")}
              className={`px-3 h-8 rounded-lg text-xs font-semibold border transition-all ${selectedZone === "all" ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200"}`}
              style={{ minHeight: 0 }}>All</button>
            {zones.map((z) => {
              const active = selectedZone === z.name;
              return (
                <button key={z.id} type="button" onClick={() => setSelectedZone(z.name)}
                  className="px-3 h-8 rounded-lg text-xs font-semibold border transition-all inline-flex items-center gap-1.5"
                  style={{
                    minHeight: 0,
                    backgroundColor: active && z.color ? z.color : "white",
                    borderColor: z.color || "#e5e7eb",
                    color: active ? "white" : (z.color || "#4b5563"),
                  }}>
                  {!active && z.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: z.color }} />}
                  {z.name}
                </button>
              );
            })}
          </div>
        </div>
      </Header>

      <div className="px-3 md:px-5 pt-3 pb-4">
        {view === "month"
          ? <EventCalendarMonth
              key={refreshKey}
              onEmptyDayClick={(dk) => { setNewPrefillDate(dk); setNewOpen(true); }}
            />
          : <EventCalendarList
              key={refreshKey}
              monthsBack={1}
              monthsForward={3}
              hideNav
              controlledZone={selectedZone}
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
