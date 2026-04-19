"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface InvoiceData {
  id: number;
  reference_no: string;
  amount: number;
  description: string;
  installment: string;
  is_pre_survey: boolean;
  full_name: string;
  phone: string;
  project_name: string | null;
  installation_address: string | null;
  survey_date: string | null;
  survey_time_slot: string | null;
  install_date: string | null;
  created_at: string;
  packages: { id: number; name: string; kwp: number; price: number }[];
}

const CO = {
  name: "SENA SOLAR ENERGY CO., LTD.",
  address: "448 Ratchadaphisek Rd., Sam Sen Nok, Huai Khwang, Bangkok 10310",
  taxId: "0105552041258",
  phone: "02-541-4642",
  bank: "TMBThanachart Bank PCL.",
  bankBranch: "Esplanade Ratchada Branch",
  bankAcc: "667-2-03155-3",
  bankName: "SENA SOLAR ENERGY CO., LTD.",
};

const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(n);
const slotMap: Record<string, string> = { am: "9:00 - 12:00", morning: "9:00 - 12:00", pm: "13:00 - 16:00", afternoon: "13:00 - 16:00" };
const thaiDate = (s: string) => new Date(s.slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

export default function InvoicePage() {
  const { token } = useParams();
  const [d, setD] = useState<InvoiceData | null>(null);

  useEffect(() => {
    fetch(`/api/invoice/${token}/data`).then(r => r.json()).then(setD).catch(console.error);
  }, [token]);

  if (!d) return <div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary animate-spin" /></div>;

  return (
    <div className="bg-gray-100 min-h-screen py-4 print:py-0 print:bg-white">
      <style>{`
        @page { size: A5; margin: 0; }
        @media print { body { margin: 0; background: white; } }
      `}</style>
      <div className="mx-auto bg-white flex flex-col shadow-xl print:shadow-none" style={{ width: "148mm", minHeight: "210mm" }} id="receipt">
        {/* Header strip */}
        <div className="bg-primary text-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold text-[16px] leading-tight tracking-wide">{CO.name}</div>
              <div className="text-[11px] opacity-90 leading-snug mt-1">{CO.address}</div>
              <div className="text-[11px] opacity-90 leading-snug">Tax ID: {CO.taxId} · Tel: {CO.phone}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wider opacity-80 leading-tight">Payment Request</div>
              <div className="text-[16px] font-bold leading-tight mt-0.5">ใบแจ้งโอนเงิน</div>
            </div>
          </div>
        </div>

        {/* Ref + Date */}
        <div className="px-5 py-2.5 flex justify-between text-[12px] text-gray-500 border-b border-gray-100">
          <span>REF: <span className="font-mono tabular-nums text-gray-800 font-semibold">{d.reference_no}</span></span>
          <span>วันที่: <span className="text-gray-800 font-semibold">{thaiDate(d.created_at)}</span></span>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex-1 flex flex-col gap-4">
          {/* Customer card */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">ลูกค้า</div>
            <div className="text-[15px] font-bold text-gray-900">{d.full_name}</div>
            <div className="text-[12px] text-gray-600 mt-1 space-y-0.5">
              {d.phone && <div>โทร. {d.phone}</div>}
              {d.project_name && <div>โครงการ {d.project_name}</div>}
              {d.installation_address && <div className="truncate">ที่อยู่ {d.installation_address}</div>}
            </div>
          </div>

          {/* Item + Amount */}
          <div className="border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">รายการ</div>
                  <div className="text-[15px] font-semibold text-gray-900 mt-0.5">{d.description || "ค่าชำระ"}</div>
                </div>
                {d.installment && (
                  <span className="shrink-0 text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5">{d.installment}</span>
                )}
              </div>
              {d.is_pre_survey && d.survey_date && (
                <div className="text-[12px] text-gray-500 mt-1">
                  นัดสำรวจ {thaiDate(d.survey_date)} {slotMap[d.survey_time_slot || ""] || ""}
                </div>
              )}
              {!d.is_pre_survey && d.install_date && (
                <div className="text-[12px] text-gray-500 mt-1">
                  กำหนดติดตั้ง {thaiDate(d.install_date)}
                </div>
              )}
            </div>
            <div className="px-4 py-3 bg-active-light/30 flex items-end justify-between">
              <div className="text-[11px] uppercase tracking-wider text-gray-500">ยอดที่ต้องโอน</div>
              <div className="text-[26px] font-bold font-mono tabular-nums text-gray-900 leading-none">
                {fmt(d.amount)} <span className="text-[13px] font-medium text-gray-500">บาท</span>
              </div>
            </div>
          </div>

          {/* Packages — label changes based on step */}
          {d.packages.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                {d.is_pre_survey ? "แพ็คเกจที่สนใจ" : "แพ็คเกจที่เลือก"}
              </div>
              <ul className="text-[12px] text-gray-800 space-y-0.5 pl-1">
                {d.packages.map(p => (
                  <li key={p.id} className="flex gap-2">
                    <span className="text-gray-400">-</span>
                    <span className="flex-1 min-w-0">{p.kwp > 0 ? `Solar Rooftop ${p.kwp} kWp` : p.name}</span>
                    <span className="font-mono tabular-nums text-gray-600 shrink-0">{fmt(p.price)} THB</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Bank info — prominent */}
          <div className="border border-gray-200 bg-primary/5 p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11m16-11v11M8 14v3m4-3v3m4-3v3" />
              </svg>
              ช่องทางการโอน
            </div>
            <div className="space-y-2 text-[12px]">
              <div>
                <div className="text-gray-500 text-[10px]">ธนาคาร</div>
                <div className="font-semibold text-gray-900">{CO.bank} · {CO.bankBranch}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-gray-500 text-[10px]">เลขบัญชี</div>
                  <div className="font-bold font-mono tabular-nums text-gray-900 text-[13px]">{CO.bankAcc}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-[10px]">PromptPay (Tax ID)</div>
                  <div className="font-bold font-mono tabular-nums text-gray-900 text-[13px]">{CO.taxId}</div>
                </div>
              </div>
              <div>
                <div className="text-gray-500 text-[10px]">ชื่อบัญชี</div>
                <div className="font-semibold text-gray-900">{CO.bankName}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-100 px-5 py-2.5 text-[11px] text-gray-500 text-center space-y-0.5">
          <div>กรุณาโอนแล้วส่งสลิปยืนยันกลับทาง LINE · หากมีข้อสงสัยติดต่อ {CO.phone}</div>
          <div className="text-[10px] text-gray-400">*เมื่อชำระครบทุกงวดแล้ว ท่านจะได้รับใบเสร็จตัวจริง</div>
        </div>
      </div>
    </div>
  );
}
