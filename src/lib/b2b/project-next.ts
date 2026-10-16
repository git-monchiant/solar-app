import { formatThaiDate } from "@/lib/utils/formatters";
import { B2B_STAGE, B2B_SURVEY_SUB, B2B_WON_SUB, stageLabel, type B2bProjectRow } from "./project";

// "งานถัดไป · สถานะ (รอใคร) · ขั้นย่อย" ของแถวรายการโครงการ (แผน 20261016-06) — คิดจาก stage + sub ที่ server คิดไว้แล้ว + จำนวน BOQ
// เป็นฉบับย่อของการ์ด "ต่อไป" ในหน้าโครงการ (หน้านั้นมีข้อมูลเต็ม: ใบทุกใบ / งวด / milestone / ใบอนุญาต) — แก้ข้อความฝั่งหนึ่งให้ดูอีกฝั่งด้วย
// ถ้อยคำภาษาทางการ ชุด "รอ + ผู้รับผิดชอบ" (ผู้ใช้เลือก 16 ต.ค. 69) · ไม่มี mssql ⇒ client import ได้

/** คนที่ต้องดำเนินการถัดไป — "us" = ผู้ดูแลโครงการ (ทีม Solar B2B) */
export type ProjectWaiter = "us" | "review" | "customer" | "accounting" | "purchase";
export const WAITERS: ProjectWaiter[] = ["us", "review", "customer", "accounting", "purchase"];
export const WAITER_LABEL: Record<ProjectWaiter, string> = {
  us: "รอผู้ดูแลโครงการ", review: "รอผู้ตรวจสอบอนุมัติ", customer: "รอลูกค้าตอบรับ", accounting: "รอฝ่ายบัญชียืนยัน", purchase: "รอฝ่ายจัดซื้อ",
};
/** สีตาม "คนที่ต้องดำเนินการ" (ไม่ใช่ตามขั้น) — ป้าย + จุดในชิปกรอง */
export const WAITER_TONE: Record<ProjectWaiter, string> = {
  us: "bg-primary/10 text-primary-dark", review: "bg-active-light text-active-dark", customer: "bg-amber-50 text-amber-700",
  accounting: "bg-blue-50 text-blue-700", purchase: "bg-lime-50 text-lime-700",
};
export const WAITER_DOT: Record<ProjectWaiter, string> = {
  us: "bg-primary", review: "bg-active", customer: "bg-amber-400", accounting: "bg-blue-600", purchase: "bg-lime-500",
};

export type ProjectNext = {
  /** งานถัดไป */
  text: string;
  /** null = ไม่มีงานค้าง (ปิด/แพ้/ยกเลิก) */
  wait: ProjectWaiter | null;
  /** ระบุคนเพิ่มใต้ป้าย (เช่น ผู้ตรวจสอบลำดับที่เท่าไร) */
  who: string | null;
  /** ขั้นย่อยของขั้นนี้ (ว่าง = ไม่มี) */
  subs: string[];
  /** ขั้นย่อยที่เสร็จแล้ว — ตัวถัดไปคือ "ตอนนี้" · เท่ากับ subs.length = ครบ */
  done: number;
  /** ขั้นย่อยที่ถูกส่งกลับแก้ไข */
  back?: number;
};

const n = (text: string, wait: ProjectWaiter | null, subs: string[], done: number, extra: Partial<ProjectNext> = {}): ProjectNext =>
  ({ text, wait, who: null, subs, done, ...extra });

export function projectNext(r: Pick<B2bProjectRow, "stage" | "sub" | "survey_date" | "boq_count" | "close_reason">): ProjectNext {
  const { stage, sub } = r;
  switch (stage) {
    case B2B_STAGE.lead:
      return n("จัดทำราคาประมาณการ หรือนัดสำรวจหน้างาน", "us", ["ข้อมูลลูกค้า", "เริ่มจัดทำราคา"], 1);
    case B2B_STAGE.estimate:
    case B2B_STAGE.confirm: {
      // หลักสิบของ sub = สถานะใบชนิดของขั้นนี้ที่ขยับล่าสุด (QUOTE_SUB_OFFSET) · null = ยังไม่มีใบ
      const est = stage === B2B_STAGE.estimate;
      const doc = est ? "ใบเสนอราคาประมาณการ" : "ใบเสนอราคายืนยัน";
      const off = sub == null ? null : sub - stage;
      const tier = off === 20 ? 1 : off === 30 ? 2 : off === 40 ? 3 : null;
      const passed = tier ? tier - 1 : off === 60 || off === 70 ? 3 : 0;
      const subs = ["BOQ", "จัดทำใบ", `อนุมัติ ${passed}/3`, "ส่งลูกค้า"];
      if (off == null) return r.boq_count > 0 ? n(`จัดทำ${doc}`, "us", subs, 1) : n(est ? "จัดทำ BOQ ราคาประมาณการ" : "จัดทำ BOQ ตามผลสำรวจ", "us", subs, 0);
      if (off === 10) return n(`ส่ง${doc}เพื่อขออนุมัติ`, "us", subs, 1);
      if (tier) return n(`รอผู้ตรวจสอบลำดับที่ ${tier} พิจารณาอนุมัติ`, "review", subs, 2, { who: `ผู้ตรวจสอบลำดับที่ ${tier}` });
      if (off === 50) return n(`แก้ไข${doc}ตามที่ผู้ตรวจสอบส่งกลับ และส่งขออนุมัติใหม่`, "us", subs, 1, { back: 1 });
      if (off === 60) return n(`ส่ง${doc}ให้ลูกค้า`, "us", subs, 3);
      return est ? n("รอลูกค้ายืนยันความสนใจ เพื่อนัดสำรวจหน้างาน", "customer", subs, 4) : n("รอลูกค้าตอบรับใบเสนอราคา", "customer", subs, 4);
    }
    case B2B_STAGE.survey: {
      const subs = ["นัดหมาย", "สำรวจหน้างาน", "บันทึกผล"];
      if (sub === B2B_SURVEY_SUB.scheduled) return n(`สำรวจหน้างาน วันที่ ${formatThaiDate(r.survey_date, { year: false })}`, "us", subs, 1);
      if (sub === B2B_SURVEY_SUB.due) return n("บันทึกผลการสำรวจหน้างาน", "us", subs, 2);
      return n("นัดหมายสำรวจหน้างาน", "us", subs, 0);
    }
    case B2B_STAGE.won: {
      const subs = ["สัญญา / PO", "รับชำระงวดที่ 1"];
      if (sub === B2B_WON_SUB.unsigned) return n("บันทึกสัญญา / ใบสั่งซื้อ (PO)", "us", subs, 0);
      if (sub === B2B_WON_SUB.awaiting_pay) return n("แนบหลักฐานการรับชำระงวดที่ 1", "us", subs, 1);
      if (sub === B2B_WON_SUB.verifying) return n("รอฝ่ายบัญชียืนยันการรับชำระงวดที่ 1", "accounting", subs, 1);
      return n("เข้าสู่ขั้นขออนุญาตและจัดซื้อ", "us", subs, 2);
    }
    case B2B_STAGE.permit: {
      const subs = ["สั่งซื้อวัสดุครบ", "วัสดุเข้าหน้างาน"];
      return sub === 3620 ? n("บันทึกวัสดุเข้าหน้างาน", "us", subs, 1) : n("รอฝ่ายจัดซื้อยืนยันการสั่งซื้อวัสดุครบถ้วน", "purchase", subs, 0);
    }
    case B2B_STAGE.install: {
      const subs = ["ส่งแผงครบ", "เริ่มติดตั้ง", "ติดตั้งแล้วเสร็จ"];
      if (sub === 3740) return n("บันทึกการยื่นขอขนานไฟ", "us", subs, 3);
      if (sub === 3730) return n("บันทึกการติดตั้งแล้วเสร็จ 100%", "us", subs, 2);
      if (sub === 3720) return n("บันทึกการเริ่มติดตั้ง", "us", subs, 1);
      return n("บันทึกการส่งแผงครบ 100%", "us", subs, 0);
    }
    case B2B_STAGE.gridtie: {
      const subs = ["ยื่นขอขนานไฟ", "วันจ่ายไฟ (COD)"];
      return sub === 3820 ? n("บันทึกการส่งมอบงานและการอบรม", "us", subs, 2) : n("บันทึกวันจ่ายไฟ (COD)", "us", subs, 1);
    }
    case B2B_STAGE.handover: {
      const subs = ["ส่งมอบงานและการอบรม", "รับชำระครบ"];
      return sub === 3920 ? n("ติดตามการรับชำระงวดคงเหลือ", "customer", subs, 1) : n("บันทึกการส่งมอบงานและการอบรม", "us", subs, 0);
    }
    default:
      return n(r.close_reason || stageLabel(stage), null, [], 0);
  }
}
