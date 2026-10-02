// ชุดเงื่อนไข/ข้อกำหนดของใบเสนอราคา O&M ในรูปต้นไม้แบบฝั่งขาย (แผน docs/plan/20261002-07)
// ★ ใช้ได้ทั้งหน้าจอ (popup ทำใบ ส่งเป็น master ให้ QuotationTermsEditor) และ server (PDF ใบจริง/ตัวอย่าง)
//   ไฟล์นี้ห้าม import ของฝั่ง server (mssql) — หน้าจอ import ตรง
// ★ key ขึ้นต้น "om-" เสมอ — ตัวจัดหน้าของงานขาย (orderSectionsForDocument) ดูหน้าจาก key ของชุดงานขาย
//   ถ้าชนกัน หัวข้อจะไปหน้า 2 ผิดที่ · ไม่ชน = ทุกหัวข้ออยู่หน้า 1 ใต้ตารางราคา แบบใบ O&M เดิม

import {
  parseQuotationOmSettings,
  parseQuotationTermTree,
  renderQuotationTermTree,
  type QuotationLegalContent,
  type QuotationTermTree,
} from "@/lib/quotation-terms";

/** profile ของต้นไม้ O&M — ใช้แค่ให้ตรง type (ไม่มีหัวข้อไหนของ O&M ผูกกับชุดงานขาย) */
export const OM_TERMS_PROFILE = "additional_install" as const;

/** ค่า O&M ของงานขาย (บริการในแพ็กเกจติดตั้ง) — ใบ O&M ไม่ใช้ แต่ตัวแก้/ตัวเรนเดอร์ต้องมี · ค่าคงที่ identity เดียว */
export const OM_TERMS_NO_SALES_OM = parseQuotationOmSettings(null);

/** ชุด Master ของใบ O&M — ขอบเขตงาน (Package O&M) · หมายเหตุ (หมายเหตุ Package O&M) · อายุใบ */
export function omTermTree(scope: string[], notes: string[]): QuotationTermTree {
  const line = (key: string, body: string) => ({ key, body, page: 1 as const, origin: "standard" as const });
  return {
    profile: OM_TERMS_PROFILE,
    sections: [
      ...(scope.length ? [{ key: "om-scope", title: "ขอบเขตงาน", page: 1 as const, kind: "normal" as const,
        lines: scope.map((s, i) => line(`om-scope-${i + 1}`, s)) }] : []),
      ...(notes.length ? [{ key: "om-notes", title: "หมายเหตุ", page: 1 as const, kind: "normal" as const,
        lines: notes.map((n, i) => line(`om-note-${i + 1}`, n)) }] : []),
      { key: "om-validity", title: "อายุใบเสนอราคา", page: 1, kind: "normal",
        lines: [line("om-validity-1", "ใบเสนอราคานี้มีผล {{valid_days}} วัน นับจากวันที่ออกใบเสนอราคา")] },
    ],
  };
}

/** ชุด Master จาก terms_text ที่แช่ในใบ ("ขอบเขตงาน: …" + "1. หมายเหตุ…" ทีละบรรทัด · ดู omTermsText) */
export function omTermTreeFromText(termsText: unknown): QuotationTermTree {
  const rows = String(termsText ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return omTermTree(
    rows.filter((x) => x.startsWith("ขอบเขตงาน:")).map((x) => x.replace(/^ขอบเขตงาน:\s*/, "")).filter(Boolean),
    rows.filter((x) => !x.startsWith("ขอบเขตงาน:")).map((x) => x.replace(/^\d+[.)]\s*/, "")).filter(Boolean),
  );
}

/** ชุดที่ผู้ใช้แก้ไว้ในใบ (document_inputs_json.terms หรือค่าที่ส่งมาจากฟอร์ม) — ไม่มี/พัง = null */
export function parseOmTerms(value: unknown): QuotationTermTree | null {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  // document_inputs_json = { terms: {...} } · ฟอร์มส่งต้นไม้มาตรง ๆ
  const tree = raw && typeof raw === "object" && "terms" in raw ? (raw as { terms: unknown }).terms : raw;
  return tree ? parseQuotationTermTree(tree, OM_TERMS_PROFILE) : null;
}

/** ข้อความท้ายใบของ PDF — ตัวเรนเดอร์ตัวเดียวกับฝั่งขาย (เลขข้อ "1.1)") */
export function omLegal(termsText: unknown, validDays: unknown, stored: unknown): QuotationLegalContent {
  const tree = parseOmTerms(stored) ?? omTermTreeFromText(termsText);
  return renderQuotationTermTree(tree, { validDays: Number(validDays) || 7, om: OM_TERMS_NO_SALES_OM });
}
