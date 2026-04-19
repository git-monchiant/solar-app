"use client";

import { useState, useRef, useEffect } from "react";
import { useActiveRoles, ROLE_LABEL, type Role } from "@/lib/roles";

export default function RoleSwitcher() {
  const { activeRoles, setActiveRoles, availableRoles } = useActiveRoles();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (availableRoles.length <= 1) return null;

  const toggle = (r: Role) => {
    if (r === "admin") return; // admin role is locked on
    const next = activeRoles.includes(r) ? activeRoles.filter(x => x !== r) : [...activeRoles, r];
    if (next.length === 0) return;
    setActiveRoles(next);
  };

  const visibleActive = activeRoles.filter(r => r !== "admin");
  const visibleAvailable = availableRoles.filter(r => r !== "admin");
  const label = visibleActive.length === visibleAvailable.length
    ? "All roles"
    : visibleActive.length === 0
    ? "Admin only"
    : visibleActive.map(r => ROLE_LABEL[r]).join(" · ");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors"
        style={{ minHeight: 0 }}
      >
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
        {label}
        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">View as</div>
          {availableRoles.filter(r => r !== "admin").map(r => (
            <label key={r} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={activeRoles.includes(r)}
                onChange={() => toggle(r)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">{ROLE_LABEL[r]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
