// กติกากลางของ Customer Journey — ที่เดียวในระบบ (design: docs/plan/20260813-01-journey-step-codes.md)
//
// ไฟล์นี้จงใจเป็น plain JS ไม่มี dependency เพื่อให้ใช้ร่วมกันได้ทั้ง
//   - แอป Next.js (ผ่าน src/lib/journey.ts — tsconfig allowJs)
//   - สคริปต์ node ตรงๆ (scripts/tools/backfill_journey.mjs = backfill/validate/nightly)
//
// โครงเลข: step เว้นทีละ 100 · sub ฝังเลข step ในตัว เว้นทีละ 10 · sub 0 = ไม่มี sub
// แทรกขั้นใหม่ = ใช้เลขกลางช่อง (เช่น step 350, sub 515) — ลำดับอยู่ในตัวเลขเอง

export const JOURNEY_STEPS = [
  { step: 100,  sub: 0,   labelTh: "ติดตาม" },
  { step: 100,  sub: 110, labelTh: "ยังไม่ติดต่อ" },
  { step: 100,  sub: 120, labelTh: "ติดต่อไม่ได้" },
  { step: 100,  sub: 130, labelTh: "ติดต่อได้ ยังไม่สะดวกคุย" },
  { step: 100,  sub: 140, labelTh: "ระหว่างเสนอขาย" },
  { step: 200,  sub: 0,   labelTh: "จองสำรวจ" },
  { step: 200,  sub: 210, labelTh: "จอง รอยืนยันเงิน" },
  { step: 200,  sub: 220, labelTh: "จองแล้ว" },
  { step: 300,  sub: 0,   labelTh: "สำรวจ" },
  { step: 300,  sub: 310, labelTh: "นัดสำรวจ" },
  { step: 300,  sub: 320, labelTh: "กำลังสำรวจ" },
  { step: 400,  sub: 0,   labelTh: "รอใบเสนอราคา" },
  { step: 500,  sub: 0,   labelTh: "ชำระเงิน" },
  { step: 500,  sub: 510, labelTh: "รอเสนอลูกค้า/รอชำระ" },
  { step: 500,  sub: 520, labelTh: "รอยืนยันเงินงวด" },
  { step: 600,  sub: 0,   labelTh: "มัดจำแล้ว รอนัดติดตั้ง" },
  { step: 700,  sub: 0,   labelTh: "ติดตั้ง" },
  { step: 700,  sub: 710, labelTh: "รอติดตั้ง" },
  { step: 700,  sub: 720, labelTh: "กำลังติดตั้ง" },
  { step: 700,  sub: 730, labelTh: "ติดตั้งเสร็จ" },
  { step: 800,  sub: 0,   labelTh: "รอออกใบรับประกัน" },
  { step: 900,  sub: 0,   labelTh: "ขอขนานไฟ" },
  { step: 1000, sub: 0,   labelTh: "ส่งมอบแล้ว" },
  { step: 9800, sub: 0,   labelTh: "ส่งกลับ Seeker" },
  { step: 9900, sub: 0,   labelTh: "ยกเลิก" },
];

// วันที่แบบ "YYYY-MM-DD" ตามนาฬิกา local ของ server — เกณฑ์เดียวกับ GETDATE()
// ฝั่ง SQL. เทียบเป็น string กันปัญหา timezone ของ Date ที่ driver คืนมา
// (mssql คืน DATE เป็น JS Date เที่ยงคืน UTC — getter แบบ local ในโซน +07
// ยังให้วันปฏิทินที่ถูกต้อง)
function datePart(v) {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * คำนวณตำแหน่ง journey จากข้อมูล lead — precedence จากบนลงล่าง ตัวแรกที่เข้าชนะ
 * ทุก lead ได้ค่าเดียวเสมอ (ไม่ซ้อน ไม่หลุด)
 *
 * input: {
 *   status, survey_date, install_date, install_completed_at, install_done_at,
 *   order_paid_count,   — งวด order ที่บัญชียืนยันแล้ว (confirmed_at)
 *   order_ready_count,  — งวดที่ยืนยันแล้วหรือรับเช็คแล้ว (confirmed_at | cheque_received_at)
 *   has_contact_yes, has_contact_no,  — ผลการติดต่อจาก lead_activities
 *   has_sales_pitch,    — มี activity เสนอขาย หรือเคย submit สลิปจอง
 * }
 * คืน { step, sub } หรือ null เมื่อ status ไม่รู้จัก
 */
export function computeJourney(lead) {
  const status = lead.status || "";
  const todayStr = datePart(new Date());
  const surveyDay = datePart(lead.survey_date);
  const installDay = datePart(lead.install_date);
  const installDone = !!(lead.install_completed_at || lead.install_done_at);
  const paidCount = Number(lead.order_paid_count ?? 0);
  const readyCount = Number(lead.order_ready_count ?? paidCount);

  if (status === "lost") return { step: 9900, sub: 0 };
  if (status === "returned") return { step: 9800, sub: 0 };
  if (status === "closed") return { step: 1000, sub: 0 };
  if (status === "gridtie") return { step: 900, sub: 0 };
  if (status === "warranty") return { step: 800, sub: 0 };

  // ติดตั้ง — ยึดวันที่/ธงเสร็จก่อน status เพื่อ parity กับ computeStageCode เดิม
  if (installDone) return { step: 700, sub: 730 };
  if (installDay) return { step: 700, sub: installDay > todayStr ? 710 : 720 };

  if (status === "order" || status === "install") {
    if (paidCount >= 1) return { step: 600, sub: 0 };
    if (readyCount >= 1) return { step: 500, sub: 520 };
    if (status === "order") return { step: 500, sub: 510 };
    // status=install แต่ไม่มีนัด/ไม่มีเงิน (สถานะกำพร้า — code เดิมคืน "" ทำให้หลุดทุก bucket)
    return { step: 600, sub: 0 };
  }

  if (status === "quote") return { step: 400, sub: 0 };
  if (status === "survey") {
    return { step: 300, sub: surveyDay && surveyDay > todayStr ? 310 : 320 };
  }
  if (status === "pre_survey-02") return { step: 200, sub: 220 };
  if (status === "pre_survey-01") return { step: 200, sub: 210 };
  if (status === "pre_survey") {
    if (lead.has_sales_pitch) return { step: 100, sub: 140 };
    if (lead.has_contact_yes) return { step: 100, sub: 130 };
    if (lead.has_contact_no) return { step: 100, sub: 120 };
    return { step: 100, sub: 110 };
  }

  return null; // status ไม่รู้จัก — ปล่อย NULL ให้ validate โวย
}

// แมปกลับเป็น stage code เดิม ("01-0".."99-0") ให้ BI ที่ผูกกับ format เก่าใช้ต่อได้
// หมายเหตุ: 520 แมปเป็น "05-1" ตามพฤติกรรมจริงของ BI เดิม (ส่งเฉพาะ paid_count)
const LEGACY_MAP = {
  "100/110": "01-0", "100/120": "01-0", "100/130": "01-0", "100/140": "01-0",
  "200/210": "02-1", "200/220": "02-2",
  "300/310": "03-1", "300/320": "03-2",
  "400/0": "04-0",
  "500/510": "05-1", "500/520": "05-1",
  "600/0": "06-0",
  "700/710": "07-1", "700/720": "07-2", "700/730": "07-3",
  "800/0": "08-0", "900/0": "09-0", "1000/0": "10-0",
  "9800/0": "98-0", "9900/0": "99-0",
};

export function toLegacyStageCode(journey) {
  if (!journey) return "";
  return LEGACY_MAP[`${journey.step}/${journey.sub}`] ?? "";
}

// คอลัมน์ input ของ computeJourney ในรูป SQL (correlated กับ alias `l` ของ leads)
// ใช้ร่วมกันระหว่าง refreshJourney (per-lead) กับ backfill/validate (ทั้งตาราง)
// เพื่อให้นิยาม count/flag มีที่เดียว — นิยาม paid/ready ตาม api/(lead)/leads/route.ts
// นิยามผลการติดต่อตาม lifecycle contactStateExpr / นิยามเสนอขายตาม lifecycle sales_pitch_at
export const JOURNEY_FLAGS_SQL = `
      (SELECT COUNT(*) FROM payments p WHERE p.lead_id = l.id
         AND p.slip_field LIKE 'order_installment_%' AND p.confirmed_at IS NOT NULL) AS order_paid_count,
      (SELECT COUNT(*) FROM payments p WHERE p.lead_id = l.id
         AND p.slip_field LIKE 'order_installment_%'
         AND (p.confirmed_at IS NOT NULL OR p.cheque_received_at IS NOT NULL)) AS order_ready_count,
      CASE WHEN EXISTS (
        SELECT 1 FROM lead_activities a WHERE a.lead_id = l.id
          AND a.activity_type IN ('call','visit','line','other','follow_up','loan_followup','line_sent')
          AND ISNULL(a.title, N'') NOT LIKE N'ติดต่อไม่ได้%'
          AND (a.title LIKE N'ติดต่อได้%' OR a.activity_type IN ('call','visit','line','line_sent','loan_followup'))
      ) THEN 1 ELSE 0 END AS has_contact_yes,
      CASE WHEN EXISTS (
        SELECT 1 FROM lead_activities a WHERE a.lead_id = l.id
          AND a.activity_type IN ('call','visit','line','other','follow_up','loan_followup','line_sent')
          AND a.title LIKE N'ติดต่อไม่ได้%'
      ) THEN 1 ELSE 0 END AS has_contact_no,
      CASE WHEN EXISTS (
        SELECT 1 FROM lead_activities a WHERE a.lead_id = l.id AND a.title LIKE N'%เสนอขาย%'
      ) OR EXISTS (
        SELECT 1 FROM payments p WHERE p.lead_id = l.id
          AND p.slip_field = 'pre_slip_url' AND p.submitted_at IS NOT NULL
      ) THEN 1 ELSE 0 END AS has_sales_pitch`;
