"use client";

import { formatThaiDate } from "@/lib/utils/formatters";
import { tierOfStatus, type B2bQuote, type ReviewTier } from "@/lib/b2b/quotation";

// ลำดับลงชื่อของใบเสนอราคา B2B — ผู้เสนอราคา → ผู้ตรวจสอบ 1 → 2 → 3 (ตามช่องลงชื่อในแม่แบบ SSE)
// ใช้ทั้งหน้าใบเสนอราคาและหน้าอนุมัติ — ชั้นที่รอ = กรอบม่วง · อนุมัติแล้ว = เขียว (ชื่อ · วันเวลา · หมายเหตุ)
export default function TierTracker({ q }: { q: Pick<B2bQuote, "status" | "proposer" | "reviews"> }) {
  const waiting = tierOfStatus(q.status);
  const submitted = q.status !== "draft" && q.status !== "changes_required";
  const box = "flex-1 min-w-[9rem] border border-gray-200 px-3 py-2 text-sm leading-snug bg-white";
  const cell = (title: string, s: { name: string | null; at: string | null; note?: string | null } | null, state: "done" | "wait" | "idle") => (
    <div className={`${box} ${state === "done" ? "bg-emerald-50" : state === "wait" ? "bg-active-light ring-2 ring-inset ring-active" : ""}`}>
      <div className={`text-xs font-bold ${state === "done" ? "text-emerald-700" : state === "wait" ? "text-active-dark" : "text-gray-400"}`}>
        {state === "done" ? "✓ " : state === "wait" ? "● " : "○ "}{title}
      </div>
      {state === "done" && s ? (
        <>
          <div className="text-gray-800">{s.name ?? "—"}</div>
          <div className="text-xs text-gray-500">{formatThaiDate(s.at, { time: true })}</div>
          {s.note && <div className="text-xs text-gray-500 mt-0.5 break-words">&ldquo;{s.note}&rdquo;</div>}
        </>
      ) : (
        <div className="text-gray-400">{state === "wait" ? "รออนุมัติ" : "ยังไม่ถึงคิว"}</div>
      )}
    </div>
  );
  return (
    <div className="flex flex-wrap rounded-lg overflow-hidden border border-gray-200 [&>div+div]:border-l-0">
      {cell("ผู้เสนอราคา", q.proposer, submitted ? "done" : "idle")}
      {([1, 2, 3] as ReviewTier[]).map((t) => (
        <div key={t} className="contents">
          {cell(`ผู้ตรวจสอบ ${t}`, q.reviews[t], q.reviews[t].at && submitted ? "done" : waiting === t ? "wait" : "idle")}
        </div>
      ))}
    </div>
  );
}
