import { readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import { getUserIdFromReq } from "@/lib/auth";
import { getQuotationActor, getQuotationDetail } from "@/lib/quotation";
import { getDb, sql } from "@/lib/db";
import {
  buildQuotationDocumentSnapshot,
  calculateFinancialSnapshot,
  expandOtherPackageAddOns,
  parseDocumentInputs,
  QUOTATION_DOCUMENT_VERSION,
  type QuotationDocumentSnapshot,
} from "@/lib/quotation-document";
import { buildSurveyReportHtml } from "@/lib/docs/survey-report";
import { buildContentDisposition } from "@/lib/doc-filename";
import {
  getQuotationLegalContent,
  parseQuotationPaymentTerms,
  type QuotationLegalSection,
} from "@/lib/quotation-terms";

export const runtime = "nodejs";
const APPROVED_BUNDLE_DOCUMENT_TYPE = "approved_bundle_v2";
const previewCache = new Map<
  string,
  { detail: Record<string, unknown>; snapshot: QuotationDocumentSnapshot }
>();

const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
const money = (value: unknown) =>
  Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const thaiDate = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat("th-TH", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(String(value)))
    : "-";
const logoDataUrl = `data:image/png;base64,${readFileSync(join(process.cwd(), "public", "logos", "logo-sena.png")).toString("base64")}`;
const paymentQrDataUrl = `data:image/png;base64,${readFileSync(join(process.cwd(), "public", "templates", "quotation-payment-qr.png")).toString("base64")}`;
// Embed DB Heavent (the survey-report template font) so the quotation pages
// render in the SAME typeface as the report pages they're bundled with. The
// CSS used to name "Cordia New", which isn't installed on the Linux prod
// container, so pages 16-17 fell back to Noto Sans Thai and looked nothing like
// the DB Heavent report on pages 1-15.
const HEAVENT_WOFF = {
  300: "db_heavent_li_v3.2-webfont.woff",
  400: "db_heavent_v3.2-webfont.woff",
  500: "db_heavent_med_v3.2-webfont.woff",
  700: "db_heavent_bd_v3.2-webfont.woff",
};
const heaventFontFace = Object.entries(HEAVENT_WOFF)
  .map(([w, f]) => `@font-face{font-family:'DB Heavent';src:url(data:font/woff;base64,${readFileSync(join(process.cwd(), "public", "fonts", f)).toString("base64")}) format('woff');font-weight:${w};font-style:normal}`)
  .join("");
const quotationContact = {
  name: "ณัฏฐามณฑ์ อรรควิทยาพงศ์",
  phone: "092-496-9432",
  email: "natthamona@senasolarenergy.com",
  lineOa: "@senasolarenergy",
};

function signatureDataUrl(data: unknown, mime: unknown) {
  if (!data) return "";
  return `data:${String(mime || "image/png")};base64,${Buffer.from(data as Uint8Array).toString("base64")}`;
}

function readThaiInteger(value: number): string {
  if (value === 0) return "ศูนย์";
  const digits = [
    "ศูนย์",
    "หนึ่ง",
    "สอง",
    "สาม",
    "สี่",
    "ห้า",
    "หก",
    "เจ็ด",
    "แปด",
    "เก้า",
  ];
  const positions = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
  const underMillion = (number: number) => {
    const raw = String(Math.floor(number)).padStart(6, "0");
    let result = "";
    for (let index = 0; index < raw.length; index++) {
      const digit = Number(raw[index]);
      if (!digit) continue;
      const position = raw.length - index - 1;
      if (position === 1 && digit === 1) result += "สิบ";
      else if (position === 1 && digit === 2) result += "ยี่สิบ";
      else if (position === 0 && digit === 1 && Number(raw.slice(0, -1)) > 0)
        result += "เอ็ด";
      else result += digits[digit] + positions[position];
    }
    return result;
  };
  if (value < 1_000_000) return underMillion(value);
  return `${readThaiInteger(Math.floor(value / 1_000_000))}ล้าน${value % 1_000_000 ? underMillion(value % 1_000_000) : ""}`;
}

function thaiBahtText(value: unknown) {
  const amount = Math.max(0, Math.round(Number(value || 0) * 100));
  const baht = Math.floor(amount / 100);
  const satang = amount % 100;
  return `${readThaiInteger(baht)}บาท${satang ? `${readThaiInteger(satang)}สตางค์` : "ถ้วน"}`;
}

export async function POST(req: NextRequest) {
  const userId = getUserIdFromReq(req);
  if (!userId || !(await getQuotationActor(userId)))
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = await req.json();
  const now = new Date().toISOString();
  let packageRow = body.package || {};
  let previewAllItems: Array<Record<string, unknown>> = Array.isArray(body.allItems) ? body.allItems : [];
  // Mirror the create/edit promote: with no main package selected, the first
  // package-type add-on becomes the main package so its equipment detail lines
  // render in the preview exactly as they will once saved.
  if (!packageRow.id) {
    const promoted = previewAllItems.find((it) => it.source_type !== "package" && Number(it.source_package_id));
    if (promoted) {
      const pdb = await getDb();
      const pid = Number(promoted.source_package_id);
      const prow = (await pdb.request().input("pid", sql.Int, pid).query(`SELECT * FROM packages WHERE id=@pid`)).recordset[0];
      if (prow) {
        const pitems = (await pdb.request().input("pid", sql.Int, pid).query(`SELECT * FROM package_items WHERE package_id=@pid AND is_active=1 ORDER BY sort_order,id`)).recordset;
        packageRow = prow;
        previewAllItems = [
          ...pitems.map((it: Record<string, unknown>) => ({ source_type: "package", item_name: it.item_name, item_name_snapshot: it.item_name, quantity: it.quantity, unit: it.unit, line_total: 0 })),
          ...previewAllItems.filter((it) => it !== promoted),
        ];
      }
    }
  }
  previewAllItems = await expandOtherPackageAddOns(previewAllItems);
  const submittedLead =
    body.lead && typeof body.lead === "object" ? body.lead : {};
  const leadId = Number(submittedLead.id || 0);
  let previewLead = submittedLead;
  let previewLeadData: Record<string, unknown> = {};
  if (Number.isInteger(leadId) && leadId > 0) {
    const db = await getDb();
    const leadResult = await db
      .request()
      .input("leadId", sql.Int, leadId)
      .query(`
        SELECT l.*,
          owner.full_name assigned_name,
          surveyor.full_name survey_completed_by_name
        FROM leads l
        LEFT JOIN users owner ON owner.id=l.assigned_user_id
        LEFT JOIN users surveyor ON surveyor.id=l.survey_completed_by
        WHERE l.id=@leadId;
        SELECT TOP 1 * FROM lead_data WHERE lead_id=@leadId;
      `);
    const sets = leadResult.recordsets as unknown as Array<
      Array<Record<string, unknown>>
    >;
    if (sets[0]?.[0]) previewLead = { ...submittedLead, ...sets[0][0] };
    previewLeadData = sets[1]?.[0] || {};
  }
  const subtotal = Number(body.subtotal ?? packageRow.price ?? 0);
  const total = Number(body.total ?? subtotal);
  const deposit = Number(body.deposit || 0);
  const outstanding = Number(body.outstanding ?? Math.max(0, total - deposit));
  const quotation = {
    id: 0,
    doc_no: body.docNo || "ตัวอย่างก่อนบันทึก",
    issue_date: body.issueDate || now,
    valid_days: 7,
    status: "draft",
    package_id: packageRow.id || null,
    package_name_snapshot: packageRow.name || "",
    package_price_snapshot: Number(packageRow.price || 0),
    subtotal_incl_vat: subtotal,
    discount_label: body.discountLabel || "ส่วนลด",
    discount_amount: Math.max(0, subtotal - total),
    contract_total_incl_vat: total,
    deposit_paid_amount: deposit,
    outstanding_amount: outstanding,
    amount_before_vat: outstanding / 1.07,
    vat_amount: outstanding - outstanding / 1.07,
    payment_terms_json: JSON.stringify(parseQuotationPaymentTerms(body.terms)),
    terms_text: body.termsText || "",
    created_by_name: "-",
  };
  const inputs = parseDocumentInputs(body.documentInputs || {});
  const snapshot: QuotationDocumentSnapshot = {
    version: QUOTATION_DOCUMENT_VERSION,
    generated_at: now,
    quotation,
    lead: previewLead,
    lead_data: previewLeadData,
    package: packageRow,
    items: previewAllItems.map((item: Record<string, unknown>) => ({ ...item, item_name_snapshot: item.item_name_snapshot || item.item_name || "", line_total: Number(item.line_total || (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)) })),
    settings: {},
    financial: calculateFinancialSnapshot(inputs, quotation, packageRow),
  };
  const token = randomUUID();
  previewCache.set(token, { detail: quotation, snapshot });
  setTimeout(() => previewCache.delete(token), 10 * 60_000);
  return NextResponse.json({ token });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId =
    getUserIdFromReq(req) || Number(req.nextUrl.searchParams.get("user_id"));
  if (!userId || !(await getQuotationActor(userId)))
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const cachedPreview = id.startsWith("preview-")
    ? previewCache.get(id.slice(8))
    : undefined;
  const quotationId = Number(id);
  const htmlPreview = req.nextUrl.searchParams.get("format") === "html";
  const quotationOnly =
    req.nextUrl.searchParams.get("quotation_only") === "1" || htmlPreview;
  const detail =
    cachedPreview?.detail || (await getQuotationDetail(quotationId));
  if (!detail)
    return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });

  const db = await getDb();
  if (detail.status === "approved" && !quotationOnly) {
    const artifact = await db
      .request()
      .input("id", sql.Int, quotationId)
      .input("documentType", sql.NVarChar(30), APPROVED_BUNDLE_DOCUMENT_TYPE)
      .query(
        `SELECT TOP 1 pdf_data FROM quotation_document_artifacts WHERE quotation_id=@id AND document_type=@documentType`,
      );
    if (artifact.recordset[0]?.pdf_data) {
      const disposition =
        req.nextUrl.searchParams.get("download") === "1"
          ? "attachment"
          : "inline";
      return new NextResponse(Buffer.from(artifact.recordset[0].pdf_data), {
        headers: {
          "Content-Type": "application/pdf",
          // ชื่อไฟล์มีชื่อลูกค้าต่อท้าย เช่น SSR-QT-26-0003_ธิติมา_พลพินิจ.pdf
          "Content-Disposition": buildContentDisposition({
            base: String(detail.doc_no),
            ext: "pdf",
            customerName: (detail.customer_name as string) || null,
            disposition,
          }),
          "X-Quotation-Document-Pages": "17",
        },
      });
    }
  }

  let snapshot: QuotationDocumentSnapshot | null =
    cachedPreview?.snapshot || null;
  if (
    detail.document_snapshot_json &&
    [
      "pending_solar_sup",
      "pending_sales_sup",
      "pending_approval",
      "approved",
    ].includes(detail.status)
  ) {
    try {
      snapshot = JSON.parse(
        detail.document_snapshot_json,
      ) as QuotationDocumentSnapshot;
    } catch {
      /* regenerate below */
    }
  }
  if (!snapshot) snapshot = await buildQuotationDocumentSnapshot(quotationId);
  if (!snapshot)
    return NextResponse.json(
      { error: "สร้างข้อมูลเอกสารไม่สำเร็จ" },
      { status: 500 },
    );
  // Expand package-backed add-ons at render time as well, so quotations with
  // an older stored snapshot receive the current Package Master detail rows.
  snapshot.items = await expandOtherPackageAddOns(snapshot.items);
  const q = {
    ...detail,
    ...snapshot.quotation,
    customer_name: snapshot.lead.customer_name || snapshot.lead.full_name,
    customer_phone: snapshot.lead.customer_phone || snapshot.lead.phone,
    customer_email: snapshot.lead.customer_email || snapshot.lead.email,
    installation_address: snapshot.lead.installation_address,
    id_card_address: snapshot.lead.id_card_address,
    id_card_number: snapshot.lead.id_card_number,
    project_name:
      snapshot.quotation.project_display_name || snapshot.lead.project_name,
    status: detail.status,
    approved_at: detail.approved_at,
    approver_name_snapshot: detail.approver_name_snapshot,
    approver_title_snapshot: detail.approver_title_snapshot,
    solar_approved_at: detail.solar_approved_at,
  };

  const items = snapshot.items;
  const packageItems = items.filter((item) => item.source_type === "package");
  const detailItems = packageItems.filter((_, index) => index > 0);
  const addOns = items.filter((item) => item.source_type !== "package");
  let terms: Array<{ label?: string; percent?: number; due?: string }> = [];
  try {
    terms = JSON.parse(q.payment_terms_json || "[]");
  } catch {
    /* keep empty */
  }

  const settings = snapshot.settings;
  const bankName =
    settings.bank_account_bank === "TMBThanachart Bank"
      ? "ทหารไทยธนชาต"
      : settings.bank_account_bank || "ทหารไทยธนชาต";
  const bankAccountName =
    settings.bank_account_name === "SENA SOLAR ENERGY CO., LTD."
      ? "บริษัท เสนา โซลาร์ เอนเนอร์ยี่ จำกัด"
      : settings.bank_account_name || "บริษัท เสนา โซลาร์ เอนเนอร์ยี่ จำกัด";
  const bankAccountNumber = settings.bank_account_number || "667-2-03155-3";
  const bankBranch =
    settings.bank_account_branch === "Esplanade Ratchada"
      ? "ดิ เอสพลานาด รัชดาภิเษก"
      : settings.bank_account_branch || "ดิ เอสพลานาด รัชดาภิเษก";
  const creatorSignature = signatureDataUrl(
    q.created_by_signature_data,
    q.created_by_signature_mime,
  );
  const approverSignature = signatureDataUrl(
    q.approver_signature_data_snapshot,
    q.approver_signature_mime_snapshot,
  );
  // Solar Manager (ผู้ตรวจสอบ) signs at the first approval step; show it as soon as
  // they approve (pending_sales_sup onward), not only after final approval.
  const solarSignature = signatureDataUrl(
    q.solar_approved_signature_data,
    q.solar_approved_signature_mime,
  );
  const watermark =
    q.status === "approved"
      ? ""
      : q.status === "pending_solar_sup"
        ? "รอ Solar Manager อนุมัติ"
        : ["pending_sales_sup", "pending_approval"].includes(q.status)
          ? "รอ Sale Manager อนุมัติ"
        : "DRAFT";
  const reportLead = {
    ...snapshot.lead,
    project_alias:
      snapshot.quotation.project_display_name || snapshot.lead.project_alias,
    surveyor:
      snapshot.lead.survey_actual_by ||
      snapshot.lead.survey_completed_by_name ||
      snapshot.lead.assigned_name,
    quotation_doc_no: q.doc_no,
  };
  const reportPackage = {
    ...snapshot.package,
    name: q.package_name_snapshot || snapshot.package.name,
    price: q.package_price_snapshot || snapshot.package.price,
  };
  const surveyHtml = buildSurveyReportHtml(
    reportLead,
    snapshot.lead_data || {},
    reportPackage,
    {
      quotationAttached: true,
      watermark,
      quotation: {
        docNo: String(q.doc_no || ""),
        grossAmount: Number(q.subtotal_incl_vat || 0),
        discountAmount: Number(q.discount_amount || 0),
        discountLabel: String(q.discount_label || "ส่วนลด"),
        contractAmount: Number(
          q.contract_total_incl_vat || q.subtotal_incl_vat || 0,
        ),
        depositAmount: Number(q.deposit_paid_amount || 0),
        netAmount: Number(q.outstanding_amount || 0),
      },
      financial: snapshot.financial,
    },
  );
  const quotationHeader = `
    <div class="header">
      <div class="brand"><img src="${logoDataUrl}" alt="SENA Solar Energy"></div>
      <div class="company"><b>บริษัท เสนา โซลาร์ เอนเนอร์ยี่ จำกัด (สำนักงานใหญ่)</b><br>เลขที่ 448 ถนนรัชดาภิเษก แขวงสามเสนนอก เขตห้วยขวาง<br>กรุงเทพมหานคร 10310 โทร. 0-2541-4642<br>เลขประจำตัวผู้เสียภาษี 0105552041258</div>
      <div class="quotation-title"><div>ใบเสนอราคา</div><table><tr><td>QUOTATION NO.</td><td>${esc(q.doc_no)}</td></tr><tr><td>วันที่</td><td>${thaiDate(q.issue_date)}</td></tr></table></div>
    </div>
    <div class="customer-grid">
      <table class="customer-table"><tr><th>ชื่อโครงการ :</th><td>${esc(q.project_name || "-")}</td></tr><tr><th>ลูกค้า :</th><td>${esc(q.customer_name)}</td></tr><tr><th>ที่อยู่ :</th><td><span class="address-value">${esc(q.installation_address || q.id_card_address || "-")}</span></td></tr><tr><th>เบอร์ติดต่อ :</th><td>${esc(q.customer_phone || "-")}</td></tr><tr><td colspan="2" class="tax-row"><span>เลขประจำตัวผู้เสียภาษี :</span><span>${esc(q.id_card_number || "-")}</span></td></tr><tr><th>Email :</th><td class="email">${esc(q.customer_email || "-")}</td></tr></table>
      <table class="contact-table"><tr><th>ชื่อผู้ติดต่อ :</th><td colspan="2">${esc(quotationContact.name)}</td></tr><tr><th>โทร :</th><td colspan="2">${esc(quotationContact.phone)}</td></tr><tr><th>E-Mail :</th><td colspan="2">${esc(quotationContact.email)}</td></tr><tr><th>Line OA :</th><td colspan="2">${esc(quotationContact.lineOa)}</td></tr><tr><td colspan="3" class="valid-box"><div class="valid-box-grid"><span class="valid-label">ยืนราคา</span><span class="valid-days"><b>${esc(q.valid_days)}</b></span><span class="valid-copy">วัน นับจากวันที่ออกเอกสารใบเสนอราคา</span></div></td></tr></table>
    </div>`;

  const excelPackageItem = packageItems[0];
  const excelPackageName = String(excelPackageItem?.item_name_snapshot || "");
  const usesExcelPackageTitle = excelPackageName.startsWith("งานจ้างเหมา");
  const isOtherPackage = Boolean(snapshot.package.is_other);
  const normalizeOtherPackageText = (value: unknown) =>
    String(value || "")
      .trim()
      .replace(/เพิิ่ม/g, "เพิ่ม")
      .replace(/เมนส์เบรคเกอร์/g, "เมนส์เบรกเกอร์");
  const otherPackageItemText = (item: Record<string, unknown>) => {
    const name = normalizeOtherPackageText(item.item_name_snapshot);
    const quantity = Number(item.quantity);
    const unit = String(item.unit || "").trim();
    if (!unit || !Number.isFinite(quantity) || quantity <= 0) return name;
    const suffix = `${quantity} ${unit}`;
    return name.toLocaleLowerCase().includes(suffix.toLocaleLowerCase())
      ? name
      : `${name} ${suffix}`;
  };
  const excelPackageTitle = `${excelPackageName}${excelPackageItem?.unit ? ` ${excelPackageItem.quantity} ${excelPackageItem.unit}` : ""}`;
  const packageTitle = isOtherPackage
    ? excelPackageItem
      ? otherPackageItemText(excelPackageItem)
      : normalizeOtherPackageText(q.package_name_snapshot || snapshot.package.name)
    : usesExcelPackageTitle
      ? excelPackageTitle
      : `งานจ้างเหมาติดตั้งระบบผลิตไฟฟ้าจากพลังงานแสงอาทิตย์บนหลังคา ${q.package_name_snapshot || ""}`;
  // ข้อความในวงเล็บเหลี่ยม [...] = ตัวหนาสีแดงบนเอกสาร
  // เช่น "งานเพิ่มตู้คอนซูมเมอร์ยูนิต 6 ช่อง [เพิ่มตู้ไฟ]" → (เพิ่มตู้ไฟ) สีแดง
  // พิมพ์ได้ทุกรายการ ไม่ต้อง hardcode ทีละคำ
  const itemHtml = (value: unknown) =>
    esc(value)
      .replace(/\[([^\]]+)\]/g, '<span class="item-note">($1)</span>')
      .replace("(เพิ่มตู้ไฟ)", '<span class="item-note">(เพิ่มตู้ไฟ)</span>');
  const otherPackageTextHtml = itemHtml;
  const packageTitleHtml = itemHtml(packageTitle);
  const isQuotationOnlyPackageDetail = (item: Record<string, unknown>) =>
    Object.prototype.hasOwnProperty.call(item, "package_item_id") &&
    item.package_item_id == null;
  const packageDetail = (item: Record<string, unknown>) => {
    const name = String(item.item_name_snapshot || "");
    if (isOtherPackage) return otherPackageItemText(item);
    if (!item.unit) return name;
    if (isQuotationOnlyPackageDetail(item) && !name.trimStart().startsWith("-")) {
      return `- ${name} ${item.quantity} ${item.unit}`;
    }
    // รายละเอียดใต้หัวข้อขึ้นต้นด้วย "- " — ใส่ให้เฉพาะบรรทัดที่ยังไม่มีเท่านั้น
    // (ผู้ใช้บางคนพิมพ์ขีดมาเอง และอาจใช้ – หรือ • หรือมีเว้นวรรคนำหน้า)
    if (/^\s*[-–—•]/.test(name)) {
      return `${name} ${item.quantity} ${item.unit}`;
    }
    return `- ${name} ${item.quantity} ${item.unit}`;
  };
  // เลขลำดับใส่เฉพาะ "หัวข้อ" (แพ็กเกจหลัก / แพ็กเกจเพิ่ม / งานเพิ่ม) เท่านั้น
  // บรรทัดรายละเอียดใต้หัวข้อไม่ใส่เลข — เดิมตัดสินจากข้อความ (ชื่อที่ไม่ขึ้นต้น
  // ด้วย "-" ถือเป็นรายการมีเลข) พอตัวแก้ไขตัดขีดนำหน้าออก รายละเอียดเลยได้เลขทุกบรรทัด
  const packageSequence = 1;
  const packageDetailRows = detailItems.map(
    (item) =>
      `<tr><td class="center"></td><td>${itemHtml(packageDetail(item))}</td><td></td></tr>`,
  );
  // Package หลักเป็นตัวเลือก — ถ้าไม่มี (ซื้อเฉพาะรายการเพิ่มเติม) ข้ามแถว
  // package แล้วเรียงเลขรายการเพิ่มเติมเริ่มจาก 1
  const hasPackage = q.package_id != null;
  const addOnBaseSeq = hasPackage ? packageSequence : 0;
  const addOnDisplayName = (item: Record<string, unknown>) =>
    String(item.item_name_snapshot || "")
      .replace(/^Package เพิ่มเติม:\s*/i, "")
      .replace(/^Scal(?:e)?\s*Up\s*:\s*/i, "");
  let addOnSequence = addOnBaseSeq;
  const addOnRows = addOns.flatMap((item) => {
    if (
      item.source_type === "addon_package_detail" ||
      item.source_type === "custom_detail"
    ) {
      const detailText = otherPackageItemText(item);
      return [
        `<tr><td></td><td>${otherPackageTextHtml(
          item.source_type === "custom_detail" &&
            !detailText.trimStart().startsWith("-")
            ? `- ${detailText}`
            : detailText,
        )}</td><td></td></tr>`,
      ];
    }
    addOnSequence += 1;
    // งานเพิ่มที่ราคา 0 = แถมให้ → แสดงเฉพาะชื่อรายการ ไม่ต้องมีจำนวน/หน่วย และไม่ต้องมียอด 0.00
    const isFree = !(Number(item.line_total) > 0);
    if (item.source_type === "addon_package") {
      return [
        `<tr class="head-row"><td class="center">${addOnSequence}</td><td>${otherPackageTextHtml(isFree ? normalizeOtherPackageText(item.item_name_snapshot) : otherPackageItemText(item))}</td><td class="right">${isFree ? "" : money(item.line_total)}</td></tr>`,
      ];
    }
    // งานเพิ่มแสดงชื่อรายการอย่างเดียว ไม่ต่อท้ายด้วยจำนวน/หน่วย ("1 งาน")
    return [
      `<tr class="head-row"><td class="center">${addOnSequence}</td><td>${itemHtml(addOnDisplayName(item))}</td><td class="right">${isFree ? "" : money(item.line_total)}</td></tr>`,
    ];
  });
  const itemRows = [
    ...(hasPackage
      ? [
          `<tr class="head-row"><td class="center">1</td><td>${packageTitleHtml}${usesExcelPackageTitle || isOtherPackage ? "" : " 1 ชุด"}</td><td class="right">${money(q.package_price_snapshot)}</td></tr>`,
          ...packageDetailRows,
        ]
      : []),
    ...addOnRows,
  ];
  while (itemRows.length < 9)
    itemRows.push(
      '<tr class="empty-row"><td>&nbsp;</td><td></td><td></td></tr>',
    );

  let allocatedPaymentAmount = 0;
  const paymentRows = terms
    .map((term, index) => {
      const percent = Number(term.percent || 0);
      const percentText = percent.toLocaleString("th-TH", {
        maximumFractionDigits: 2,
      });
      const outstandingAmount = Number(q.outstanding_amount) || 0;
      const calculatedAmount =
        Math.round(((outstandingAmount * percent) / 100) * 100) / 100;
      const paymentAmount =
        index === terms.length - 1
          ? Math.round(
              Math.max(0, outstandingAmount - allocatedPaymentAmount) * 100,
            ) / 100
          : calculatedAmount;
      allocatedPaymentAmount += paymentAmount;
      return `<tr><td>${esc(term.label)}</td><td class="center">${percentText}%</td><td>${esc(term.due)}</td><td class="center">เป็นจำนวนเงิน</td><td class="right">${money(paymentAmount)}</td></tr>`;
    })
    .join("");

  const legalContent = getQuotationLegalContent(
    snapshot.package,
    q.valid_days,
    String(q.terms_text || ""),
    parseDocumentInputs(snapshot.financial?.inputs || {}).om,
  );
  const renderLegalSections = (sections: QuotationLegalSection[]) =>
    sections
      .map(
        (section) =>
          `<b><u>${esc(section.title)}</u></b>${section.paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}`,
      )
      .join("");
  // Keep legal copy clear of the fixed page footer. A moderately long item
  // table moves section 2 to page 2; a very long table moves every legal
  // section so even the warranty block cannot collide with the page number.
  const pushNotesToPage2 = itemRows.length > 9 && legalContent.page1Sections.length > 1;
  const pushAllTermsToPage2 = itemRows.length > 14;
  const page1Sections = pushAllTermsToPage2
    ? []
    : pushNotesToPage2
      ? legalContent.page1Sections.slice(0, 1)
      : legalContent.page1Sections;
  const notesMovedToPage2 = pushAllTermsToPage2
    ? legalContent.page1Sections
    : pushNotesToPage2
      ? legalContent.page1Sections.slice(1)
      : [];
  const standardTermsPage1 = page1Sections.length
    ? `<div class="legal">${renderLegalSections(page1Sections)}</div>`
    : "";
  const standardTermsPage2 = `
    <div class="legal page-two-terms${pushAllTermsToPage2 ? " compact-terms" : ""}">
      ${renderLegalSections(notesMovedToPage2)}
      ${legalContent.page2LeadingParagraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}
      ${renderLegalSections(legalContent.page2Sections)}
    </div>`;

  const sigCell = (
    role: string,
    name = "",
    signature = "",
    date: unknown = "",
  ) =>
    `<div class="sig-cell">${signature ? `<img src="${signature}" alt="ลายเซ็น">` : `<div class="sig-space"></div>`}<div class="sig-line">ลงชื่อ<span class="sig-dots"></span>${role}</div><div>( ${name ? esc(name) : "............................................................."} )</div><div>วันที่ ${date ? thaiDate(date) : "................... / ................... / ..................."}</div></div>`;

  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>${heaventFontFace}
    @page{size:Letter;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#172126;font-family:'DB Heavent',"Cordia New",Tahoma,"Noto Sans Thai",Arial,sans-serif;font-size:11pt;line-height:1.15}.page{position:relative;width:215.9mm;height:279.4mm;padding:13mm 16mm 7mm;overflow:hidden;page-break-after:always}.page:last-child{page-break-after:auto}.header{display:grid;grid-template-columns:46mm 1fr 50mm;gap:5mm;align-items:start;min-height:20mm}.brand img{display:block;width:43mm;height:17mm;object-fit:contain;object-position:left center}.company{padding-top:1mm;font-size:11pt;line-height:1.25;color:#273238}.quotation-title>div{border:1px solid #00a99d;border-radius:4px;padding:2px;text-align:center;font-size:18pt;font-weight:bold}.quotation-title table{width:100%;margin-top:2px;border-collapse:collapse;font-size:11pt}.quotation-title td{height:4.3mm;border:.75px solid #667078;padding:0 3px}.quotation-title td:first-child{width:25mm}.customer-grid{display:grid;grid-template-columns:1fr 1fr;gap:12mm;align-items:start;margin:0.5mm 0 1.5mm}.customer-grid table{width:100%;height:auto;align-self:start;border-collapse:collapse}.customer-grid tr{height:auto}.customer-grid th,.customer-grid td{padding:.5px 2px;text-align:left;vertical-align:top;line-height:1.18}.customer-grid th{width:25mm;white-space:nowrap;color:#253138}.customer-grid .contact-table th{width:15mm}.customer-grid .email{color:#0073c7;text-decoration:underline}.customer-grid .valid th,.customer-grid .valid td{border:.75px solid #667078;background:#f8fbfb}.customer-grid .valid th{width:22%;text-align:center}.customer-grid .valid-days{width:11%;text-align:center;font-weight:bold}.customer-grid .valid-copy{width:67%;white-space:nowrap}.quote-table,.payment-table,.summary{width:100%;border-collapse:collapse}.quote-table th,.quote-table td,.payment-table th,.payment-table td,.summary td{border:.65px solid #778188;padding:.5px 3px}.quote-table th{height:5.2mm;border-top:1.2px solid #169d94;background:#eef6f5;text-align:center;font-size:12pt}.quote-table tbody tr{height:5mm}.quote-table tbody tr:nth-child(even):not(.empty-row){background:#fbfcfc}.quote-table .empty-row{height:4.4mm}.quote-table tr.head-row td{font-weight:bold}.center{text-align:center}.right{text-align:right;white-space:nowrap}.muted{color:#667078;font-size:11pt}.payment-title{border:.65px solid #778188;border-bottom:0;background:#eef6f5;padding:0;text-align:center;font-size:12pt;font-weight:bold;color:#185f5b}.payment-table tr{height:4.6mm}.payment-table td:nth-child(1){width:25mm}.payment-table td:nth-child(2){width:13mm}.payment-table td:nth-child(4){width:31mm}.payment-table td:nth-child(5){width:28mm}.payment-bank-row{display:grid;grid-template-columns:1fr 25mm;border:.65px solid #778188;border-top:0;min-height:19mm;padding:2px 5mm 2px 7mm}.bank-copy{line-height:1.22}.qr{display:flex;align-items:center;justify-content:center}.qr img{width:18mm;height:18mm;object-fit:contain}.summary{width:96mm;margin-left:auto;table-layout:fixed}.summary td{height:4.5mm}.summary td:first-child{text-align:right}.summary td:last-child{width:32.5mm;text-align:right}.summary .strong td{background:#f7f9f9;font-weight:bold}.summary .grand td{background:#cfe9f4;font-size:12pt;font-weight:bold;color:#15343e}.amount-words{float:left;width:84mm;text-align:center;padding:7mm 3mm 0;font-weight:bold;line-height:1.25}.financials{border:.65px solid #778188;border-top:0;min-height:34mm;padding-top:1px}.financials:after{content:"";display:block;clear:both}.legal{clear:both;margin-top:3mm;font-size:11pt;line-height:1.18}.legal b{display:block;margin-top:1.5mm;border-bottom:.7px solid #66beb8;padding-bottom:.3mm;font-size:12pt;color:#176e69}.legal p{margin:.7mm 0 .7mm 12mm;text-indent:-4mm}.page-two-terms{margin-top:6mm;font-size:11pt}.page-two-terms p{margin:1.8mm 0 1.8mm 12mm}.signatures{display:grid;grid-template-columns:1fr 1fr;column-gap:20mm;row-gap:9mm;margin:13mm 8mm 0}.sig-cell{text-align:center;min-height:28mm;line-height:1.35}.sig-cell img{display:block;width:38mm;height:10mm;object-fit:contain;margin:0 auto -1mm}.sig-space{height:9mm}.watermark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(-25deg);font-size:48pt;font-weight:bold;color:rgba(222,51,74,.14);pointer-events:none}.footer{position:absolute;bottom:3mm;left:16mm;right:16mm;text-align:center;color:#7a858b;font-size:10pt}.quote-table .payment-spacer{height:8mm}.quote-table .payment-spacer td{background:#fff}.quote-table .payment-shell{height:auto;background:#fff}.quote-table .payment-cell{height:auto;padding:0;border-right:.65px solid #778188;background:#fff;vertical-align:top}.quote-table .payment-side{height:auto;background:#fff}.quote-table .payment-cell .payment-title{border:0;border-bottom:.65px solid #778188}.quote-table .payment-cell .payment-table td{height:4.6mm;border-width:0 .65px .65px 0;border-color:#778188;padding:.5px 3px;background:#fff}.quote-table .payment-cell .payment-table td:last-child{border-right:0}.quote-table .payment-cell .payment-bank-row{grid-template-columns:minmax(0,76mm) 24mm;justify-content:center;align-items:center;column-gap:10mm;border:0;min-height:25mm;padding:3mm 6mm}.quote-table .payment-cell .bank-copy{max-width:76mm}.quote-table .payment-cell .qr img{width:22mm;height:20mm}
    .customer-grid{column-gap:40mm}
    .customer-grid .customer-table{table-layout:fixed}
    .customer-grid .customer-table th{width:15mm}
    .customer-grid .customer-table th+td{padding-left:1mm}
    .customer-grid .customer-table .address-value{display:block;width:calc(100% + 30mm)}
    .customer-grid .customer-table .tax-row{display:grid;grid-template-columns:25mm 1fr;padding:.5px 0}
    .customer-grid .customer-table .tax-row span{padding:0 2px}
    .customer-grid .customer-table .tax-row span:first-child{white-space:nowrap}
    .customer-grid .customer-table .tax-row span:last-child{padding-left:4px}
    /* Detail and payment sections follow the approved quotation reference with DB Heavent typography. */
    .quote-table,.payment-table,.payment-title,.payment-bank-row{color:#111}.quote-table th,.quote-table td,.payment-table td{border-color:#222!important}.quote-table th{height:5.6mm;border-top:1px solid #222!important;background:#f1f1f1!important;color:#111;font-weight:700}.quote-table tbody tr{height:5.25mm}.quote-table tbody tr:nth-child(even):not(.empty-row){background:#fff}.payment-title,.quote-table .payment-cell .payment-title{background:#fff!important;color:#111;border-color:#222!important;font-weight:500;padding:.6mm 0}.quote-table .payment-cell .payment-table td{border-color:#222!important;background:#fff}.payment-bank-row,.quote-table .payment-cell .payment-bank-row{border-color:#222!important;background:#fff}.quote-table .payment-cell{border-right-color:#222!important}.quote-table .payment-side{border-left-color:#222!important}
    table.financials{display:table;width:100%;min-height:0;padding:0;border:0;border-collapse:collapse;table-layout:fixed}
    table.financials:after{display:none}
    table.financials td{height:4.5mm;border:.65px solid #778188;padding:.5px 3px}
    table.financials .summary-label{width:63.5mm;text-align:right}
    table.financials .summary-value{width:32.5mm;text-align:right;white-space:nowrap}
    table.financials .strong .summary-label,table.financials .strong .summary-value{background:#e4f0f6;font-weight:bold}
    table.financials .grand td{height:5.4mm;background:#cfe9f4}
    table.financials .grand .amount-words{float:none;width:auto;padding:.5px 3px;text-align:center;font-weight:normal;line-height:1.15}
    table.financials .grand .summary-label,table.financials .grand .summary-value{font-size:12pt;font-weight:bold;color:#15343e}
    .legal b{border-bottom:0;padding-bottom:0;color:#172126}
    .compact-terms p{margin:.8mm 0 .8mm 12mm}
    .compact-terms b{margin-top:1mm}
    .compact-legal-page .signatures{margin-top:7mm;row-gap:5mm}
    .legal b u{text-decoration-color:#172126;text-decoration-thickness:.6px;text-underline-offset:.5px}
    /* Signature line: a flex-growing dotted rule keeps the role label on one
       line no matter its length (e.g. "ผู้ขาย / ผู้ตรวจสอบ" used to wrap). */
    .sig-cell img{transform:translateY(4mm)}
    .sig-cell .sig-line{display:flex;align-items:flex-end;justify-content:center;gap:3px;white-space:nowrap}
    .sig-cell .sig-dots{flex:0 1 40mm;min-width:8mm;border-bottom:1px dotted #555;margin-bottom:1.2mm}
    .sig-cell .sig-title{font-size:10pt;color:#4b5563}
    .customer-grid td.valid-box{padding:0;border:0;background:#fff}
    .valid-box-grid{display:grid;grid-template-columns:24% 10% 66%;min-height:5mm;align-items:stretch;overflow:hidden;border:.75px solid #667078;border-radius:4px}
    .customer-grid .valid-box-grid span{display:flex;align-items:center;width:auto;padding:0 3px}
    .valid-box-grid .valid-label,.valid-box-grid .valid-days{justify-content:center}
    .valid-box-grid .valid-copy{white-space:nowrap}
    .item-note{color:#e00000;font-weight:bold}
  </style></head><body>
    <section class="page">${watermark ? `<div class="watermark">${esc(watermark)}</div>` : ""}${quotationHeader}
      <table class="quote-table"><thead><tr><th style="width:12mm">ลำดับ</th><th>รายการ</th><th style="width:32.5mm">จำนวนเงิน</th></tr></thead><tbody>${itemRows.join("")}<tr class="payment-spacer"><td></td><td></td><td></td></tr><tr class="payment-shell"><td colspan="2" class="payment-cell"><div class="payment-title">เงื่อนไขการชำระเงิน</div><table class="payment-table"><tbody>${paymentRows}</tbody></table><div class="payment-bank-row"><div class="bank-copy"><b>ธนาคาร${esc(bankName)}</b><br>ชื่อบัญชี : ${esc(bankAccountName)}<br>เลขที่บัญชี : ${esc(bankAccountNumber)} สาขา ${esc(bankBranch)}</div><div class="qr"><img src="${paymentQrDataUrl}" alt="QR Payment"></div></div></td><td class="payment-side"></td></tr></tbody></table>
      <table class="financials"><tbody><tr class="strong"><td></td><td class="summary-label">ราคาก่อนหักส่วนลด (รวมภาษีมูลค่าเพิ่ม)</td><td class="summary-value">${money(q.subtotal_incl_vat)}</td></tr>${Number(q.discount_amount) > 0 ? `<tr><td></td><td class="summary-label">${esc(q.discount_label || "ส่วนลด")}</td><td class="summary-value">-${money(q.discount_amount)}</td></tr>` : ""}<tr><td></td><td class="summary-label">หัก เงินจอง</td><td class="summary-value">${Number(q.deposit_paid_amount) > 0 ? `-${money(q.deposit_paid_amount)}` : money(0)}</td></tr><tr class="strong"><td></td><td class="summary-label">ราคาหลังหักส่วนลด (รวมภาษีมูลค่าเพิ่ม)</td><td class="summary-value">${money(q.outstanding_amount)}</td></tr><tr><td></td><td class="summary-label">ราคาสินค้าก่อนภาษีมูลค่าเพิ่ม</td><td class="summary-value">${money(q.amount_before_vat)}</td></tr><tr><td></td><td class="summary-label">ภาษีมูลค่าเพิ่ม (VAT) 7%</td><td class="summary-value">${money(q.vat_amount)}</td></tr><tr class="grand"><td class="amount-words">( ${thaiBahtText(q.outstanding_amount)} )</td><td class="summary-label">รวมยอดที่ต้องชำระสุทธิ</td><td class="summary-value">${money(q.outstanding_amount)}</td></tr></tbody></table>
      ${standardTermsPage1}<div class="footer">หน้า 16 / 17 · ใบเสนอราคา 1 / 2 · ${esc(q.doc_no)}</div>
    </section>
    <section class="page${pushAllTermsToPage2 ? " compact-legal-page" : ""}">${watermark ? `<div class="watermark">${esc(watermark)}</div>` : ""}${quotationHeader}${standardTermsPage2}
      <div class="signatures">${sigCell("ลูกค้า")}${sigCell("ผู้จัดทำเอกสาร", q.created_by_name, creatorSignature, q.issue_date)}${sigCell("ผู้ตรวจสอบ", q.solar_approved_name, solarSignature, q.solar_approved_at)}${sigCell("ผู้ขาย / ผู้ตรวจสอบ", q.approver_name_snapshot || q.approved_by_name, approverSignature, q.approved_at)}</div>
      <div class="footer">หน้า 17 / 17 · ใบเสนอราคา 2 / 2 · ${esc(q.doc_no)}</div>
    </section>
  </body></html>`;

  if (htmlPreview) {
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
      env: { ...process.env, TZ: "Asia/Bangkok" },
    });
    const page = await browser.newPage();
    await page.emulateTimezone("Asia/Bangkok");
    let surveyPdf: PDFDocument | null = null;
    if (!quotationOnly) {
      await page.setContent(surveyHtml, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.evaluate(() => document.fonts.ready);
      const surveyBytes = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      surveyPdf = await PDFDocument.load(surveyBytes);
      if (surveyPdf.getPageCount() !== 15)
        throw new Error(
          `จำนวนหน้ารายงานสำรวจไม่ถูกต้อง: ${surveyPdf.getPageCount()}/15 หน้า`,
        );
    }

    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.evaluate(() => document.fonts.ready);
    const quotationBytes = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    const quotationPdf = await PDFDocument.load(quotationBytes);
    if (quotationPdf.getPageCount() !== 2)
      throw new Error(
        `จำนวนหน้าใบเสนอราคาไม่ถูกต้อง: ${quotationPdf.getPageCount()}/2 หน้า`,
      );
    if (quotationOnly) {
      return new NextResponse(Buffer.from(quotationBytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${q.doc_no}-quotation.pdf"`,
          "X-Quotation-Document-Pages": "2",
        },
      });
    }

    const mergedPdf = await PDFDocument.create();
    const surveyPages = await mergedPdf.copyPages(
      surveyPdf!,
      surveyPdf!.getPageIndices(),
    );
    const quotationPages = await mergedPdf.copyPages(
      quotationPdf,
      quotationPdf.getPageIndices(),
    );
    [...surveyPages, ...quotationPages].forEach((pdfPage) =>
      mergedPdf.addPage(pdfPage),
    );
    const bytes = await mergedPdf.save();
    const pageCount = mergedPdf.getPageCount();
    if (pageCount !== 17)
      throw new Error(`จำนวนหน้าเอกสารไม่ถูกต้อง: ${pageCount}/17 หน้า`);
    if (detail.status === "approved") {
      const buffer = Buffer.from(bytes);
      const hash = createHash("sha256").update(buffer).digest("hex");
      await db
        .request()
        .input("id", sql.Int, quotationId)
        .input("documentType", sql.NVarChar(30), APPROVED_BUNDLE_DOCUMENT_TYPE)
        .input("data", sql.VarBinary(sql.MAX), buffer)
        .input("hash", sql.Char(64), hash)
        .input("pages", sql.Int, pageCount)
        .query(
          `IF NOT EXISTS (SELECT 1 FROM quotation_document_artifacts WHERE quotation_id=@id AND document_type=@documentType) INSERT quotation_document_artifacts(quotation_id,document_type,pdf_data,file_hash,page_count) VALUES(@id,@documentType,@data,@hash,@pages)`,
        );
    }
    const disposition =
      req.nextUrl.searchParams.get("download") === "1"
        ? "attachment"
        : "inline";
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        // ชื่อไฟล์มีชื่อลูกค้าต่อท้าย เช่น SSR-QT-26-0003_ธิติมา_พลพินิจ.pdf
        "Content-Disposition": buildContentDisposition({
          base: String(q.doc_no),
          ext: "pdf",
          customerName: (q.customer_name as string) || null,
          disposition,
        }),
        "X-Quotation-Document-Pages": String(pageCount),
      },
    });
  } catch (error) {
    console.error("quotation pdf", error);
    return NextResponse.json({ error: "สร้าง PDF ไม่สำเร็จ" }, { status: 500 });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
