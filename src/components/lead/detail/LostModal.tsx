"use client";

import { useState } from "react";
import ModalBase from "@/components/ui/ModalBase";

// Reason taxonomy from docs/lead-master-lists.md (sheet master).
// Groups roughly map to sheet sections §6/28, §8, §14, §19, plus free-text.
type Group = {
  key: string;
  title: string;
  // Tailwind tokens — kept as strings (not template-built) so the JIT keeps them.
  accent: {
    text: string;       // header title + count
    bg: string;         // card background
    border: string;     // card border
    headBg: string;     // card head strip background
    selBorder: string;  // selected row border
    selBg: string;      // selected row bg
    selText: string;    // selected row text
    selDot: string;     // selected radio dot bg
  };
  icon: React.ReactNode;
  items: string[];
};

const REASON_GROUPS: Group[] = [
  {
    key: "contact",
    title: "ติดต่อไม่ได้ / ข้อมูลผิด",
    accent: {
      text: "text-gray-700",
      bg: "bg-gray-50",
      border: "border-gray-200",
      headBg: "bg-gray-100/70",
      selBorder: "border-gray-500",
      selBg: "bg-gray-100",
      selText: "text-gray-800",
      selDot: "bg-gray-600",
    },
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L21 21M5.636 5.636L3 3" />
      </svg>
    ),
    items: [
      "ติดต่อลูกค้าไม่ได้ - ไม่รับสาย",
      "ข้อมูลติดต่อไม่ถูกต้อง",
    ],
  },
  {
    key: "not_interested",
    title: "ลูกค้าไม่สนใจ",
    accent: {
      text: "text-orange-700",
      bg: "bg-orange-50/40",
      border: "border-orange-200",
      headBg: "bg-orange-100/70",
      selBorder: "border-orange-500",
      selBg: "bg-orange-50",
      selText: "text-orange-800",
      selDot: "bg-orange-500",
    },
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 18.5a6.5 6.5 0 100-13 6.5 6.5 0 000 13z" />
      </svg>
    ),
    items: [
      "ไม่คุ้ม - ไม่อยู่บ้านกลางวัน",
      "คู่แข่งราคาถูกกว่า",
      "คู่แข่งอุปกรณ์ถูกกว่า",
      "คู่แข่งติดตั้งได้เร็วกว่า",
      "กลัวเรื่องความปลอดภัย",
      "กลัวเรื่องหลังคารั่ว",
    ],
  },
  {
    key: "lost_sale",
    title: "ปิดการขายไม่สำเร็จ",
    accent: {
      text: "text-red-700",
      bg: "bg-red-50/40",
      border: "border-red-200",
      headBg: "bg-red-100/70",
      selBorder: "border-red-500",
      selBg: "bg-red-50",
      selText: "text-red-700",
      selDot: "bg-red-500",
    },
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
      </svg>
    ),
    items: [
      "เปลี่ยนใจ",
      "คู่แข่งถูกกว่า",
      "ราคาสูง",
    ],
  },
  {
    key: "finance",
    title: "สินเชื่อ",
    accent: {
      text: "text-violet-700",
      bg: "bg-violet-50/40",
      border: "border-violet-200",
      headBg: "bg-violet-100/70",
      selBorder: "border-violet-500",
      selBg: "bg-violet-50",
      selText: "text-violet-800",
      selDot: "bg-violet-500",
    },
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
      </svg>
    ),
    items: [
      "สินเชื่อไม่อนุมัติ - ลูกค้ายกเลิก",
    ],
  },
];

const OTHER = "อื่นๆ";

interface Props {
  leadId: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function LostModal({ leadId, onClose, onSaved }: Props) {
  const [reason, setReason] = useState("");
  const [otherNote, setOtherNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOther = reason === OTHER;
  const finalReason = isOther ? otherNote.trim() : reason;
  const canSubmit = finalReason.length > 0 && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({
          status: "lost",
          lost_reason: finalReason,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `บันทึกไม่สำเร็จ (HTTP ${res.status})`);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalBase
      title={
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
          <span className="text-red-600">ปิดงาน — ยกเลิกลูกค้า</span>
        </div>
      }
      onClose={onClose}
      size="2xl"
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white">
            ยกเลิก
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-bold disabled:opacity-40 active:bg-red-600 transition-colors"
          >
            {saving ? "กำลังบันทึก..." : "ยืนยันปิดงาน"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-gray-500 -mt-1">
          เลือกเหตุผลที่ตรงที่สุด — งานจะย้ายไปแท็บ <span className="font-semibold text-gray-700">"ยกเลิกและส่งกลับ"</span> ทันที
        </p>

        {/* Group cards. Mobile 1 col → Tablet 2 col → Desktop 4 col side-by-side
            so all groups are visible horizontally without scroll. items-start
            keeps cards top-aligned despite uneven item counts (1–6). */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
          {REASON_GROUPS.map((g) => (
            <section
              key={g.key}
              className={`rounded-xl border ${g.accent.border} ${g.accent.bg} overflow-hidden flex flex-col`}
            >
              <header className={`flex items-center gap-1.5 px-2.5 py-2 ${g.accent.headBg} ${g.accent.text}`}>
                {g.icon}
                <span className="text-xs font-bold flex-1 leading-tight">{g.title}</span>
                <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full bg-white/70 ${g.accent.text}`}>
                  {g.items.length}
                </span>
              </header>
              <div className="p-1.5 space-y-1 flex-1">
                {g.items.map((r) => {
                  const selected = reason === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReason(r)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg border text-[13px] leading-snug transition-colors flex items-start gap-2 ${
                        selected
                          ? `${g.accent.selBorder} ${g.accent.selBg} ${g.accent.selText} font-semibold`
                          : "border-transparent bg-white/70 text-gray-700 hover:bg-white"
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 mt-0.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${selected ? g.accent.selBorder : "border-gray-300"}`}>
                        {selected && <span className={`w-1.5 h-1.5 rounded-full ${g.accent.selDot}`} />}
                      </span>
                      <span className="flex-1">{r}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* Other group — dashed border, full-width to give the textarea room. */}
        <section className={`rounded-xl border-2 border-dashed ${isOther ? "border-gray-700 bg-gray-50" : "border-gray-300 bg-white"} overflow-hidden`}>
          <button
            type="button"
            onClick={() => setReason(OTHER)}
            className="w-full text-left px-3 py-2.5 flex items-center gap-2.5"
          >
            <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${isOther ? "border-gray-700" : "border-gray-300"}`}>
              {isOther && <span className="w-2 h-2 rounded-full bg-gray-700" />}
            </span>
            <svg className={`w-4 h-4 ${isOther ? "text-gray-700" : "text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span className={`flex-1 text-sm font-semibold ${isOther ? "text-gray-800" : "text-gray-700"}`}>อื่นๆ — พิมพ์เหตุผลเอง</span>
          </button>
          {isOther && (
            <div className="px-3 pb-3">
              <textarea
                value={otherNote}
                onChange={(e) => setOtherNote(e.target.value)}
                rows={3}
                autoFocus
                placeholder="พิมพ์เหตุผล..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:border-gray-500 resize-none"
              />
            </div>
          )}
        </section>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>
    </ModalBase>
  );
}
