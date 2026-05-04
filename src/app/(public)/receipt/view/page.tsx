"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { formatSlotsRange } from "@/lib/time-slots";

interface ReceiptData {
  stage: "deposit" | "order_before" | "order_after" | "installment";
  receipt_no: string;
  created_at: string;
  total_price: number;
  description: string;
  line_items: { label: string; amount: number }[];
  remarks: string | null;
  order_total: number | null;
  full_name: string;
  phone: string;
  project_name: string | null;
  id_card_address: string | null;
  id_card_number: string | null;
  installation_address: string | null;
  survey_date: string | null;
  survey_time_slot: string | null;
  packages: { id: number; name: string; kwp: number; price: number }[];
  signer: { full_name: string; signature_url: string | null } | null;
  customer_signature_url: string | null;
}

const CO = {
  name: "SENA SOLAR ENERGY CO., LTD.",
  address: "448 Ratchadaphisek Rd., Sam Sen Nok, Huai Khwang, Bangkok 10310",
  taxId: "0105552041258",
  phone: "02-541-4642",
  bank: "TMBThanachart Bank PCL., Esplanade Ratchada Branch",
  bankAcc: "667 2 03155 3",
  bankName: "SENA SOLAR ENERGY CO., LTD.",
  ppId: "0859099890",
};

const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(n);

const STAGE_TITLE: Record<string, string> = {
  deposit: "SOLAR ROOFTOP SURVEY / TEMPORARY RECEIPT",
  order_before: "SOLAR ROOFTOP INSTALLATION / PRE-INSTALLATION RECEIPT",
  order_after: "SOLAR ROOFTOP INSTALLATION / FINAL PAYMENT RECEIPT",
  installment: "SOLAR ROOFTOP INSTALLATION / TEMPORARY RECEIPT",
};

function ReceiptContent() {
  const params = useSearchParams();
  const [d, setD] = useState<ReceiptData | null>(null);
  // Caller can override the document title via ?title=... — used when the same
  // receipt template is reused for different document kinds (e.g. booking
  // confirmation vs. temporary receipt). Falls back to the stage default.
  const titleOverride = params.get("title");

  useEffect(() => {
    const qs = new URLSearchParams();
    const leadId = params.get("lead_id");
    const stage = params.get("stage") || "deposit";
    const userId = params.get("user_id");
    if (leadId) qs.set("lead_id", leadId);
    qs.set("stage", stage);
    if (userId) qs.set("user_id", userId);
    const paymentId = params.get("payment_id");
    if (paymentId) qs.set("payment_id", paymentId);
    fetch(`/api/receipt/data?${qs.toString()}`).then(r => r.json()).then(setD).catch(console.error);
  }, [params]);

  if (!d) return <div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  const showSurvey = d.stage === "deposit";
  const docTitle = titleOverride || STAGE_TITLE[d.stage];

  return (
    <div className="bg-white min-h-screen print:min-h-0 receipt-root">
      <style>{`
        @page { size: A4; margin: 0; }
        @media print { body { margin: 0; } }
        .receipt-root { font-size: 14px; line-height: 1.4; font-weight: 400; }
        .receipt-root .text-xs { font-size: 12px !important; line-height: 16px !important; }
        .receipt-root .text-sm { font-size: 14px !important; line-height: 20px !important; }
        .receipt-root .text-base { font-size: 16px !important; line-height: 24px !important; }
        .receipt-root .text-lg { font-size: 18px !important; line-height: 28px !important; }
        .receipt-root .text-xl { font-size: 20px !important; line-height: 28px !important; }
      `}</style>
      <div className="max-w-[210mm] mx-auto flex flex-col" id="receipt">
        <div className="bg-primary text-white px-8 py-4 text-center">
          <div className="font-bold text-xl tracking-wide">{CO.name}</div>
          <div className="text-sm mt-1 opacity-90">{CO.address}</div>
          <div className="text-sm opacity-90">Tax ID: {CO.taxId} | Tel: {CO.phone}</div>
        </div>

        <div className="px-10 pt-4 pb-3 flex flex-col flex-1">
          <div className="text-center font-bold text-lg tracking-wide uppercase mb-2">{docTitle}</div>

          <div className="flex justify-between text-sm text-gray-500 mb-3">
            <span>RECEIPT NO: {d.receipt_no}</span>
            <span>DATE: {new Date(String(d.created_at).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}</span>
          </div>
          <hr className="border-gray-200 mb-4" />

          <div className="text-sm font-bold uppercase mb-2">CUSTOMER INFORMATION</div>
          <div className="grid grid-cols-2 gap-x-8 text-sm mb-4 pl-2">
            <div className="grid grid-cols-[80px_1fr] gap-y-1.5">
              <span className="text-gray-400">NAME</span><span>{d.full_name}</span>
              <span className="text-gray-400">PHONE</span><span>{d.phone || "-"}</span>
              {d.id_card_number && <><span className="text-gray-400">TAX ID</span><span>{d.id_card_number}</span></>}
            </div>
            <div className="grid grid-cols-[80px_1fr] gap-y-1.5">
              <span className="text-gray-400">PROJECT</span><span>{d.project_name || "-"}</span>
              <span className="text-gray-400">ADDRESS</span><span>{d.id_card_address || d.installation_address || "-"}</span>
            </div>
          </div>
          <hr className="border-gray-200 mb-4" />

          <table className="w-full text-sm mb-3">
            <thead>
              <tr className="bg-gray-100 uppercase text-gray-500 text-xs">
                <th className="text-left py-2 px-3 font-semibold">DESCRIPTION</th>
                <th className="text-center py-2 px-3 font-semibold w-14">QTY</th>
                <th className="text-right py-2 px-3 font-semibold w-24">UNIT PRICE</th>
                <th className="text-right py-2 px-3 font-semibold w-24">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {(d.line_items && d.line_items.length > 0 ? d.line_items : [{ label: d.description, amount: d.total_price }]).map((it, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 px-3">{it.label}</td>
                  <td className="text-center py-2 px-3">1</td>
                  <td className="text-right py-2 px-3">{it.amount < 0 ? `-${fmt(Math.abs(it.amount))}` : fmt(it.amount)}</td>
                  <td className="text-right py-2 px-3">{it.amount < 0 ? `-${fmt(Math.abs(it.amount))}` : fmt(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {d.packages.length > 0 && (
            <div className="pl-3 mb-2 space-y-0.5">
              {d.packages.map(p => {
                // After survey/quotation, use the agreed order_total instead of the catalog price
                const useQuote = d.packages.length === 1 && d.order_total && d.order_total > 0;
                const price = useQuote ? d.order_total! : p.price;
                return (
                  <div key={p.id} className="flex items-center gap-1.5 text-sm text-gray-600">
                    <span className="w-4 h-4 border border-gray-400 inline-flex items-center justify-center text-[10px] leading-none font-bold">✓</span>
                    {p.kwp > 0 ? `Solar Rooftop ${p.kwp} kWp` : p.name} — {fmt(price)} THB
                  </div>
                );
              })}
            </div>
          )}

          {d.remarks && (
            <div className="pl-3 mb-2 text-xs text-gray-500">
              <span className="font-semibold">หมายเหตุ:</span> {d.remarks}
            </div>
          )}

          {showSurvey && d.survey_date && (
            <div className="bg-yellow-100 py-2 px-4 font-bold text-sm mb-4">
              SURVEY DATE: {(() => { const dt = new Date(String(d.survey_date).slice(0, 10) + "T12:00:00"); return dt.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }); })()} {formatSlotsRange(d.survey_time_slot)}
            </div>
          )}

          <div className="flex justify-end mb-4">
            <div className="border border-gray-300 px-6 py-2.5 flex items-center gap-8">
              <span className="font-bold text-sm uppercase">TOTAL</span>
              <span className="font-bold text-xl">{fmt(d.total_price)}</span>
            </div>
          </div>

          {d.stage === "deposit" && (
            <div className="bg-gray-50 border border-gray-100 rounded px-3 py-2 mb-4">
              <div className="text-[11px] text-gray-400 leading-snug">
                <b>REMARKS:</b> 1. ราคาดังกล่าวเป็นราคามาตรฐานสำหรับระบบ Solar Rooftop ติดตั้งในบ้านพักอาศัย (มีเฟสไฟฟ้า 1 เฟส) ทั้งนี้ ในกรณีที่มีการก่อสร้างหรือโครงสร้างพิเศษเพิ่มเติม ทางบริษัทขอสงวนสิทธิ์ในการพิจารณาเสนอราคาใหม่ตามความเหมาะสม 2. กรณีไม่สามารถดำเนินการติดตั้งได้ บริษัทฯ จะทำการคืนเงินจองให้แก่ลูกค้าเต็มจำนวน กรณีสามารถดำเนินการติดตั้งได้ เงินจำนวน 1,000 บาท จะนำไปหักเป็นส่วนลดค่าระบบ Solar ทั้งนี้ หากลูกค้าเป็นฝ่ายยกเลิก บริษัทฯ ขอสงวนสิทธิ์ไม่คืนเงินในทุกกรณี
              </div>
            </div>
          )}

          <div className="text-xs text-gray-500 space-y-0.5 mb-4">
            <div>TRANSFER TO: {CO.bankName}</div>
            <div>ACCOUNT NO: {CO.bankAcc}</div>
            <div>BANK: {CO.bank}</div>
            <div>PROMPTPAY TAX ID: {CO.taxId}</div>
          </div>

          {/* Same wrapper height (h-12) on both sides so the line baselines line up,
              regardless of whether the signature image is rendered. */}
          <div className="flex justify-around mb-3 mt-10 text-xs text-gray-500">
            <div className="text-center">
              <div className="relative w-44 h-12 mb-1">
                {d.customer_signature_url && (
                  <img
                    src={d.customer_signature_url}
                    alt="customer signature"
                    className="absolute inset-x-0 bottom-0 mx-auto max-h-12 object-contain"
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 border-b border-gray-300" />
              </div>
              <div>SIGNATURE</div>
              <div>({d.full_name || ".............................................."})</div>
            </div>
            <div className="text-center">
              <div className="relative w-44 h-12 mb-1">
                {d.signer?.signature_url && (
                  <img
                    src={d.signer.signature_url}
                    alt="signature"
                    className="absolute inset-x-0 bottom-0 mx-auto max-h-12 object-contain"
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 border-b border-gray-300" />
              </div>
              <div>RECEIVED BY</div>
              <div>({d.signer?.full_name || ".............................................."})</div>
            </div>
          </div>

          <div className="text-center text-[11px] text-gray-400 border-t border-gray-100 pt-2">
            {CO.address} | Tel: {CO.phone}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReceiptViewPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>}>
      <ReceiptContent />
    </Suspense>
  );
}
