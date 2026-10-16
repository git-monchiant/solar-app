"use client";

import { useState } from "react";
import Link from "next/link";
import { formatThaiDate, formatTHB } from "@/lib/utils/formatters";
import type { B2bProjectQuote } from "@/lib/b2b/project";
import { QUOTE_KIND_LABEL, QUOTE_STATUS_LABEL, QUOTE_STATUS_TONE } from "@/lib/b2b/quotation";

// ใบเสนอราคาของโครงการ (Rev ล่าสุดของแต่ละเลขที่) — ในการ์ดขั้นราคาประมาณการ/ราคายืนยัน · กดแถวไปหน้าใบ
export default function QuoteList({ quotes, canAdd, onAdd, title = "ใบเสนอราคา" }: { quotes: B2bProjectQuote[]; canAdd: boolean; onAdd?: () => void; title?: string }) {
  const num = "px-3 py-2 text-right tabular-nums whitespace-nowrap";
  // เวลาอ้างอิงป้าย "หมดอายุ" — จับครั้งเดียวตอนแสดง (render ต้องให้ผลเดิมทุกครั้ง)
  const [now] = useState(() => Date.now());
  const expiry = (q: B2bProjectQuote) => {
    if (!q.issue_date || q.validity_days == null) return null;
    const d = new Date(`${q.issue_date}T00:00:00+07:00`);
    d.setDate(d.getDate() + q.validity_days);
    return d;
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <h3 className="text-sm font-bold text-gray-900 whitespace-nowrap">{title}</h3>
        <span className="max-md:hidden text-xs text-gray-400">อนุมัติ 3 ชั้นก่อนส่งลูกค้า · ต่อรอง = ออก Rev ใหม่</span>
        {canAdd && onAdd && (
          <button type="button" onClick={onAdd} className="ml-auto h-8 px-3 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 whitespace-nowrap">+ สร้างใบเสนอราคา</button>
        )}
      </div>
      {quotes.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">ยังไม่มีใบเสนอราคา{canAdd ? " — เลือก BOQ ตัวเลือกที่จะเสนอ" : ""}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="px-3 py-2 font-semibold">เลขที่ · Rev</th>
                <th className="px-3 py-2 font-semibold">จาก BOQ</th>
                <th className={`${num} font-semibold`}>ราคา (ก่อน VAT)</th>
                <th className="px-3 py-2 font-semibold">สถานะ</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">ยืนยันราคาถึง</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const exp = expiry(q);
                const expired = exp && exp.getTime() < now && (q.status === "sent" || q.status === "approved");
                return (
                  <tr key={q.id} className="border-t border-gray-100 hover:bg-primary/5">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link href={`/b2b/quotations/${q.id}`} className="font-semibold text-gray-900 hover:text-primary">{q.doc_no}</Link>
                      <span className="ml-1 text-gray-400">Rev {q.revision}</span>
                      <div className="text-xs text-gray-400">{QUOTE_KIND_LABEL[q.kind]}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-600 min-w-[10rem]">{q.option_label || "—"}<div className="text-xs text-gray-400">{q.boq_doc_no} Rev {q.boq_revision}</div></td>
                    <td className={`${num} font-medium`}>{formatTHB(q.subtotal, { decimals: 0 })}</td>
                    <td className="px-3 py-2"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${QUOTE_STATUS_TONE[q.status]}`}>{QUOTE_STATUS_LABEL[q.status]}</span></td>
                    <td className={`px-3 py-2 whitespace-nowrap ${expired ? "text-red-600 font-semibold" : "text-gray-500"}`}>
                      {exp ? formatThaiDate(exp) : "—"}{expired && " · หมดอายุ"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
