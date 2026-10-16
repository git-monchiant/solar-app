import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb } from "@/lib/b2b/db";
import { B2B_STAGE, type B2bInstallment } from "@/lib/b2b/project";
import { INSTALLMENT_SELECT, toInstallment } from "@/lib/b2b/project-server";

// รายรับ B2B (แผน 20261015-08) — 1 แถว = 1 โครงการที่ได้งานแล้ว (มีงวดเงิน) + งวดทั้งหมดของโครงการ
// ยอดทุกช่องรวม VAT (ยอดที่ลูกค้าโอนจริง) · ค้างรับ = งวดที่ยังไม่รับเงิน ของโครงการที่ไม่ได้ยกเลิก
// บัญชี/admin เท่านั้น (แบบรายรับ O&M) — Solar B2B ดูงวดของตัวเองในหน้าโครงการ
export async function GET(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, ["account", "admin"]);
  if (gate.error) return gate.error;
  const db = await getB2bDb();
  const [projects, insts] = await Promise.all([
    db.request().query(`
      SELECT p.id, p.code, p.name, p.stage, c.name AS customer_name, c.tax_id, p.contract_no,
             CONVERT(char(10), p.contract_date, 23) AS contract_date, p.contract_value, p.contract_vat_pct,
             CONVERT(char(10), p.won_at, 23) AS won_date, q.doc_no AS quote_doc_no, q.revision AS quote_revision
      FROM b2b_projects p
      JOIN b2b_customers c ON c.id = p.customer_id
      LEFT JOIN b2b_quotations q ON q.id = p.won_quote_id
      WHERE EXISTS (SELECT 1 FROM b2b_project_installments x WHERE x.project_id = p.id)
      ORDER BY p.won_at DESC, p.id DESC`),
    db.request().query(`${INSTALLMENT_SELECT} ORDER BY i.project_id, i.no`),
  ]);
  const byProject = new Map<number, B2bInstallment[]>();
  for (const r of insts.recordset) {
    const list = byProject.get(r.project_id) ?? [];
    list.push(toInstallment(r));
    byProject.set(r.project_id, list);
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const sum = (xs: B2bInstallment[]) => round2(xs.reduce((s, x) => s + x.total, 0));
  const rows = projects.recordset.map((p) => {
    const items = byProject.get(p.id) ?? [];
    const dead = p.stage === B2B_STAGE.cancelled || p.stage === B2B_STAGE.lost;
    const total = sum(items);
    const received = sum(items.filter((x) => x.status === "paid"));
    return {
      id: p.id, code: p.code, name: p.name, stage: p.stage, customer_name: p.customer_name, tax_id: p.tax_id,
      contract_no: p.contract_no, contract_date: p.contract_date, contract_value: p.contract_value == null ? null : Number(p.contract_value),
      contract_vat_pct: p.contract_vat_pct == null ? null : Number(p.contract_vat_pct), won_date: p.won_date,
      quote_doc_no: p.quote_doc_no, quote_revision: p.quote_revision,
      total, received,
      due: dead ? 0 : sum(items.filter((x) => x.status === "due")),
      pending: sum(items.filter((x) => x.status === "submitted")),
      outstanding: dead ? 0 : round2(total - received),
      installments: items,
    };
  });
  return NextResponse.json({ rows });
}
