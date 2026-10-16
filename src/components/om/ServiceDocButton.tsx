"use client";

// ปุ่มเปิดใบบริการ PDF ของใบงาน O&M (แผน 20260928-04 ข้อ 9)
// ★ หน้าตาแบบปุ่มเอกสาร "ใบส่งมอบ" ของขั้นติดตั้งฝั่งขาย (DocumentIcon + ขอบสีหลักจาง) · ส่ง className มาแทนได้
// ★ /api/om/jobs/[id]/doc ตรวจสิทธิ์ด้วย header — เปิดลิงก์ตรง ๆ ไม่ได้ (แท็บใหม่ไม่แนบ header ให้)
//   ⇒ fetch ที่แนบ header แล้วเปิดเป็น blob · เปิดแท็บเปล่ารอไว้ตั้งแต่ตอนกด (ยังอยู่ใน gesture ของผู้ใช้
//   ไม่งั้นเบราว์เซอร์บล็อก popup ที่เปิดหลังรอ fetch) แล้วค่อยส่ง PDF ตามไป
import { useState } from "react";
import { getUserContextHeaders } from "@/lib/api";
import { DocumentIcon } from "@/components/ui/icons";

export default function ServiceDocButton({ bookingId, label = "ใบบริการ", className, wrapClassName }: {
  bookingId: number; label?: string; className?: string;
  /** กล่องที่ห่อปุ่ม + ข้อความ error — แถบปุ่มท้ายการ์ดส่งคลาสที่ยืดเต็มแถวได้ */
  wrapClassName?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const open = async () => {
    setBusy(true); setErr("");
    const w = window.open("", "_blank");
    if (w) { w.document.title = "ใบบริการ"; w.document.body.innerText = "กำลังสร้างใบบริการ…"; }
    try {
      const r = await fetch(`/api/om/jobs/${bookingId}/doc`, { headers: getUserContextHeaders() });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `เปิดใบบริการไม่สำเร็จ (${r.status})`);
      const url = URL.createObjectURL(await r.blob());
      if (w) w.location.href = url; else window.location.href = url;
      // เก็บไว้พักหนึ่งให้ตัวดู PDF โหลด/บันทึกไฟล์ได้ แล้วค่อยคืนหน่วยความจำ
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
    } catch (e) {
      w?.close();
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <span className={wrapClassName ?? "inline-flex items-center gap-2 flex-wrap"}>
      <button type="button" onClick={open} disabled={busy} style={{ minHeight: 0 }}
        className={className ?? "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-primary/30 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors shrink-0 cursor-pointer disabled:opacity-50"}>
        <DocumentIcon className="w-4 h-4" strokeWidth={2} />
        {busy ? "กำลังสร้าง…" : label}
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  );
}
