"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface ReceiptData {
  booking_number: string;
  created_at: string;
  total_price: number;
  package_id: number;
  full_name: string;
  phone: string;
  project_name: string;
  id_card_address: string;
  id_card_number: string;
  survey_date: string | null;
  survey_time_slot: string | null;
  packages: { id: number; name: string; kwp: number; price: number }[];
}

const CO = {
  name: "SENA SOLAR ENERGY CO., LTD. (Head Office)",
  address: "448 Ratchadaphisek Rd., Sam Sen Nok, Huai Khwang, Bangkok 10310",
  taxId: "0105552041258",
  phone: "02-541-4642",
  bank: "TMBThanachart Bank PCL., Esplanade Ratchada Branch",
  bankAcc: "667 2 03155 3",
  bankName: "SENA SOLAR ENERGY CO., LTD.",
  ppId: "0859099890",
};

const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(n);
const slotMap: Record<string, string> = { am: "9:00 - 12:00", morning: "9:00 - 12:00", pm: "13:00 - 16:00", afternoon: "13:00 - 16:00" };

export default function ReceiptPage() {
  const { bookingId } = useParams();
  const [d, setD] = useState<ReceiptData | null>(null);

  useEffect(() => {
    fetch(`/api/receipt/data?booking_id=${bookingId}`).then(r => r.json()).then(setD).catch(console.error);
  }, [bookingId]);

  if (!d) return <div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  const qr = `/api/qr?amount=${d.total_price}&format=image&name=${encodeURIComponent(d.full_name)}`;

  return (
    <div className="bg-white min-h-screen print:min-h-0">
      <style>{`@page { size: A4; margin: 0; } @media print { body { margin: 0; } }`}</style>
      <div className="max-w-[210mm] mx-auto flex flex-col" id="receipt">
        {/* Header */}
        <div className="bg-primary text-white px-8 py-4 text-center">
          <div className="font-bold text-xl tracking-wide">{CO.name}</div>
          <div className="text-sm mt-1 opacity-90">{CO.address}</div>
          <div className="text-sm opacity-90">Tax ID: {CO.taxId} | Tel: {CO.phone}</div>
        </div>

        <div className="px-10 pt-4 pb-3 flex flex-col flex-1">
          {/* Title */}
          <div className="text-center font-bold text-lg tracking-widest uppercase mb-2">SOLAR ROOFTOP BOOKING / TEMPORARY RECEIPT</div>

          {/* Receipt info */}
          <div className="flex justify-between text-sm text-gray-500 mb-3">
            <span>RECEIPT NO: {d.booking_number}</span>
            <span>DATE: {new Date(d.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" })}</span>
          </div>
          <hr className="border-gray-200 mb-4" />

          {/* Customer — 2 columns */}
          <div className="text-sm font-bold uppercase mb-2">CUSTOMER INFORMATION</div>
          <div className="grid grid-cols-2 gap-x-8 text-sm mb-4 pl-2">
            <div className="grid grid-cols-[80px_1fr] gap-y-1.5">
              <span className="text-gray-400">NAME</span><span>{d.full_name}</span>
              <span className="text-gray-400">PHONE</span><span>{d.phone || "-"}</span>
              {d.id_card_number && <><span className="text-gray-400">TAX ID</span><span>{d.id_card_number}</span></>}
            </div>
            <div className="grid grid-cols-[80px_1fr] gap-y-1.5">
              <span className="text-gray-400">PROJECT</span><span>{d.project_name || "-"}</span>
              <span className="text-gray-400">ADDRESS</span><span>{d.id_card_address || "-"}</span>
            </div>
          </div>
          <hr className="border-gray-200 mb-4" />

          {/* Items table */}
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
              <tr className="border-b border-gray-100">
                <td className="py-2 px-3">Solar Rooftop Booking Deposit</td>
                <td className="text-center py-2 px-3">1</td>
                <td className="text-right py-2 px-3">{fmt(d.total_price)}</td>
                <td className="text-right py-2 px-3">{fmt(d.total_price)}</td>
              </tr>
            </tbody>
          </table>

          {/* Package options */}
          <div className="pl-3 mb-3 space-y-1">
            {d.packages.map(p => (
              <div key={p.id} className="flex items-center gap-2 text-sm text-gray-600">
                <span className="w-4 h-4 border border-gray-400 inline-flex items-center justify-center text-xs leading-none font-bold">✓</span>
                Solar Rooftop {p.kwp} kWp — Stand Price {fmt(p.price)} THB
              </div>
            ))}
          </div>

          {/* Survey date */}
          {d.survey_date && (
            <div className="bg-yellow-100 py-2 px-4 font-bold text-sm mb-4">
              SURVEY DATE: {new Date(d.survey_date + "T00:00:00+07:00").toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" })} {slotMap[d.survey_time_slot || ""] || ""}
            </div>
          )}

          {/* Total */}
          <div className="flex justify-end mb-4">
            <div className="border border-gray-300 px-6 py-2.5 flex items-center gap-8">
              <span className="font-bold text-sm uppercase">TOTAL</span>
              <span className="font-bold text-xl">{fmt(d.total_price)}</span>
            </div>
          </div>

          {/* Remarks */}
          <div className="bg-gray-50 border border-gray-100 rounded px-3 py-2 mb-4">
            <div className="text-[9px] text-gray-400 leading-snug">
              <b>REMARKS:</b> 1. ราคาดังกล่าวเป็นราคามาตรฐานสำหรับระบบ Solar Rooftop ติดตั้งในบ้านพักอาศัย (มีเฟสไฟฟ้า 1 เฟส) ทั้งนี้ ในกรณีที่มีการก่อสร้างหรือโครงสร้างพิเศษเพิ่มเติม ทางบริษัทขอสงวนสิทธิ์ในการพิจารณาเสนอราคาใหม่ตามความเหมาะสม 2. กรณีไม่สามารถดำเนินการติดตั้งได้ บริษัทฯ จะทำการคืนเงินจองให้แก่ลูกค้าเต็มจำนวน กรณีสามารถดำเนินการติดตั้งได้ เงินจำนวน 1,000 บาท จะนำไปหักเป็นส่วนลดค่าระบบ Solar ทั้งนี้ หากลูกค้าเป็นฝ่ายยกเลิก บริษัทฯ ขอสงวนสิทธิ์ไม่คืนเงินในทุกกรณี
            </div>
          </div>

          {/* QR + Bank info */}
          <div className="flex gap-5 items-start mb-4">
            <div className="shrink-0">
              <img src={qr} alt="QR" className="w-14 h-14" />
              <div className="text-[7px] text-gray-400 mt-0.5">Scan to pay via PromptPay</div>
            </div>
            <div className="text-[10px] text-gray-500 space-y-0.5 pt-0.5">
              <div>TRANSFER TO: {CO.bankName}</div>
              <div>ACCOUNT NO: {CO.bankAcc}</div>
              <div>BANK: {CO.bank}</div>
              <div>PROMPTPAY: {CO.ppId.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")}</div>
            </div>
          </div>


          {/* Signature */}
          <div className="flex justify-around mb-3 text-[10px] text-gray-500">
            <div className="text-center">
              <div className="w-44 border-b border-gray-300 mb-1" />
              <div>SIGNATURE</div>
              <div>(..............................................)</div>
            </div>
            <div className="text-center">
              <div className="w-44 border-b border-gray-300 mb-1" />
              <div>RECEIVED BY</div>
              <div>(..............................................)</div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-[9px] text-gray-400 border-t border-gray-100 pt-2">
            {CO.address} | Tel: {CO.phone}
          </div>
        </div>
      </div>
    </div>
  );
}
