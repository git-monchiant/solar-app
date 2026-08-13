"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMe, ROLE_LABEL } from "@/lib/roles";
import { useDialog } from "@/components/ui/Dialog";

// เมนูผู้ใช้มุมขวาบน — avatar อักษรย่อ กดแล้วเปิด dropdown (โปรไฟล์ / ออกจากระบบ)
// ใช้บนหน้า hub ที่ไม่มี left menu · พฤติกรรม popover ตามแบบ ui/Dropdown
// (คลิกนอก/Escape ปิด) · logout = flow เดียวกับหน้า Profile รวม confirm dialog
export default function UserMenu() {
  const { me } = useMe();
  const dialog = useDialog();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!me) return null;

  const initials = (me.full_name || me.username || "?").trim().split(/\s+/).map((n) => n[0]).join("").slice(0, 2);
  const roleLabel = (me.roles ?? []).map((r) => ROLE_LABEL[r]).filter(Boolean).join(" · ");

  const logout = async () => {
    setOpen(false);
    const ok = await dialog.confirm({
      title: "ออกจากระบบ",
      message: "ออกจากระบบใช่หรือไม่?",
      variant: "danger",
      confirmText: "ออกจากระบบ",
    });
    if (!ok) return;
    if (typeof window !== "undefined") {
      localStorage.removeItem("userId");
      localStorage.removeItem("userName");
      localStorage.removeItem("activeRoles");
      window.location.href = "/login";
      return;
    }
    router.replace("/login");
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border transition-colors ${open ? "bg-white border-gray-300" : "border-transparent hover:bg-gray-100"}`}
        style={{ minHeight: 0 }}
      >
        <span className="w-9 h-9 rounded-full bg-primary/15 text-primary-dark font-bold text-sm flex items-center justify-center">{initials}</span>
        <span className="hidden md:block text-sm font-semibold text-gray-700 max-w-[140px] truncate">{me.full_name || me.username}</span>
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl border border-gray-200 shadow-lg py-1.5 z-30 animate-slide-up">
          <div className="px-4 py-2.5 border-b border-gray-100">
            <div className="text-sm font-bold text-gray-900 truncate">{me.full_name || me.username}</div>
            <div className="text-xs text-gray-500 truncate">@{me.username}{roleLabel ? ` · ${roleLabel}` : ""}</div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            ออกจากระบบ
          </button>
        </div>
      )}
    </div>
  );
}
