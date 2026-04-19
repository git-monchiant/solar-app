"use client";

import { useEffect, useRef } from "react";

interface Props {
  date: string;
  onDateChange: (date: string) => void;
  days?: number;
  pastDays?: number;
  futureDays?: number;
}

export default function DateSlider({ date, onDateChange, days, pastDays = 3, futureDays = 30 }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const total = days ?? (pastDays + futureDays + 1);
  const offset = days ? pastDays : pastDays;
  const dates = Array.from({ length: total }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + (i - offset));
    return d;
  });

  // Auto-select today if no date
  useEffect(() => {
    if (!date) {
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      onDateChange(todayIso);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll selected to center
  useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      const el = selectedRef.current;
      const container = scrollRef.current;
      const target = el.offsetLeft - container.clientWidth / 2 + el.offsetWidth / 2;
      container.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    }
  }, [date]);

  // Snap scroll to nearest item center
  const handleScrollEnd = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const centerX = container.scrollLeft + container.clientWidth / 2;
    const buttons = container.querySelectorAll("button");
    let closest: HTMLButtonElement | null = null;
    let minDist = Infinity;
    buttons.forEach(btn => {
      const btnCenter = btn.offsetLeft + btn.offsetWidth / 2;
      const dist = Math.abs(btnCenter - centerX);
      if (dist < minDist) { minDist = dist; closest = btn as HTMLButtonElement; }
    });
    if (closest) {
      const iso = (closest as HTMLButtonElement).dataset.iso;
      if (iso && iso !== date) onDateChange(iso);
    }
  };

  const scroll = (dir: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir * 56 * 3, behavior: "smooth" });
  };

  return (
    <div className="relative">
      {/* Center indicator */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-14 rounded-xl border-2 border-active bg-active/10 pointer-events-none z-10" />
      {/* Arrow buttons for desktop */}
      <button type="button" onClick={() => scroll(-1)} style={{ minHeight: 0 }} className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white shadow border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
      </button>
      <button type="button" onClick={() => scroll(1)} style={{ minHeight: 0 }} className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white shadow border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
      </button>
      <div
        ref={scrollRef}
        onScroll={() => { clearTimeout((scrollRef.current as unknown as { _t?: ReturnType<typeof setTimeout> })?._t); (scrollRef.current as unknown as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(handleScrollEnd, 150); }}
        className="flex gap-1 overflow-x-auto scrollbar-hide py-1 snap-x snap-mandatory"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {/* Left padding to allow first item to center */}
        <div className="shrink-0" style={{ width: "calc(50% - 28px)" }} />
        {dates.map(d => {
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const selected = date === iso;
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const dayName = d.toLocaleDateString("th-TH", { weekday: "short" });

          return (
            <button
              key={iso}
              ref={selected ? selectedRef : undefined}
              data-iso={iso}
              type="button"
              onClick={() => onDateChange(iso)}
              style={{ minHeight: 0, scrollSnapAlign: "center" }}
              className={`shrink-0 w-14 py-2.5 rounded-xl flex flex-col items-center transition-all ${
                selected
                  ? "text-active font-bold"
                  : isWeekend
                  ? "text-red-400"
                  : "text-gray-500"
              }`}
            >
              <span className="text-[11px] font-semibold">{dayName}</span>
              <span className="text-lg font-bold leading-tight">{d.getDate()}</span>
            </button>
          );
        })}
        {/* Right padding */}
        <div className="shrink-0" style={{ width: "calc(50% - 28px)" }} />
      </div>
    </div>
  );
}
