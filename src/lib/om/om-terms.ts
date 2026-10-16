// ชุดเงื่อนไข/ข้อกำหนดของใบเสนอราคา O&M ในรูปต้นไม้แบบฝั่งขาย (แผน docs/plan/20261002-07)
// ★ ใช้ได้ทั้งหน้าจอ (popup ทำใบ ส่งเป็น master ให้ QuotationTermsEditor) และ server (PDF ใบจริง/ตัวอย่าง)
//   ไฟล์นี้ห้าม import ของฝั่ง server (mssql) — หน้าจอ import ตรง
// ★ key ขึ้นต้น "om-" เสมอ — ตัวจัดหน้าของงานขาย (orderSectionsForDocument) ดูหน้าจาก key ของชุดงานขาย
//   ถ้าชนกัน หัวข้อจะไปหน้า 2 ผิดที่ · ไม่ชน = ทุกหัวข้ออยู่หน้า 1 ใต้ตารางราคา แบบใบ O&M เดิม
// ★ แผน 20261014-04 (ใบตัวอย่างของบริษัท): ท้ายใบเหลือหัวข้อ "หมายเหตุ" หัวเดียว
//   ขอบเขตงานย้ายไปเป็นรายละเอียดใต้แพ็กเกจในตาราง (ซ้ำกันเปล่า ๆ) · อายุใบมีกล่อง "ยืนราคา N วัน" ที่หัวใบแล้ว

import {
  parseQuotationOmSettings,
  parseQuotationTermTree,
  renderQuotationTermTree,
  type QuotationLegalContent,
  type QuotationLegalSection,
  type QuotationTermTree,
} from "@/lib/quotation-terms";

/** profile ของต้นไม้ O&M — ใช้แค่ให้ตรง type (ไม่มีหัวข้อไหนของ O&M ผูกกับชุดงานขาย) */
export const OM_TERMS_PROFILE = "additional_install" as const;

/** ค่า O&M ของงานขาย (บริการในแพ็กเกจติดตั้ง) — ใบ O&M ไม่ใช้ แต่ตัวแก้/ตัวเรนเดอร์ต้องมี · ค่าคงที่ identity เดียว */
export const OM_TERMS_NO_SALES_OM = parseQuotationOmSettings(null);

/** ชุด Master ของใบ O&M — หัวข้อ "หมายเหตุ" จากหมายเหตุ Package O&M (om_package_notes) */
export function omTermTree(notes: string[]): QuotationTermTree {
  return {
    profile: OM_TERMS_PROFILE,
    sections: notes.length
      ? [{ key: "om-notes", title: "หมายเหตุ", page: 1, kind: "normal",
          lines: notes.map((n, i) => ({ key: `om-note-${i + 1}`, body: n, page: 1, origin: "standard" })) }]
      : [],
  };
}

/** ชุด Master จาก terms_text ที่แช่ในใบ ("1. หมายเหตุ…" ทีละบรรทัด · ดู omTermsText)
 *  ใบร่างก่อนแผน 20261014-04 มีบรรทัด "ขอบเขตงาน: …" ด้วย — ข้ามไป (อยู่ในตารางรายการแล้ว) */
export function omTermTreeFromText(termsText: unknown): QuotationTermTree {
  const rows = String(termsText ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return omTermTree(rows.filter((x) => !x.startsWith("ขอบเขตงาน:")).map((x) => x.replace(/^\d+[.)]\s*/, "")).filter(Boolean));
}

/** อ่าน document_inputs_json ของใบ O&M (หรือค่าที่ส่งมาจากฟอร์ม) — สตริง JSON / object / ว่าง */
const readDocInputs = (value: unknown): Record<string, unknown> | null => {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  return raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
};

/** ชุดที่ผู้ใช้แก้ไว้ในใบ (document_inputs_json.terms หรือต้นไม้ที่ฟอร์มส่งมาตรง ๆ) — ไม่มี/พัง = null */
export function parseOmTerms(value: unknown): QuotationTermTree | null {
  const raw = readDocInputs(value);
  if (!raw) return null;
  // ต้นไม้ตรง ๆ มี sections · document_inputs_json = { terms?, title? } — มีแต่ title = ไม่ได้แก้เงื่อนไข
  const tree = "sections" in raw ? raw : raw.terms;
  return tree ? parseQuotationTermTree(tree, OM_TERMS_PROFILE) : null;
}

/**
 * หัวรายการแพ็กเกจตั้งต้นจากข้อมูลบ้าน — แบบใบตัวอย่างของบริษัท (แผน 20261014-04)
 * "งานบริการ O&M ระบบโซลาร์เซลล์ อินเวอร์เตอร์ SMA ขนาด 25 kW" · ขาดส่วนไหนตัดส่วนนั้น
 * ทะเบียนบ้าน O&M ไม่มีข้อมูลแผง (ยี่ห้อ/วัตต์/จำนวน) — Sale พิมพ์ต่อเองในหน้าต่างทำใบ
 * ★ ใช้ทั้งหน้าจอ (เติมช่องหัวรายการ) และ server (ใบที่ไม่ได้ส่งหัวรายการมา เช่นหน้าที่เปิดค้างไว้ก่อนอัปเดต) — กติกาเดียวกัน
 * kwpList = "5.00" หรือ "3.00 + 2.00" (บ้านที่ติดตั้งหลายชุด) · inverterList = "SMA" / "ABB + HUAWEI" (omHouseSystemSql)
 */
export function omServiceTitle(kwpList: unknown, inverterList: unknown): string {
  const kw = String(kwpList ?? "").split("+").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x))
    .reduce((a, b) => a + b, 0);
  const brand = String(inverterList ?? "").trim();
  return ["งานบริการ O&M ระบบโซลาร์เซลล์", brand ? `อินเวอร์เตอร์ ${brand}` : null,
    kw > 0 ? `ขนาด ${Number(kw.toFixed(2))} kW` : null].filter(Boolean).join(" ");
}

/** หัวรายการแพ็กเกจที่ Sale แก้ในใบ (document_inputs_json.title · แผน 20261014-04) — ไม่มี = null ใช้หัวรายการตั้งต้น */
export function parseOmTitle(value: unknown): string | null {
  const title = readDocInputs(value)?.title;
  return typeof title === "string" && title.trim() ? title.trim().slice(0, 300) : null;
}

/**
 * หัวข้อเดียว (ชุดมาตรฐาน = หมายเหตุ) พิมพ์แบบใบตัวอย่างของบริษัท: "หมายเหตุ" + "1) 2)"
 * แทน "1. หมายเหตุ" + "1.1) 1.2)" ของฝั่งขาย (แผน 20261014-04)
 * ★ มีหลายหัวข้อ (Sale เพิ่มเองในแท็บเงื่อนไข) คงเลขแบบฝั่งขาย — ไม่งั้นอ่านไม่ออกว่าข้อไหนของหัวข้อไหน
 */
function singleSectionStyle(legal: QuotationLegalContent): QuotationLegalContent {
  if (legal.page1Sections.length + legal.page2Sections.length !== 1 || legal.page2LeadingParagraphs.length) return legal;
  const plain = (s: QuotationLegalSection): QuotationLegalSection => ({
    title: s.title.replace(/^1\.\s*/, ""),
    paragraphs: s.paragraphs.map((p) => p.replace(/^1\.(\d+)\)/, "$1)")),
  });
  return { ...legal, page1Sections: legal.page1Sections.map(plain), page2Sections: legal.page2Sections.map(plain) };
}

/** ข้อความท้ายใบของ PDF — ตัวเรนเดอร์ตัวเดียวกับฝั่งขาย แล้วปรับเลขข้อของหัวข้อเดียว */
export function omLegal(termsText: unknown, validDays: unknown, stored: unknown): QuotationLegalContent {
  const tree = parseOmTerms(stored) ?? omTermTreeFromText(termsText);
  return singleSectionStyle(renderQuotationTermTree(tree, { validDays: Number(validDays) || 7, om: OM_TERMS_NO_SALES_OM }));
}
