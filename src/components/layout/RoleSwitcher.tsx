"use client";
import { CheckIcon } from "@/components/ui/icons";

import { useState } from "react";
import { useActiveRoles, ROLE_LABEL, type Role } from "@/lib/roles";

// Modal เลือก role — แยกจากปุ่ม trigger เพื่อให้ที่อื่น (เช่น UserMenu) เปิดได้เอง
export function RolePickerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeRoles, setActiveRoles, availableRoles } = useActiveRoles();

  // "admin override" = admin active AND every role granted (admin viewer
  // sees through every role gate).
  const adminOverride = activeRoles.includes("admin") && activeRoles.length === availableRoles.length;

  // One-shot switch — click a role and we commit immediately. Admin expands
  // to every available role (override mode); any other pick narrows to that
  // role exclusively.
  const switchTo = (r: Role) => {
    const final = r === "admin" ? availableRoles : [r];
    setActiveRoles(final);
    onClose();
    // ไม่ redirect — การสลับ role แค่กรองสิทธิ์การเห็นในที่ (emitRoles broadcast อยู่แล้ว)
  };

  const isActive = (r: Role) =>
    r === "admin" ? adminOverride : !adminOverride && activeRoles.length === 1 && activeRoles[0] === r;

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-[85%] max-w-sm p-5 animate-slide-up">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100 flex items-center justify-center"
          aria-label="ปิด"
          style={{ minHeight: 0 }}
        >
          ✕
        </button>
        <div className="text-base font-bold mb-1">Role Switcher</div>
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
  );
}

// ปุ่ม trigger เดิม (ยังใช้ได้ที่อื่นถ้าต้องการ) — ตอนนี้หน้า hub เปิดผ่าน UserMenu แทน
export default function RoleSwitcher() {
  const { activeRoles, availableRoles } = useActiveRoles();
  const [open, setOpen] = useState(false);

  // Users with only one role can't switch — no switcher shown.
  if (availableRoles.length <= 1) return null;

  const adminOverride = activeRoles.includes("admin") && activeRoles.length === availableRoles.length;
  const label = adminOverride
    ? "Admin (ทุก role)"
    : activeRoles.length === 0
    ? "เลือก role"
    : activeRoles.map(r => ROLE_LABEL[r]).join(" · ");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={label}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 transition-colors hover:border-gray-300 sm:max-w-48 sm:px-3 md:max-w-none"
        style={{ minHeight: 0 }}
      >
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
        <span className="min-w-0 truncate hidden sm:block">{label}</span>
        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      <RolePickerModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
