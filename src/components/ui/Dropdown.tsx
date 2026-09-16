"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface DropdownOption {
  value: string;
  label: ReactNode;
}

interface DropdownProps {
  value: string;
  onChange: (v: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Extra class for the button — useful for font-mono on numeric values. */
  buttonClassName?: string;
  /**
   * เปิดรายการ "พิมพ์เอง…" ท้าย popover สำหรับช่องที่ catalogue ครอบไม่หมด
   * (หน้างานเปลี่ยนอุปกรณ์เป็นรุ่นที่ยังไม่มีในแพ็กเกจได้เสมอ) ปิดไว้เป็นค่าเริ่มต้น
   * เพราะ dropdown ส่วนใหญ่ เช่น เฟสไฟ มีค่าที่เป็นไปได้แค่ชุดเดียวจริง ๆ
   */
  allowCustom?: boolean;
}

/**
 * Click-to-open popover dropdown. Matches the form's input styling (h-8,
 * rounded-lg, border-gray-200) so it slots into the same 7-col grid as text
 * inputs without alignment drift. Selecting the active option again clears it.
 */
export default function Dropdown({
  value, onChange, options,
  placeholder = "— เลือก —",
  disabled, className, buttonClassName, allowCustom,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  // โหมดพิมพ์เอง: ปุ่มกลายเป็น input ชั่วคราว ค่าจะยังไม่ถูกเขียนกลับจนกด Enter
  // หรือคลิกออก — กด Escape ทิ้งสิ่งที่พิมพ์แล้วกลับไปใช้ค่าเดิม
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
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

  const selected = options.find(o => o.value === value);
  // A stored value that isn't in `options` (brand spelled differently by an
  // OCR/import, catalogue trimmed after the record was saved) used to render
  // as the placeholder — the value was still in state, invisible, and one
  // stray click on any option wiped it. Promote it to a real option so it
  // shows in the button and survives the round-trip.
  const unlisted = !selected && value ? { value, label: value } : null;
  const shownOptions = unlisted ? [unlisted, ...options] : options;

  const startTyping = () => { setDraft(value); setTyping(true); setOpen(false); };
  const commitTyping = () => {
    if (!typing) return;
    setTyping(false);
    const next = draft.trim();
    if (next !== value) onChange(next);
  };

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      {typing ? (
        <input
          autoFocus type="text" value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitTyping}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); commitTyping(); }
            if (e.key === "Escape") { e.preventDefault(); setTyping(false); }
          }}
          className={`w-full h-8 px-3 rounded-lg border border-primary bg-white text-sm focus:outline-none ${buttonClassName ?? ""}`}
        />
      ) : (
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        className={`w-full h-8 pl-3 pr-8 rounded-lg border text-left text-sm flex items-center transition-colors focus:outline-none ${
          disabled ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
          : open    ? "bg-white border-primary"
                    : "bg-white border-gray-200 hover:border-active/40"
        } ${buttonClassName ?? ""}`}>
        <span className={`flex-1 truncate ${selected || unlisted ? "text-gray-800" : "text-gray-400"}`}>
          {selected?.label ?? unlisted?.label ?? placeholder}
        </span>
        <svg
          className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      )}

      {open && !disabled && (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          {/* ล้างค่าโดยไม่ต้องรู้ทริค: เดิมทำได้ด้วยการกดตัวที่เลือกอยู่ซ้ำ ซึ่งไม่มี
              อะไรบอกเลยว่าทำได้ ตั้งชื่อว่า "ไม่ระบุ" ไม่ใช่ "ยกเลิก" เพราะมันคือค่า
              ไม่ใช่การกระทำ — คนที่อยากแค่ปิด dropdown จะได้ไม่กดแล้วค่าหาย
              โผล่เฉพาะตอนมีค่าอยู่ ไม่งั้นจะเป็นตัวเลือกที่กดแล้วไม่เกิดอะไรขึ้น */}
          {!!value && (
            <button type="button" onClick={() => { onChange(""); setOpen(false); }}
              className="w-full h-8 px-3 text-left text-sm flex items-center text-gray-400 hover:bg-gray-50 border-b border-gray-100 mb-1 pb-1">
              <span className="truncate">— ไม่ระบุ —</span>
            </button>
          )}
          {shownOptions.map(opt => {
            const active = opt.value === value;
            return (
              <button key={opt.value} type="button"
                onClick={() => { onChange(active ? "" : opt.value); setOpen(false); }}
                className={`w-full h-8 px-3 text-left text-sm flex items-center justify-between transition-colors ${
                  active ? "bg-active-light text-active font-semibold"
                         : "text-gray-700 hover:bg-gray-50"
                }`}>
                <span className="truncate">{opt.label}</span>
                {active && (
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
          {allowCustom && (
            <button type="button" onClick={startTyping}
              className="w-full h-8 px-3 text-left text-sm flex items-center gap-1.5 text-gray-500 hover:bg-gray-50 border-t border-gray-100 mt-1 pt-1">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="truncate">พิมพ์เอง…</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
