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
}

/**
 * Click-to-open popover dropdown. Matches the form's input styling (h-8,
 * rounded-lg, border-gray-200) so it slots into the same 7-col grid as text
 * inputs without alignment drift. Selecting the active option again clears it.
 */
export default function Dropdown({
  value, onChange, options,
  placeholder = "— เลือก —",
  disabled, className, buttonClassName,
}: DropdownProps) {
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

  const selected = options.find(o => o.value === value);

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        className={`w-full h-8 pl-3 pr-8 rounded-lg border text-left text-sm flex items-center transition-colors focus:outline-none ${
          disabled ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
          : open    ? "bg-white border-primary"
                    : "bg-white border-gray-200 hover:border-active/40"
        } ${buttonClassName ?? ""}`}>
        <span className={`flex-1 truncate ${selected ? "text-gray-800" : "text-gray-400"}`}>
          {selected?.label ?? placeholder}
        </span>
        <svg
          className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && !disabled && (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          {options.map(opt => {
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
        </div>
      )}
    </div>
  );
}
