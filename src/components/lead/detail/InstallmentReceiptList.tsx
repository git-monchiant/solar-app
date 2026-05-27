"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import ReceiptButtons from "./ReceiptButtons";
import ActualReceiptUpload from "./ActualReceiptUpload";

interface PaymentRow {
  id: number;
  slip_field: string;
  confirmed_at: string | null;
  amount: number;
  actual_receipt_url: string | null;
}

interface Props {
  leadId: number;
  preDocNo: string | null;
  /** "before" → install_pos < installation; "after" → after install completes. */
  when: "before" | "after";
  /** Bump to re-fetch payments after upload/delete. */
  refreshKey?: number;
  /** Parent refresh handler — bubbled up so the lead row also re-fetches. */
  refresh: () => Promise<unknown> | void;
  /** Optional: installment metadata (parsed from lead.order_installments) so
   * each row can be labelled with the correct "(ก่อน/หลังติดตั้ง)" suffix and
   * filter respects the user-edited plan. */
  installments?: Array<{ when?: string }>;
  /** Compact = tight inline-row rendering for done-header. Default = bordered card. */
  compact?: boolean;
}

/**
 * Renders one row per *confirmed* installment payment matching `when`:
 *   [งวดที่ N · ฿amount]  [ใบเสร็จ PDF]  [อัพโหลด/ลิงก์ใบเสร็จตัวจริง]
 *
 * Falls back gracefully when there are no matching confirmed installments
 * (caller is expected to keep showing the legacy stage-level buttons in that
 * case).
 */
export default function InstallmentReceiptList({ leadId, preDocNo, when, refreshKey, refresh, installments, compact }: Props) {
  const [rows, setRows] = useState<PaymentRow[] | null>(null);

  const reload = async () => {
    const rs = await apiFetch(`/api/payments?lead_id=${leadId}`) as PaymentRow[];
    setRows(rs || []);
  };

  useEffect(() => { reload().catch(console.error); }, [leadId, refreshKey]);

  if (rows === null) return null;

  // Confirmed installment payments, in index order.
  const installmentPayments = rows
    .map(r => {
      const m = /^order_installment_(\d+)$/.exec(r.slip_field || "");
      if (!m) return null;
      return { ...r, idx: parseInt(m[1]) };
    })
    .filter((r): r is PaymentRow & { idx: number } => !!r && !!r.confirmed_at)
    .sort((a, b) => a.idx - b.idx);

  // Filter by when, using the lead's installment plan to look up each idx.
  const matched = installmentPayments.filter(p => {
    const plan = installments?.[p.idx];
    if (!plan) return true; // legacy: no plan info → show in both
    return (plan.when || "before") === when;
  });

  if (matched.length === 0) return null;

  // Running count of receipts across all installments so "ใบเสร็จตัวจริง N"
  // numbers continue instead of restarting per งวด.
  const parseCount = (raw: string | null): number => {
    if (!raw) return 0;
    const v = raw.trim();
    if (!v) return 0;
    if (v.startsWith("[")) {
      try {
        const arr = JSON.parse(v);
        if (Array.isArray(arr)) return arr.filter(x => typeof x === "string" && !!x).length;
      } catch { /* fall through */ }
    }
    return 1;
  };
  let runningOffset = 0;
  const withOffsets = matched.map(p => {
    const offset = runningOffset;
    runningOffset += parseCount(p.actual_receipt_url);
    return { ...p, offset };
  });

  // Compact = inline-row rendering, sized to fit alongside step title in
  // done-header. Each งวด gets its own line: "งวด N · download · upload".
  if (compact) {
    return (
      <div className="flex flex-col items-start md:items-end gap-3 md:gap-1 w-full md:w-auto">
        {withOffsets.map(p => {
          const label = `งวด ${p.idx + 1}`;
          const fileLabel = `${preDocNo || `lead_${leadId}`}_inst${p.idx + 1}`;
          return (
            <div key={p.id} className="w-full md:w-auto">
              {/* Label: above tiles on mobile, inline on desktop */}
              <span className="block md:inline text-xs text-gray-500 font-semibold md:mr-2">{label}</span>
              {/* Tiles container: 4-col grid on mobile (full width, room for
                  caption below each tile), inline-flex on desktop */}
              <div className="mt-1.5 md:mt-0 md:inline-flex md:items-center md:gap-2 grid grid-cols-4 gap-2">
                {!p.actual_receipt_url && (
                  <ReceiptButtons
                    leadId={leadId}
                    stage="installment"
                    paymentId={p.id}
                    fileLabel={fileLabel}
                    modalLabel={`ใบเสร็จ ${label}`}
                    compact
                  />
                )}
                <ActualReceiptUpload
                  leadId={leadId}
                  paymentId={p.id}
                  url={p.actual_receipt_url}
                  fileLabel={fileLabel}
                  refresh={async () => { await reload(); await refresh(); }}
                  compact
                  startIndex={p.offset}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {withOffsets.map(p => {
        const label = `งวดที่ ${p.idx + 1}`;
        const amountStr = p.amount ? `฿${Math.round(p.amount).toLocaleString()}` : "";
        const fileLabel = `${preDocNo || `lead_${leadId}`}_inst${p.idx + 1}`;
        return (
          <div key={p.id} className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-gray-900">{label}</span>
              {amountStr && <span className="text-sm font-mono tabular-nums text-gray-700">{amountStr}</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {!p.actual_receipt_url && (
                <ReceiptButtons
                  leadId={leadId}
                  stage="installment"
                  paymentId={p.id}
                  fileLabel={fileLabel}
                  modalLabel={`ใบเสร็จ ${label}`}
                />
              )}
              <ActualReceiptUpload
                leadId={leadId}
                paymentId={p.id}
                url={p.actual_receipt_url}
                fileLabel={fileLabel}
                refresh={async () => { await reload(); await refresh(); }}
                startIndex={p.offset}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
