// ช่วงดอกเบี้ยของสินเชื่อ: ใช้ `rate` ตั้งแต่ปีที่ `from_year` จนถึงช่วงถัดไป
// `note` = ชื่ออัตราที่พิมพ์คู่ (เช่น "MRR" ซึ่งเป็นอัตราลอยตัว)
export type LoanInterestTier = { from_year: number; rate: number; note?: string };

export const GSB_SOLAR_LOAN_DEFAULTS = {
  loan_enabled: true,
  loan_bank: "ธนาคารออมสิน (GSB)",
  loan_term_months: 84,
  down_payment_percent: 20,
  // ประกาศ GSB Solar for Life · ลูกค้าทั่วไป · ไม่มีหลักประกัน (Clean Loan) ดาวน์ 20% · กู้สูงสุด 7 ปี
  // https://www.gsb.or.th/promotions/gsbsolar4life/ (เปิดดู 14 ต.ค. 2569 — แผน 20261014-02)
  // MRR ลอยตัว: 6.045% มีผล 2 มี.ค. 2569 · ประกาศเปลี่ยน → แก้ตรงนี้ (มีผลกับใบใหม่/ใบร่างเท่านั้น)
  interest_schedule: [
    { from_year: 1, rate: 3.5 },
    { from_year: 3, rate: 5 },
    { from_year: 6, rate: 6.045, note: "MRR" },
  ] as LoanInterestTier[],
  rate_source: "ธนาคารออมสิน GSB Solar for Life (ไม่มีหลักประกัน ดาวน์ 20%)",
  rate_effective_date: "2026-03-02",
};

// อ่านตารางดอกเบี้ยจากข้อมูลที่เก็บในใบ — ผิดรูปแบบ/ไม่มี = null (ผู้เรียกใช้ค่าตั้งต้น)
// ช่วงแรกต้องเริ่มปีที่ 1 · เรียงตามปี · อัตราติดลบไม่ได้
export function readInterestSchedule(raw: unknown): LoanInterestTier[] | null {
  if (!Array.isArray(raw)) return null;
  const tiers = raw
    .map((tier) => ({
      from_year: Math.round(Number((tier as LoanInterestTier)?.from_year)),
      rate: Number((tier as LoanInterestTier)?.rate),
      note: String((tier as LoanInterestTier)?.note ?? "").trim() || undefined,
    }))
    .filter((tier) => tier.from_year >= 1 && Number.isFinite(tier.rate) && tier.rate >= 0)
    .sort((a, b) => a.from_year - b.from_year);
  return tiers.length && tiers[0].from_year === 1 ? tiers : null;
}

// อัตราดอกเบี้ย (% ต่อปี) ของปีที่ `year` (เริ่ม 1)
export function rateForYear(schedule: LoanInterestTier[], year: number): number {
  let rate = schedule[0]?.rate ?? 0;
  for (const tier of schedule) if (tier.from_year <= year) rate = tier.rate;
  return rate;
}
