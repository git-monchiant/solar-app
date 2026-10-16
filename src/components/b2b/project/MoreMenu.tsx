"use client";

import { useEffect, useRef, useState } from "react";

// เมนู ⋯ ของหน้าโครงการ (แผน 20261016-01) — ปุ่มรองที่ใช้นาน ๆ ครั้ง (แพ้งาน · ยกเลิก · ถอย/ข้ามขั้น · แก้ข้อมูล)
//   ปิดเมื่อกดนอกเมนูหรือกด Esc แบบ Dropdown กลาง

export type MoreItem = { key: string; label: string; hint?: string; danger?: boolean; onClick: () => void };

export default function MoreMenu({ groups }: {
  /** แต่ละกลุ่มคั่นด้วยเส้น · กลุ่มว่างถูกข้าม */
  groups: MoreItem[][];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = groups.filter((g) => g.length > 0);
  if (shown.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="เมนูเพิ่มเติม" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((x) => !x)} style={{ minHeight: 0 }}
        className={`w-9 h-9 rounded-lg border flex items-center justify-center hover:bg-gray-50 ${open ? "border-gray-300 bg-gray-50" : "border-gray-200 bg-white"}`}>
        <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
          {shown.map((g, gi) => (
            <div key={g[0].key} className={gi > 0 ? "mt-1 pt-1 border-t border-gray-100" : ""}>
              {g.map((it) => (
                <button key={it.key} type="button" role="menuitem" style={{ minHeight: 0 }}
                  onClick={() => { setOpen(false); it.onClick(); }}
                  className={`w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${it.danger ? "text-red-600" : "text-gray-700"}`}>
                  {it.label}
                  {it.hint && <span className="block text-xxs leading-tight text-gray-400">{it.hint}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
