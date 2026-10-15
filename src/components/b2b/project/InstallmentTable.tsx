"use client";

import { formatThaiDate, formatTHB } from "@/lib/utils/formatters";
import {
  INSTALLMENT_STATUS_LABEL, INSTALLMENT_STATUS_TONE, INSTALLMENT_TRIGGER_LABEL, type B2bInstallment,
} from "@/lib/b2b/project";

// งวดเงินของโครงการ (แผน 20261015-07 เฟส 3) — ปุ่มตามบทบาท:
//   Solar B2B: ถึงกำหนด (งวดที่ยังไม่ถึง) · แนบหลักฐานรับเงิน (ถึงกำหนด/แนบใหม่ระหว่างรอบัญชี)
//   บัญชี/admin: ยืนยันรับเงิน · ตีกลับ (งวดที่แนบหลักฐานแล้ว)
export default function InstallmentTable({ items, contractValue, vatPct, canEdit, canConfirm, busyId, onDue, onAttach, onConfirm, onReject, onView }: {
  items: B2bInstallment[]; contractValue: number | null; vatPct: number | null;
  canEdit: boolean; canConfirm: boolean; busyId: number | null;
  onDue: (it: B2bInstallment) => void; onAttach: (it: B2bInstallment) => void;
  onConfirm: (it: B2bInstallment) => void; onReject: (it: B2bInstallment) => void; onView: (it: B2bInstallment) => void;
}) {
  const sum = items.reduce((s, x) => s + x.total, 0);
  const paid = items.filter((x) => x.status === "paid").reduce((s, x) => s + x.total, 0);
  const num = "px-3 py-2 text-right tabular-nums whitespace-nowrap";
  const btn = "h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap disabled:opacity-50";
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <h3 className="text-sm font-bold text-gray-900">งวดเงิน</h3>
        {contractValue != null && <span className="text-xs text-gray-500">สัญญา {formatTHB(contractValue, { decimals: 2 })} (ก่อน VAT){vatPct != null ? ` · VAT ${vatPct}%` : ""}</span>}
        <span className="ml-auto text-xs text-gray-500">รับแล้ว <b className="text-emerald-700 tabular-nums">{formatTHB(paid, { decimals: 2 })}</b> / {formatTHB(sum, { decimals: 2 })} บาท</span>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">ยังไม่มีงวดเงิน — สร้างเองตอนกดได้งาน</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="px-3 py-2 font-semibold">งวด</th>
                <th className="px-3 py-2 font-semibold">เมื่อ</th>
                <th className={`${num} font-semibold`}>ยอด (รวม VAT)</th>
                <th className="px-3 py-2 font-semibold">สถานะ</th>
                <th className="px-3 py-2 font-semibold text-right"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2 whitespace-nowrap"><b>{it.no}</b> <span className="text-gray-500">· {it.pct}%</span></td>
                  <td className="px-3 py-2 min-w-[14rem]">
                    <div className="text-gray-800">{it.condition}</div>
                    {it.trigger_key && <div className="text-xs text-gray-400">ถึงกำหนดเมื่อ: {INSTALLMENT_TRIGGER_LABEL[it.trigger_key] ?? it.trigger_key}</div>}
                  </td>
                  <td className={num}>
                    <span className="font-medium">{formatTHB(it.total, { decimals: 2 })}</span>
                    <div className="text-xs text-gray-400">ก่อน VAT {formatTHB(it.amount, { decimals: 2 })}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${INSTALLMENT_STATUS_TONE[it.status]}`}>{INSTALLMENT_STATUS_LABEL[it.status]}</span>
                    {it.status === "submitted" && <div className="text-xs text-gray-500 mt-0.5">ลูกค้าชำระ {formatThaiDate(it.received_date)} · แนบโดย {it.submitted_by_name ?? "—"}</div>}
                    {it.status === "paid" && <div className="text-xs text-gray-500 mt-0.5">ยืนยัน {formatThaiDate(it.confirmed_at)}{it.confirmed_by_name ? ` · ${it.confirmed_by_name}` : ""}</div>}
                    {it.status === "due" && it.reject_note && <div className="text-xs text-red-600 mt-0.5">บัญชีตีกลับ: {it.reject_note}</div>}
                    {it.submit_note && it.status !== "due" && <div className="text-xs text-gray-400 mt-0.5 max-w-[16rem] break-words">{it.submit_note}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col items-end gap-1.5">
                      {it.has_evidence && (
                        <button type="button" onClick={() => onView(it)} className={`${btn} border border-gray-200 text-gray-600 hover:bg-gray-50`}>ดูหลักฐาน</button>
                      )}
                      {canEdit && it.status === "pending" && (
                        <button type="button" disabled={busyId === it.id} onClick={() => onDue(it)} className={`${btn} border border-amber-300 text-amber-700 hover:bg-amber-50`}>ถึงกำหนด</button>
                      )}
                      {canEdit && (it.status === "due" || it.status === "submitted") && (
                        <button type="button" disabled={busyId === it.id} onClick={() => onAttach(it)}
                          className={`${btn} ${it.status === "due" ? "bg-active text-white hover:bg-active-dark" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                          {it.status === "due" ? "แนบหลักฐานรับเงิน" : "แนบใหม่"}
                        </button>
                      )}
                      {canConfirm && it.status === "submitted" && (
                        <>
                          <button type="button" disabled={busyId === it.id} onClick={() => onReject(it)} className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`}>ตีกลับ…</button>
                          <button type="button" disabled={busyId === it.id} onClick={() => onConfirm(it)} className={`${btn} bg-emerald-500 text-white hover:bg-emerald-600`}>ยืนยันรับเงิน</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
