export const GSB_SOLAR_LOAN_DEFAULTS = {
  loan_enabled: true,
  loan_bank: "ธนาคารออมสิน (GSB)",
  loan_term_months: 84,
  down_payment_percent: 20,
  // Use the conservative no-collateral starting rate for the illustration.
  // Both periods are equal because the published condition is not a tiered rate.
  interest_rate_year_1_2: 3.5,
  interest_rate_year_3_plus: 3.5,
  rate_source: "ธนาคารออมสิน GSB Solar4Life (กรณีไม่ใช้หลักประกัน)",
  rate_effective_date: "2026-07-31",
} as const;
