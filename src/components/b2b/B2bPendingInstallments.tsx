"use client";

import { useRouter } from "next/navigation";
import { formatThaiDate, formatTHB } from "@/lib/utils/formatters";

// งวดเงินโครงการ B2B ที่รอบัญชียืนยัน — แสดงในหน้า /report/pending คิวเดียวกับฝั่งขาย/O&M (แผน 20261015-07 เฟส 3)
// ★ ยกผังแถวจาก OmPendingPayments (ป้ายแหล่ง · ชื่อ · รายการ · ยอด · ปุ่มเดียว) · กดแล้วเปิดหน้าโครงการแท็บงวดเงิน
//   บัญชีเปิดหลักฐาน · ยืนยัน / ตีกลับ ในหน้านั้น (แบบหน้าลีด/งานบริการ O&M) — จอกว้างเปิดแท็บใหม่ มือถือเปิดแท็บเดิม

export type B2bPendingInstallment = {
  id: number; no: number; pct: number; condition: string; amount: number; vat: number; total: number;
  received_date: string | null; submitted_at: string | null; submitted_by_name: string | null;
  evidence_name: string | null; evidence_mime: string | null;
  project_id: number; project_code: string; project_name: string; customer_name: string; contract_no: string | null;
};

const fmt = (n: number) => formatTHB(Math.round(n));

export default function B2bPendingInstallments({ items }: { items: B2bPendingInstallment[] }) {
  const router = useRouter();
  if (items.length === 0) return null;
  const open = (it: B2bPendingInstallment) => {
    const url = `/b2b/projects/${it.project_id}?tab=installments`;
    if (window.innerWidth >= 768) window.open(url, "_blank");
    else router.push(url);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1 pt-2">
        <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xxs font-semibold text-teal-700">โครงการ B2B</span>
        <span className="text-xs text-gray-500">งวดเงินรอยืนยัน {items.length} รายการ</span>
      </div>
      <div className="space-y-2 md:space-y-0 md:bg-white md:rounded-xl md:border md:border-gray-300 md:divide-y md:divide-gray-100">
        {items.map((it) => {
          const label = `งวดที่ ${it.no} (${it.pct}%) · ${it.condition}`;
          const sub = `${it.project_code}${it.contract_no ? ` · สัญญา ${it.contract_no}` : ""} · ลูกค้าชำระ ${it.received_date ? formatThaiDate(it.received_date) : "—"} · แนบโดย ${it.submitted_by_name ?? "—"}`;
          const button = (cls = "") => (
            <button type="button" onClick={() => open(it)}
              className={`h-8 px-3 rounded-lg text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 inline-flex items-center justify-center shrink-0 ${cls}`}>
              กดยืนยันรับเงิน
            </button>
          );
          return (
            <div key={it.id} id={`pending-b2b-${it.id}`}>
              <div className="md:hidden bg-white rounded-xl border border-gray-300 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-gray-900">{it.customer_name}</div>
                    <div className="text-[11px] text-gray-400 truncate">{it.project_name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-bold font-mono tabular-nums text-amber-600 leading-none">{fmt(it.total)}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">บาท (รวม VAT)</div>
                  </div>
                </div>
                <div className="text-xs"><span className="font-semibold text-gray-800">{label}</span><div className="text-gray-500">{sub}</div></div>
                <div className="grid">{button("w-full")}</div>
              </div>
              <div className="hidden md:flex items-center gap-4 p-4">
                <div className="w-12 h-12 shrink-0 rounded border border-gray-200 bg-gray-50 flex items-center justify-center text-[10px] font-bold text-gray-400">
                  {it.evidence_mime === "application/pdf" ? "PDF" : "รูป"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{it.customer_name}</span>
                    <span className="text-xs text-gray-500">· {it.project_name}</span>
                    <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">B2B</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5"><span className="font-semibold text-gray-700">{label}</span> · {sub}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold font-mono tabular-nums text-amber-600">{fmt(it.total)}</div>
                  <div className="text-xs text-gray-400">บาท (รวม VAT)</div>
                </div>
                {button()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
