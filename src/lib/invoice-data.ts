import "server-only";

import { getDb, sql, fixDates } from "@/lib/db";
import { mintDocNo } from "@/lib/doc-number";

export interface InvoiceData {
  id: number;
  reference_no: string;
  amount: number;
  description: string;
  installment: string;
  is_pre_survey: boolean;
  full_name: string;
  phone: string;
  email: string | null;
  project_name: string | null;
  installation_address: string | null;
  survey_date: string | null;
  survey_time_slot: string | null;
  install_date: string | null;
  install_actual_date: string | null;
  install_completed_at: string | null;
  created_at: string;
  packages: { id: number; name: string; kwp: number; price: number }[];
  step_no: number;
  payment_no: string | null;
  payment_method: string | null;
  cc_surcharge_pct: number | null;
  cc_surcharge_amount: number;
  total_to_pay: number;
}

export async function getInvoiceData(token: string): Promise<InvoiceData | null> {
  if (!token || token.length < 10) return null;
  const db = await getDb();
  const r = await db.request().input("token", sql.NVarChar(64), token).query(`
    SELECT l.id, l.full_name, l.phone, l.email, l.installation_address, l.id_card_address, l.id_card_number,
           l.survey_date, l.survey_time_slot, l.install_date, l.install_actual_date, l.install_completed_at,
           l.interested_package_ids, l.interested_package_id,
           l.contact_date, l.created_at, l.pre_pay_amount, l.pre_pay_description, l.pre_pay_installment, l.status,
           l.pre_doc_no, l.project_alias, l.pre_pay_payment_id,
           COALESCE(NULLIF(l.project_alias, N''), pr.name) as project_name,
           p.payment_method as pay_method,
           p.discount_pct, p.discount_amount, p.discount_note,
           p.cc_surcharge_pct, p.cc_surcharge_amount,
           p.payment_no, p.step_no as payment_step_no
    FROM leads l
    LEFT JOIN projects pr ON l.project_id = pr.id
    LEFT JOIN payments p ON p.id = l.pre_pay_payment_id
    WHERE l.pre_pay_token = @token
  `);
  if (r.recordset.length === 0) return null;
  const lead = r.recordset[0];
  const isPreSurvey = lead.status === "pre_survey";
  const packageIds = isPreSurvey
    ? (lead.interested_package_ids
        ? String(lead.interested_package_ids).split(",").map(Number).filter(Boolean)
        : (lead.interested_package_id ? [Number(lead.interested_package_id)] : []))
    : (lead.interested_package_id ? [Number(lead.interested_package_id)] : []);
  let packages: InvoiceData["packages"] = [];
  if (packageIds.length > 0) {
    const packageResult = await db.request().query(
      `SELECT id, name, kwp, price FROM packages WHERE id IN (${packageIds.join(",")}) ORDER BY kwp`,
    );
    packages = packageResult.recordset;
  }
  let docNo: string | null = lead.pre_doc_no;
  if (!docNo) docNo = await mintDocNo(db, lead.id, "booking");
  const amount = Number(lead.pre_pay_amount || 0);
  const ccSurchargeAmount = Number(lead.cc_surcharge_amount || 0);
  const fixed = fixDates([lead])[0];
  return {
    ...fixed,
    amount,
    description: lead.pre_pay_description || "",
    installment: lead.pre_pay_installment || "",
    packages,
    is_pre_survey: isPreSurvey,
    reference_no: docNo,
    step_no: lead.payment_step_no != null ? Number(lead.payment_step_no) : 1,
    payment_no: lead.payment_no || null,
    payment_method: lead.pay_method || null,
    cc_surcharge_pct: lead.cc_surcharge_pct != null ? Number(lead.cc_surcharge_pct) : null,
    cc_surcharge_amount: ccSurchargeAmount,
    total_to_pay: amount + ccSurchargeAmount,
  } as InvoiceData;
}
