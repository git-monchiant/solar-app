import type { QuoteInstallment } from "./quotation";

// งวดเงินของโครงการ B2B — คัดลอกจากใบเสนอราคาที่ได้งาน (แผน 20261015-07 เฟส 3) · ไม่มีโค้ด server
// ยอดแต่ละงวด = % × มูลค่าสัญญา ปัดสตางค์ · งวดสุดท้ายรับเศษ ⇒ ผลรวมงวด = ยอดในใบพอดี (ก่อน VAT และ VAT)

const round2 = (n: number) => Math.round(n * 100) / 100;

/** เหตุการณ์ที่ทำให้งวดถึงกำหนด — งวดมาตรฐาน 4 งวดตามแม่แบบ SSE ผูกครบ · แบบอื่นผูกงวดแรก (ลงนาม) กับงวดสุดท้าย (ส่งมอบ) */
const STANDARD_TRIGGERS = ["contract", "panels_delivered", "install_done", "handover"];

export type NewInstallment = { no: number; pct: number; condition: string; trigger_key: string | null; amount: number; vat: number; total: number };

export function buildInstallments(list: QuoteInstallment[], subtotal: number, vatPct: number): NewInstallment[] {
  const totalVat = round2((subtotal * vatPct) / 100);
  let restAmount = round2(subtotal);
  let restVat = totalVat;
  return list.map((x, i) => {
    const last = i === list.length - 1;
    const amount = last ? restAmount : round2((subtotal * x.pct) / 100);
    const vat = last ? restVat : round2((amount * vatPct) / 100);
    restAmount = round2(restAmount - amount);
    restVat = round2(restVat - vat);
    const trigger = list.length === STANDARD_TRIGGERS.length ? STANDARD_TRIGGERS[i] : i === 0 ? "contract" : last ? "handover" : null;
    return { no: i + 1, pct: x.pct, condition: x.condition, trigger_key: trigger, amount, vat, total: round2(amount + vat) };
  });
}
