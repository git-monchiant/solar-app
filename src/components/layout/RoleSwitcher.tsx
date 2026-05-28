"use client";
import { CheckIcon } from "@/components/ui/icons";

import { useState } from "react";
import { useActiveRoles, ROLE_LABEL, type Role } from "@/lib/roles";

export default function RoleSwitcher() {
  const { activeRoles, setActiveRoles, availableRoles } = useActiveRoles();
  const [open, setOpen] = useState(false);

  // Users with only one role can't switch — no switcher shown.
  if (availableRoles.length <= 1) return null;

  // "admin override" = admin active AND every role granted (admin viewer
  // sees through every role gate). Detected so the trigger label can read
  // "Admin (ทุก role)" instead of dumping the full role list.
  const adminOverride = activeRoles.includes("admin") && activeRoles.length === availableRoles.length;
  const label = adminOverride
    ? "Admin (ทุก role)"
    : activeRoles.length === 0
    ? "เลือก role"
    : activeRoles.map(r => ROLE_LABEL[r]).join(" · ");

  // One-shot switch — click a role and we commit immediately. Admin expands
  // to every available role (override mode); any other pick narrows to that
  // role exclusively. After switching we route through "/" so the landing
  // redirect picks the right page for the new role.
  const switchTo = (r: Role) => {
    const final = r === "admin" ? availableRoles : [r];
    setActiveRoles(final);
    setOpen(false);
    if (typeof window !== "undefined") window.location.href = "/";
  };

  const isActive = (r: Role) =>
    r === "admin" ? adminOverride : !adminOverride && activeRoles.length === 1 && activeRoles[0] === r;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
            <div className="text-xs text-gray-400 mb-4">กดปุ่ม role ที่ต้องการ — เปลี่ยนทันที</div>
            <div className="space-y-1.5">
              {/* Admin button first — switches into "override" mode where
                  every role gate shows through. Active role highlighted. */}
              {availableRoles.includes("admin") && (
                <button
                  type="button"
                  onClick={() => switchTo("admin")}
                  className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors ${isActive("admin") ? "border-primary bg-primary/5" : "border-gray-200 hover:bg-gray-50"}`}
                >
                  <span className="flex-1">
                    <span className={`block text-sm font-semibold ${isActive("admin") ? "text-primary" : "text-gray-700"}`}>{ROLE_LABEL.admin}</span>
                    <span className="block text-xxs text-gray-400">เห็นทุก role + สิทธิ์ admin</span>
                  </span>
                  {isActive("admin") && (
                    <CheckIcon className="w-4 h-4 text-primary mt-0.5" strokeWidth={2.5} />
                  )}
                </button>
              )}
              {availableRoles.filter(r => r !== "admin").map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => switchTo(r)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${isActive(r) ? "border-primary bg-primary/5" : "border-gray-200 hover:bg-gray-50"}`}
                >
                  <span className={`flex-1 text-sm font-semibold ${isActive(r) ? "text-primary" : "text-gray-700"}`}>{ROLE_LABEL[r]}</span>
                  {isActive(r) && (
                    <CheckIcon className="w-4 h-4 text-primary" strokeWidth={2.5} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
