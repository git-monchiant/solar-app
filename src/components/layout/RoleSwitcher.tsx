"use client";

import { useState } from "react";
import { useActiveRoles, useMe, ROLE_LABEL, type Role } from "@/lib/roles";

export default function RoleSwitcher() {
  const { activeRoles, setActiveRoles, availableRoles } = useActiveRoles();
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Role[]>(activeRoles);

  if (availableRoles.length <= 1) return null;

  const visibleActive = activeRoles.filter(r => r !== "admin");
  const visibleAvailable = availableRoles.filter(r => r !== "admin");
  const label = visibleActive.length === visibleAvailable.length
    ? "All roles"
    : visibleActive.length === 0
    ? "Admin only"
    : visibleActive.map(r => ROLE_LABEL[r]).join(" · ");

  const openModal = () => { setDraft(activeRoles); setOpen(true); };

  const toggle = (r: Role) => {
    if (r === "admin") return; // admin locked on
    setDraft(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  };

  const confirm = () => {
    // If the user has the admin role, always keep it active so a bad
    // selection can't lock them out of admin-only screens.
    const hasAdmin = me?.roles?.includes("admin") ?? false;
    const next = hasAdmin ? Array.from(new Set<Role>(["admin", ...draft])) : draft;
    if (next.length === 0) return;
    setActiveRoles(next);
    setOpen(false);
    // Force a full refresh so every cached fetch + role-gated render re-runs
    // with the new role set — avoids stale lists/menus from the previous role.
    if (typeof window !== "undefined") window.location.reload();
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors"
        style={{ minHeight: 0 }}
      >
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
        {label}
        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl w-[85%] max-w-sm p-5 animate-slide-up">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100 flex items-center justify-center"
              aria-label="ปิด"
              style={{ minHeight: 0 }}
            >
              ✕
            </button>
            <div className="text-base font-bold mb-1">เปลี่ยนมุมมอง (Role)</div>
            <div className="text-xs text-gray-400 mb-4">กด "ตกลง" เพื่อเปลี่ยน — หน้าจะ refresh ใหม่</div>
            <div className="space-y-1 mb-4">
              {visibleAvailable.map(r => {
                const checked = draft.includes(r);
                return (
                  <label key={r} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer border border-gray-200">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(r)}
                      className="w-4 h-4 rounded border-gray-300 accent-primary"
                    />
                    <span className="text-sm font-semibold text-gray-700">{ROLE_LABEL[r]}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-700"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={draft.length === 0}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
