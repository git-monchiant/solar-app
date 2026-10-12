"use client";

import { useState } from "react";
import ModalBase from "@/components/ui/ModalBase";
import { apiFetch } from "@/lib/api";
import { hasRole, useActiveRoles } from "@/lib/roles";

/**
 * ดึงลีดที่ยกเลิก (lost) กลับมาติดตาม
 *
 * เดิมลีดที่ยกเลิกแล้วไม่มีทางกลับ ปุ่ม Set Revisit Date เก็บวันไว้เฉย ๆ เพราะหน้า Today
 * ตัดลีด lost ออกทุกคิว หน้าต่างนี้จึงบังคับวันติดตามถัดไปเสมอ ลีดจะกลับเข้าคิวทันที
 *
 * งานจริงทำที่ PATCH /api/leads/[id] (reopen_from_lost) — คืนสถานะก่อนยกเลิกจากประวัติ
 * ล้างเหตุผลที่ยกเลิก และบันทึกเหตุผลเดิมลง Timeline · เซลส์ทุกคนกดได้
 */

const GRADES = [
  { g: "A", title: "พร้อมซื้อทันที", color: "text-emerald-600" },
  { g: "B", title: "อยู่ระหว่างเปรียบเทียบ", color: "text-sky-600" },
  { g: "C", title: "พิจารณาความคุ้มค่า", color: "text-amber-500" },
  { g: "D", title: "สนใจแต่ยังไม่พร้อม", color: "text-orange-500" },
  { g: "E", title: "หาข้อมูลทั่วไป", color: "text-gray-500" },
] as const;

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type Props = {
  leadId: number;
  currentGrade: string | null;
  lostReason: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export function ReopenLeadModal({ leadId, currentGrade, lostReason, onClose, onSaved }: Props) {
  const [followUp, setFollowUp] = useState(tomorrowIso());
  const [grade, setGrade] = useState<string | null>(null);
  const [gradeReason, setGradeReason] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Grade F คือ "ไม่สนใจ" ถ้าคงไว้ลีดจะถูกนับเป็นยกเลิกซ้ำ จึงต้องเลือกใหม่
  const needsGrade = currentGrade === "F";
  const needsGradeReason = grade === "A";
  const canSubmit = Boolean(followUp)
    && (!needsGrade || Boolean(grade))
    && (!needsGradeReason || gradeReason.trim().length > 0)
    && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reopen_from_lost: true,
          next_follow_up: followUp,
          reopen_note: note.trim() || null,
          ...(needsGrade ? { customer_grade: grade, grade_change_reason: gradeReason.trim() || null } : {}),
        }),
      });
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
      title={<span className="text-emerald-700">ดึงกลับมาติดตาม</span>}
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white">
            ยกเลิก
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-40 active:bg-emerald-700 transition-colors"
          >
            {saving ? "กำลังบันทึก..." : "ยืนยันดึงกลับมาติดตาม"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 space-y-1">
          <div>
            <span className="font-semibold text-gray-700">เหตุผลที่เคยยกเลิก:</span> {lostReason || "ไม่ได้ระบุ"}
          </div>
          <div>
            ลีดจะกลับไปที่ขั้นตอนก่อนยกเลิก (ถ้ายกเลิกตอนรออนุมัติ/ชำระ จะกลับไปที่รอใบเสนอราคา)
            และขึ้นในคิวติดตามของหน้า Today ตามวันที่กำหนด
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-gray-700">วันติดตามครั้งถัดไป <span className="text-red-500">*</span></span>
          <input
            type="date"
            value={followUp}
            onChange={e => setFollowUp(e.target.value)}
            className="mt-1 w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary"
          />
        </label>

        {needsGrade && (
          <div>
            <span className="text-xs font-semibold text-gray-700">Grade ใหม่ <span className="text-red-500">*</span></span>
            <p className="text-xs text-gray-500 mb-1.5">Grade เดิมคือ F (ไม่สนใจ) ต้องเลือกใหม่ก่อนดึงกลับ</p>
            <div className="grid grid-cols-5 gap-1.5">
              {GRADES.map(opt => (
                <button
                  key={opt.g}
                  type="button"
                  onClick={() => setGrade(opt.g)}
                  className={`flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border transition-all ${
                    grade === opt.g ? "bg-active text-white border-active" : "bg-white border-gray-200 hover:border-active/40"
                  }`}
                >
                  <span className={`text-base font-bold leading-none ${grade === opt.g ? "" : opt.color}`}>{opt.g}</span>
                  <span className={`text-xxs leading-tight text-center ${grade === opt.g ? "opacity-90" : "text-gray-500"}`}>{opt.title}</span>
                </button>
              ))}
            </div>
            {needsGradeReason && (
              <input
                value={gradeReason}
                onChange={e => setGradeReason(e.target.value)}
                placeholder="ระบุสัญญาณความสนใจ/เหตุผลที่ปรับเป็น Grade A"
                className="mt-2 w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary"
              />
            )}
          </div>
        )}

        <label className="block">
          <span className="text-xs font-semibold text-gray-700">หมายเหตุ</span>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="เช่น ลูกค้าติดต่อกลับมาเอง สนใจอีกครั้ง"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary"
          />
        </label>

        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>
    </ModalBase>
  );
}

/** ปุ่มในแบนเนอร์ Closed Lost — แสดงเฉพาะลีดสถานะยกเลิก และเฉพาะทีมขาย */
export default function ReopenLeadButton({ leadId, status, currentGrade, lostReason, onSaved }: {
  leadId: number;
  status: string;
  currentGrade: string | null;
  lostReason: string | null;
  onSaved: () => void;
}) {
  const { activeRoles } = useActiveRoles();
  const [open, setOpen] = useState(false);
  if (status !== "lost" || !hasRole(activeRoles, "admin", "sales", "sales_sup")) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-2 w-full h-8 rounded-lg text-xs font-semibold text-white bg-emerald-600 active:bg-emerald-700"
      >
        ดึงกลับมาติดตาม
      </button>
      {open && (
        <ReopenLeadModal
          leadId={leadId}
          currentGrade={currentGrade}
          lostReason={lostReason}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
