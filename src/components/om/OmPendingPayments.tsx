"use client";

// ค่าบริการงาน O&M ที่รอ Account ยืนยัน — แสดงในหน้า /report/pending คิวเดียวกับฝั่งขาย
// (แผน docs/plan/20260924-02 เฟส 4 · ผู้ใช้เคาะ 24 ก.ย. "Account เหมือนฝั่งขาย" + คิวเดียว ติดป้าย O&M)
// ★ หน้าตาแถวยกจากแถวของฝั่งขายในหน้าเดียวกัน (รูปสลิป · ชื่อ · รายการ · ยอด · ปุ่ม)
// ★ แผน 20261014-06 (ผู้ใช้สั่ง "ทำให้เหมือนงานขายเลย"): ปุ่มเดียวแบบแถวฝั่งขาย — กดแล้วเปิดหน้างาน O&M ที่ขั้น 03 ชำระเงิน
//   Account ดูสลิป · ยืนยัน / ไม่อนุมัติ / เช็คเด้ง ในแผงนั้น แล้วแนบใบเสร็จตัวจริงต่อในกล่องเดิม
//   (เดิมยืนยัน/ปฏิเสธในคิวเลย เพราะ Account เข้าโมดูล O&M ไม่ได้ — ตอนนี้หน้างานเปิดให้ Account แบบอ่านอย่างเดียว ยกเว้นขั้น 03)
// ★ เช็ค / บัตรเครดิต แบบฝั่งขาย (แผน 20261002-11): เช็คกด "ยืนยันรับเช็ค" ก่อน (Sale โทรนัดได้) แล้วค่อย "ยืนยันรับเงิน" ตอนเงินเข้า
//   บัตรเครดิตแสดงยอดรวมค่าธรรมเนียม (amount = ยอดใบ · ค่าธรรมเนียมแยกคอลัมน์)

import FallbackImage from "@/components/ui/FallbackImage";
import { formatTHB } from "@/lib/utils/formatters";
import { useOpenOmService } from "@/lib/hooks/useOpenOmService";
import { OmServiceLink } from "@/components/om/OmServiceLink";

export type OmPendingPayment = {
  id: number; lead_id: number; amount: number; description: string | null; payment_method: string | null;
  submitted_at: string | null; submitted_by_name: string | null;
  quotation_id: number; quotation_doc_no: string; package_name_snapshot: string | null;
  booking_id: number; house_id: number; house_number: string | null; project_name: string | null;
  customer_name: string; phone: string | null; slip_urls: string[];
  cheque_received_at: string | null; cheque_received_by: string | null;
  cc_surcharge_pct: number | null; cc_surcharge_amount: number;
};

const METHOD: Record<string, string> = { transfer: "โอน / QR", cash: "เงินสด", other: "อื่น ๆ",
  qr: "Thai QR", bank_transfer: "โอนเข้าบัญชี", cheque: "เช็ค", cc: "บัตรเครดิต" };
const fmt = (n: number) => formatTHB(Math.round(n));
/** ยอดที่ลูกค้าจ่ายจริง — บัตรเครดิตรวมค่าธรรมเนียม */
const paidTotal = (it: OmPendingPayment) => it.amount + Number(it.cc_surcharge_amount || 0);
const methodText = (it: OmPendingPayment) => (METHOD[it.payment_method ?? ""] ?? it.payment_method)
  + (it.cc_surcharge_amount > 0 ? ` +${it.cc_surcharge_pct}% (ค่าธรรมเนียม ${fmt(it.cc_surcharge_amount)})` : "")
  + (it.payment_method === "cheque"
    ? (it.cheque_received_at ? ` · รับเช็คแล้ว${it.cheque_received_by ? ` โดย ${it.cheque_received_by}` : ""} · รอยืนยันรับเงิน` : " · รอรับเช็ค")
    : "");

export default function OmPendingPayments({ items, focusedId }: {
  items: OmPendingPayment[];
  focusedId: number | null;
}) {
  const openService = useOpenOmService();

  if (items.length === 0) return null;

  // แบบ openPaymentContext ฝั่งขาย — ตั้งคีย์ให้หน้างานเปิดการ์ดขั้น 03 ที่ขั้นย่อย "ชำระเงิน" แล้วเปิดหน้า
  //   (จอกว้าง = แท็บใหม่ · มือถือ = แท็บเดิม · localStorage ใช้ร่วมกันทุกแท็บ)
  const openPayment = (it: OmPendingPayment) => {
    localStorage.setItem(`omFocusPay_${it.house_id}`, String(it.booking_id));
    localStorage.setItem(`omPaySubStep_${it.booking_id}`, "1");
    openService(it.house_id);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1 pt-2">
        <span className="rounded-md bg-pink-50 px-2 py-0.5 text-xxs font-semibold text-pink-700">งานบริการ O&amp;M</span>
        <span className="text-xs text-gray-500">ค่าบริการรอยืนยันรับเงิน {items.length} รายการ</span>
      </div>
      <div className="space-y-2 md:space-y-0 md:bg-white md:rounded-xl md:border md:border-gray-300 md:divide-y md:divide-gray-100">
        {items.map((it) => {
          const label = `ค่าบริการ O&M · ${it.package_name_snapshot || "งานบริการตามใบเสนอราคา"}`;
          const gallery = it.slip_urls.map((u, k) => ({ url: u, label: it.slip_urls.length > 1 ? `${label} · สลิป ${k + 1} / ${it.slip_urls.length}` : label }));
          const where = [it.house_number ? `บ้าน ${it.house_number}` : null, it.project_name].filter(Boolean).join(" · ");
          // ปุ่มเดียวคลาสเดียวกับแถวฝั่งขาย — เช็คที่ยังไม่รับ = ยืนยันรับเช็ค (ส้ม) · นอกนั้น = กดยืนยันรับเงิน (เขียว)
          const action = (cls = "") => it.payment_method === "cheque" && !it.cheque_received_at ? (
            <button type="button" onClick={() => openPayment(it)}
              className={`h-8 px-3 rounded-lg text-sm font-semibold text-orange-700 bg-orange-50 border border-orange-300 hover:bg-orange-100 inline-flex items-center justify-center shrink-0 ${cls}`}>
              ยืนยันรับเช็ค
            </button>
          ) : (
            <button type="button" onClick={() => openPayment(it)}
              className={`h-8 px-3 rounded-lg text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 inline-flex items-center justify-center shrink-0 ${cls}`}>
              ยืนยันรับเงิน
            </button>
          );
          const name = <OmServiceLink houseId={it.house_id} className="font-semibold text-gray-900 hover:text-primary">{it.customer_name}</OmServiceLink>;
          return (
            <div key={it.id} id={`pending-payment-${it.id}`}
              className={focusedId === it.id ? "rounded-xl ring-2 ring-primary ring-offset-2" : ""}>
              {/* Mobile card — ผังเดียวกับแถวฝั่งขาย */}
              <div className="md:hidden bg-white rounded-xl border border-gray-300 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{name}</div>
                    <div className="text-[11px] text-gray-400 font-mono truncate">{it.quotation_doc_no}{where ? ` · ${where}` : ""}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-bold font-mono tabular-nums text-amber-600 leading-none">{fmt(paidTotal(it))}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">บาท</div>
                  </div>
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-gray-800">{label}</span>
                  <span className="text-gray-500"> · {methodText(it)} · แนบโดย {it.submitted_by_name ?? "—"}</span>
                </div>
                {it.slip_urls.length > 0 && (
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
                    {it.slip_urls.map((url, idx) => (
                      <FallbackImage key={url} src={url} alt="" className="w-14 h-14 object-cover rounded border border-gray-200 shrink-0"
                        gallery={gallery} galleryIndex={idx} />
                    ))}
                  </div>
                )}
                <div className="grid">{action("w-full")}</div>
              </div>

              {/* Desktop row */}
              <div className="hidden md:flex items-center gap-4 p-4">
                <div className="flex items-center gap-1 shrink-0">
                  {it.slip_urls.slice(0, 3).map((url, idx) => (
                    <FallbackImage key={url} src={url} alt="" className="w-12 h-12 object-cover rounded border border-gray-200"
                      gallery={gallery} galleryIndex={idx} />
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {name}
                    <span className="text-xs font-mono text-gray-400">{it.quotation_doc_no}</span>
                    {where && <span className="text-xs text-gray-500">· {where}</span>}
                    <span className="rounded bg-pink-50 px-1.5 py-0.5 text-[10px] font-bold text-pink-700">O&amp;M</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    <span className="font-semibold text-gray-700">{label}</span>
                    <span> · {methodText(it)} · แนบโดย {it.submitted_by_name ?? "—"}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold font-mono tabular-nums text-amber-600">{fmt(paidTotal(it))}</div>
                  <div className="text-xs text-gray-400">บาท</div>
                </div>
                {action()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
