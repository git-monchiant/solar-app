"use client";

import { useEffect } from "react";

export default function ErrorPopup({
  message,
  onClose,
  title = "กรุณาใส่ข้อมูลให้ครบ",
}: {
  message: string | null;
  onClose: () => void;
  title?: string;
}) {
  useEffect(() => {
    if (!message) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [message, onClose]);

  if (!message) return null;

  const items = message.split(",").map(s => s.trim()).filter(Boolean);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl animate-slide-up">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-red-50 text-red-500 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="font-bold text-gray-900">{title}</div>
            <div className="text-xs text-gray-500 mt-0.5">รายการที่ยังไม่ได้กรอก</div>
          </div>
        </div>
        <ul className="space-y-1.5 mb-4">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
        <button
          onClick={onClose}
          className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-primary hover:brightness-110 transition-colors"
        >
          เข้าใจแล้ว
        </button>
      </div>
    </div>
  );
}
