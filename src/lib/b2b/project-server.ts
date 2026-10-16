import { sql } from "./db";
import type { B2bActivity, B2bInstallment, B2bProject, B2bProjectBoq, B2bProjectQuote, B2bProjectRow, ProjectFields } from "./project";
import { PERMITS, type B2bMilestone, type B2bPermit } from "./execution";

// ฝั่ง server ของโครงการ B2B — โหลด / เลขที่ / timeline / ซิงก์หัวใบ BOQ
// แผน docs/plan/20261015-07-b2b-project-flow.md เฟส 1

type Queryable = { request(): sql.Request };

const num = (v: unknown) => (v == null ? null : Number(v));

/** ขั้นย่อยคิดตอนอ่าน (ไม่มีคอลัมน์ให้คอย sync) — สำรวจ: มีวันนัดในอนาคต = 3310 · ถึง/เลยวันนัด = 3320 (เวลาไทย) */
const ms = (p: string, kind: string) => `EXISTS (SELECT 1 FROM b2b_project_milestones m WHERE m.project_id = ${p}.id AND m.kind = '${kind}')`;
//  ราคาประมาณการ/ราคายืนยัน: สถานะใบเสนอราคาชนิดของขั้นนั้นที่ขยับล่าสุด (Rev ล่าสุดของแต่ละเลขที่) → หลักสิบ (QUOTE_SUB_OFFSET)
//    กรองชนิดใบ — ขั้นราคายืนยันที่ยังไม่มีใบยืนยันเคยขึ้น "ร่าง" ของใบประมาณการ (16 ต.ค. 69)
export const PROJECT_SUB_SQL = (p: string) => `
  CASE WHEN ${p}.stage = 3300 AND ${p}.survey_date IS NOT NULL
       THEN CASE WHEN ${p}.survey_date > CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE) THEN 3310 ELSE 3320 END
       WHEN ${p}.stage IN (3200, 3400)
       THEN (SELECT TOP 1 ${p}.stage + CASE qq.status WHEN 'draft' THEN 10 WHEN 'pending_review1' THEN 20 WHEN 'pending_review2' THEN 30
                                                        WHEN 'pending_review3' THEN 40 WHEN 'changes_required' THEN 50 WHEN 'approved' THEN 60 ELSE 70 END
             FROM b2b_quotations qq WHERE qq.project_id = ${p}.id AND qq.is_latest = 1
               AND qq.kind = CASE WHEN ${p}.stage = 3200 THEN 'estimate' ELSE 'confirmed' END
             ORDER BY qq.updated_at DESC, qq.id DESC)
       -- ได้งาน: ยังไม่เซ็น = 3510 · งวด 1 ยังไม่รับ = 3520 · แนบหลักฐานแล้วรอบัญชี = 3530 (รับแล้วโครงการขยับไป 3600 เอง)
       -- ดำเนินโครงการ (เฟส 4): จาก milestone ที่บันทึกแล้ว
       WHEN ${p}.stage = 3600 THEN CASE WHEN ${ms(p, "procured")} THEN 3620 ELSE 3610 END
       WHEN ${p}.stage = 3700 THEN CASE WHEN ${ms(p, "install_done")} THEN 3740 WHEN ${ms(p, "install_started")} THEN 3730
                                        WHEN ${ms(p, "panels_delivered")} THEN 3720 ELSE 3710 END
       WHEN ${p}.stage = 3800 THEN CASE WHEN ${ms(p, "cod")} THEN 3820 ELSE 3810 END
       WHEN ${p}.stage = 3900 THEN CASE WHEN ${ms(p, "handover")} THEN 3920 ELSE 3910 END
       WHEN ${p}.stage = 3500
       THEN CASE WHEN ${p}.contract_date IS NULL THEN 3510
                 ELSE (SELECT CASE ii.status WHEN 'submitted' THEN 3530 WHEN 'paid' THEN NULL ELSE 3520 END
                       FROM b2b_project_installments ii WHERE ii.project_id = ${p}.id AND ii.no = 1) END
  END`;

/** งวดเงิน (alias i) + ชื่อคนแนบ/ยืนยัน — หน้าโครงการ + รายรับ B2B ใช้ชุดเดียวกัน (ต่อ WHERE เอง) */
export const INSTALLMENT_SELECT = `
  SELECT i.id, i.project_id, i.no, i.pct, i.condition, i.trigger_key, i.amount, i.vat, i.total, i.status, i.due_at,
         CONVERT(char(10), i.received_date, 23) AS received_date, i.evidence_name,
         CASE WHEN i.evidence_file IS NULL THEN 0 ELSE 1 END AS has_evidence, i.submit_note,
         i.submitted_at, su.full_name AS submitted_by_name, i.confirmed_at, cu.full_name AS confirmed_by_name, i.reject_note, i.rejected_at
  FROM b2b_project_installments i
  LEFT JOIN users su ON su.id = i.submitted_by
  LEFT JOIN users cu ON cu.id = i.confirmed_by`;
/** แถวจาก INSTALLMENT_SELECT — เลขทศนิยม/บิตมาเป็นค่าดิบของ mssql แปลงที่นี่ที่เดียว */
type InstallmentDbRow = Omit<B2bInstallment, "pct" | "amount" | "vat" | "total" | "has_evidence"> & { pct: unknown; amount: unknown; vat: unknown; total: unknown; has_evidence: unknown };
export const toInstallment = (i: InstallmentDbRow): B2bInstallment => ({
  id: i.id, no: i.no, pct: Number(i.pct), condition: i.condition, trigger_key: i.trigger_key,
  amount: Number(i.amount), vat: Number(i.vat), total: Number(i.total), status: i.status, due_at: i.due_at,
  received_date: i.received_date, evidence_name: i.evidence_name, has_evidence: !!i.has_evidence, submit_note: i.submit_note,
  submitted_at: i.submitted_at, submitted_by_name: i.submitted_by_name, confirmed_at: i.confirmed_at, confirmed_by_name: i.confirmed_by_name,
  reject_note: i.reject_note, rejected_at: i.rejected_at,
});

/** แถวรายการโครงการ — BOQ ที่แสดง = ตัวเลือกที่บันทึกล่าสุด (Rev ล่าสุดของแต่ละเลขที่)
 *  extraCols / extraJoins = คอลัมน์เพิ่มของหน้ารายละเอียด */
export const projectRowSelect = (extraCols = "", extraJoins = "") => `
  SELECT p.id, p.code, p.name, p.customer_id, c.name AS customer_name, p.location, p.stage, ${PROJECT_SUB_SQL("p")} AS sub,
         CONVERT(char(10), p.survey_date, 23) AS survey_date, p.close_reason, p.owner_id, ou.full_name AS owner_name,
         bs.n AS boq_count, bs.min_wp AS boq_capacity_min_wp, bs.max_wp AS boq_capacity_max_wp,
         lb.capacity_wp AS boq_capacity_wp, lb.total_sale AS boq_total_sale,
         COALESCE((SELECT MAX(a.created_at) FROM b2b_project_activities a
                   WHERE a.project_id = p.id AND a.to_stage = p.stage AND (a.from_stage IS NULL OR a.from_stage <> a.to_stage)), p.created_at) AS stage_since,
         p.updated_at${extraCols ? `, ${extraCols}` : ""}
  FROM b2b_projects p
  JOIN b2b_customers c ON c.id = p.customer_id
  LEFT JOIN users ou ON ou.id = p.owner_id
  OUTER APPLY (SELECT COUNT(*) AS n, MIN(CASE WHEN b.capacity_wp > 0 THEN b.capacity_wp END) AS min_wp, MAX(CASE WHEN b.capacity_wp > 0 THEN b.capacity_wp END) AS max_wp
               FROM b2b_boqs b WHERE b.project_id = p.id AND b.is_latest = 1) bs
  OUTER APPLY (SELECT TOP 1 b.capacity_wp, b.total_sale FROM b2b_boqs b
               WHERE b.project_id = p.id AND b.is_latest = 1 ORDER BY b.updated_at DESC, b.id DESC) lb
  ${extraJoins}`;

export function toProjectRow(r: Record<string, unknown>): B2bProjectRow {
  return {
    id: r.id as number, code: r.code as string, name: r.name as string, customer_id: r.customer_id as number,
    customer_name: r.customer_name as string, location: (r.location as string) ?? null,
    stage: r.stage as number, sub: num(r.sub), survey_date: (r.survey_date as string) ?? null, close_reason: (r.close_reason as string) ?? null,
    owner_id: num(r.owner_id), owner_name: (r.owner_name as string) ?? null,
    boq_count: Number(r.boq_count ?? 0), boq_capacity_wp: num(r.boq_capacity_wp), boq_total_sale: num(r.boq_total_sale),
    boq_capacity_min_wp: num(r.boq_capacity_min_wp), boq_capacity_max_wp: num(r.boq_capacity_max_wp),
    stage_since: r.stage_since as string,
    updated_at: r.updated_at as string,
  };
}

export async function loadProject(db: Queryable, id: number): Promise<B2bProject | null> {
  const h = await db.request().input("id", sql.Int, id).query(`
    ${projectRowSelect(
      `c.tax_id, c.branch, c.address, p.contact_name, p.contact_phone, p.contact_email, p.latitude, p.longitude,
       p.stage_before_close, p.closed_at, p.surveyor_id, su.full_name AS surveyor_name, p.survey_note, p.survey_done_at,
       p.note, p.created_at, cu.full_name AS created_by_name, uu.full_name AS updated_by_name,
       p.won_quote_id, p.won_boq_id, p.contract_no, CONVERT(char(10), p.contract_date, 23) AS contract_date, p.contract_value,
       p.contract_vat_pct, p.won_at, p.om_years, p.om_visits_per_year`,
      `LEFT JOIN users su ON su.id = p.surveyor_id
       LEFT JOIN users cu ON cu.id = p.created_by
       LEFT JOIN users uu ON uu.id = p.updated_by`,
    )}
    WHERE p.id = @id`);
  const r = h.recordset[0];
  if (!r) return null;
  const [boqs, acts, quotes, insts, mss, permits, omc, pfiles] = await Promise.all([
    db.request().input("id", sql.Int, id).query(`
      SELECT b.id, b.doc_no, b.revision, b.option_label, b.capacity_wp, b.total_cost, b.total_sale, b.margin_pct, b.pending_lines,
             b.updated_at, uu.full_name AS updated_by_name
      FROM b2b_boqs b LEFT JOIN users uu ON uu.id = b.updated_by
      WHERE b.project_id = @id AND b.is_latest = 1
      ORDER BY b.doc_no`),
    db.request().input("id", sql.Int, id).query(`
      SELECT TOP 300 a.id, a.kind, a.from_stage, a.to_stage, a.message, a.created_at, u.full_name AS created_by_name
      FROM b2b_project_activities a LEFT JOIN users u ON u.id = a.created_by
      WHERE a.project_id = @id ORDER BY a.created_at DESC, a.id DESC`),
    db.request().input("id", sql.Int, id).query(`
      SELECT q.id, q.doc_no, q.revision, q.kind, q.status, q.subtotal, q.total, q.updated_at, CONVERT(char(10), q.issue_date, 23) AS issue_date,
             JSON_VALUE(q.content_json, '$.validity_days') AS validity_days, b.doc_no AS boq_doc_no, b.revision AS boq_revision, b.option_label
      FROM b2b_quotations q JOIN b2b_boqs b ON b.id = q.boq_id
      WHERE q.project_id = @id AND q.is_latest = 1
      ORDER BY q.updated_at DESC, q.id DESC`),
    db.request().input("id", sql.Int, id).query(`${INSTALLMENT_SELECT} WHERE i.project_id = @id ORDER BY i.no`),
    db.request().input("id", sql.Int, id).query(`
      SELECT m.id, m.kind, CONVERT(char(10), m.done_date, 23) AS done_date, m.note, m.files_json, m.stage_before, m.stage_after,
             m.created_at, u.full_name AS created_by_name
      FROM b2b_project_milestones m LEFT JOIN users u ON u.id = m.created_by
      WHERE m.project_id = @id ORDER BY m.created_at, m.id`),
    db.request().input("id", sql.Int, id).query(`
      SELECT id, kind, status, CONVERT(char(10), submitted_date, 23) AS submitted_date, CONVERT(char(10), approved_date, 23) AS approved_date,
             note, CASE WHEN file_name IS NULL THEN 0 ELSE 1 END AS has_file, file_label, updated_at
      FROM b2b_project_permits WHERE project_id = @id`),
    db.request().input("id", sql.Int, id).query(`SELECT TOP 1 id FROM b2b_om_contracts WHERE project_id = @id ORDER BY seq DESC`),
    db.request().input("id", sql.Int, id).query(`
      SELECT f.id, f.kind, f.label, f.mime, f.note, f.created_at, u.full_name AS created_by_name
      FROM b2b_project_files f LEFT JOIN users u ON u.id = f.created_by
      WHERE f.project_id = @id ORDER BY f.created_at, f.id`),
  ]);
  return {
    ...toProjectRow(r),
    customer: { id: r.customer_id, name: r.customer_name, tax_id: r.tax_id, branch: r.branch, address: r.address },
    contact_name: r.contact_name, contact_phone: r.contact_phone, contact_email: r.contact_email,
    latitude: num(r.latitude), longitude: num(r.longitude),
    stage_before_close: num(r.stage_before_close), closed_at: r.closed_at,
    surveyor_id: num(r.surveyor_id), surveyor_name: r.surveyor_name, survey_note: r.survey_note, survey_done_at: r.survey_done_at,
    note: r.note, created_at: r.created_at, created_by_name: r.created_by_name, updated_by_name: r.updated_by_name,
    boqs: boqs.recordset.map((b): B2bProjectBoq => ({
      id: b.id, doc_no: b.doc_no, revision: b.revision, option_label: b.option_label,
      capacity_wp: num(b.capacity_wp), total_cost: num(b.total_cost), total_sale: num(b.total_sale), margin_pct: Number(b.margin_pct),
      pending_lines: b.pending_lines, updated_at: b.updated_at, updated_by_name: b.updated_by_name,
    })),
    quotes: quotes.recordset.map((q): B2bProjectQuote => ({
      id: q.id, doc_no: q.doc_no, revision: q.revision, kind: q.kind, status: q.status,
      subtotal: Number(q.subtotal), total: Number(q.total), updated_at: q.updated_at, issue_date: q.issue_date,
      validity_days: q.validity_days == null ? null : Number(q.validity_days),
      boq_doc_no: q.boq_doc_no, boq_revision: q.boq_revision, option_label: q.option_label,
    })),
    won_quote_id: num(r.won_quote_id), won_boq_id: num(r.won_boq_id), contract_no: r.contract_no, contract_date: r.contract_date,
    contract_value: num(r.contract_value), contract_vat_pct: num(r.contract_vat_pct), won_at: r.won_at,
    om_years: num(r.om_years), om_visits_per_year: num(r.om_visits_per_year),
    installments: insts.recordset.map(toInstallment),
    om_contract_id: omc.recordset[0]?.id ?? null,
    files: pfiles.recordset,
    milestones: mss.recordset.map((m): B2bMilestone => ({
      id: m.id, kind: m.kind, done_date: m.done_date, note: m.note, files: m.files_json ? JSON.parse(m.files_json) : [],
      stage_before: m.stage_before, stage_after: m.stage_after, created_at: m.created_at, created_by_name: m.created_by_name,
    })),
    // ครบ 3 อย่างเสมอ — แถวที่ยังไม่เคยบันทึก = ยังไม่ยื่น
    permits: PERMITS.map((d): B2bPermit => {
      const r = permits.recordset.find((x) => x.kind === d.kind);
      return r
        ? { id: r.id, kind: r.kind, status: r.status, submitted_date: r.submitted_date, approved_date: r.approved_date, note: r.note,
            has_file: !!r.has_file, file_label: r.file_label, updated_at: r.updated_at }
        : { id: null, kind: d.kind, status: "pending", submitted_date: null, approved_date: null, note: null, has_file: false, file_label: null, updated_at: null };
    }),
    activities: acts.recordset.map((a): B2bActivity => ({
      id: a.id, kind: a.kind, from_stage: num(a.from_stage), to_stage: num(a.to_stage), message: a.message,
      created_at: a.created_at, created_by_name: a.created_by_name,
    })),
  };
}

/** บันทึก timeline — เรียกใน transaction เดียวกับการเปลี่ยนข้อมูล */
export async function logActivity(
  db: Queryable, projectId: number, kind: string,
  opts: { from?: number | null; to?: number | null; message?: string | null; userId: number | null },
): Promise<void> {
  await db.request()
    .input("p", sql.Int, projectId).input("k", sql.VarChar(30), kind)
    .input("f", sql.Int, opts.from ?? null).input("t", sql.Int, opts.to ?? null)
    .input("m", sql.NVarChar(1000), opts.message ? opts.message.slice(0, 1000) : null).input("u", sql.Int, opts.userId)
    .query(`INSERT INTO b2b_project_activities (project_id, kind, from_stage, to_stage, message, created_by) VALUES (@p, @k, @f, @t, @m, @u)`);
}

/** หัวใบ BOQ (Rev ล่าสุด) ของโครงการ = ข้อมูลโครงการเสมอ — Rev เก่าคง snapshot ไว้ตามที่ออกไปแล้ว */
export async function syncBoqHeaders(db: Queryable, projectId: number): Promise<void> {
  await db.request().input("p", sql.Int, projectId).query(`
    UPDATE b SET project_name = p.name, customer_name = c.name, location = p.location, latitude = p.latitude, longitude = p.longitude
    FROM b2b_boqs b JOIN b2b_projects p ON p.id = b.project_id JOIN b2b_customers c ON c.id = p.customer_id
    WHERE b.project_id = @p AND b.is_latest = 1`);
}

/** เลขที่โครงการ PRJyymm-nnn (เวลาไทย) — เรียกใน transaction · UPDLOCK กันสองคนได้เลขซ้ำ (แบบ nextDocNo ของ BOQ) */
export async function nextProjectCode(tx: sql.Transaction): Promise<string> {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const prefix = `PRJ${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}-`;
  const r = await new sql.Request(tx).input("p", sql.NVarChar(20), `${prefix}%`)
    .query(`SELECT MAX(code) AS last FROM b2b_projects WITH (UPDLOCK, HOLDLOCK) WHERE code LIKE @p`);
  const last = r.recordset[0]?.last as string | null;
  const seq = last ? Number(last.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

/** บริษัทลูกค้าของโครงการ — เลือกเดิม (ตรวจว่ามีจริง) หรือพิมพ์ใหม่
 *  พิมพ์ใหม่แต่เลขผู้เสียภาษี + สาขาตรงกับบริษัทที่มีอยู่ = ใช้แถวเดิม (กันบริษัทเดียวกันแตกเป็นหลายแถว)
 *  คืน null = id ที่เลือกไม่มีอยู่ */
export async function ensureCustomer(tx: sql.Transaction, c: ProjectFields["customer"], userId: number): Promise<number | null> {
  if (c.id != null) {
    const r = await new sql.Request(tx).input("id", sql.Int, c.id).query(`SELECT id FROM b2b_customers WHERE id = @id`);
    return r.recordset[0]?.id ?? null;
  }
  if (c.tax_id) {
    const r = await new sql.Request(tx).input("tax", sql.NVarChar(20), c.tax_id).input("br", sql.NVarChar(100), c.branch)
      .query(`SELECT TOP 1 id FROM b2b_customers WHERE tax_id = @tax AND ISNULL(branch, N'') = ISNULL(@br, N'') ORDER BY id`);
    if (r.recordset[0]) return r.recordset[0].id;
  }
  const ins = await new sql.Request(tx)
    .input("name", sql.NVarChar(300), c.name).input("tax", sql.NVarChar(20), c.tax_id)
    .input("br", sql.NVarChar(100), c.branch).input("addr", sql.NVarChar(500), c.address).input("u", sql.Int, userId)
    .query(`INSERT INTO b2b_customers (name, tax_id, branch, address, created_by, updated_by) OUTPUT INSERTED.id
            VALUES (@name, @tax, @br, @addr, @u, @u)`);
  return ins.recordset[0].id;
}

/** ผู้ใช้ที่ดูแลโครงการ/สำรวจได้ = role b2b ที่ยังใช้งาน */
export async function loadB2bUsers(db: Queryable): Promise<{ id: number; full_name: string }[]> {
  const r = await db.request().query(`
    SELECT id, full_name FROM users
    WHERE is_active = 1 AND EXISTS (SELECT 1 FROM OPENJSON(roles) WHERE value = 'b2b')
    ORDER BY full_name`);
  return r.recordset;
}
