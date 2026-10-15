import { sql } from "./db";
import type { B2bActivity, B2bProject, B2bProjectBoq, B2bProjectRow, ProjectFields } from "./project";

// ฝั่ง server ของโครงการ B2B — โหลด / เลขที่ / timeline / ซิงก์หัวใบ BOQ
// แผน docs/plan/20261015-07-b2b-project-flow.md เฟส 1

type Queryable = { request(): sql.Request };

const num = (v: unknown) => (v == null ? null : Number(v));

/** ขั้นย่อยคิดตอนอ่าน (ไม่มีคอลัมน์ให้คอย sync) — สำรวจ: มีวันนัดในอนาคต = 3310 · ถึง/เลยวันนัด = 3320 (เวลาไทย) */
export const PROJECT_SUB_SQL = (p: string) => `
  CASE WHEN ${p}.stage = 3300 AND ${p}.survey_date IS NOT NULL
       THEN CASE WHEN ${p}.survey_date > CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE) THEN 3310 ELSE 3320 END
  END`;

/** แถวรายการโครงการ — BOQ ที่แสดง = ตัวเลือกที่บันทึกล่าสุด (Rev ล่าสุดของแต่ละเลขที่)
 *  extraCols / extraJoins = คอลัมน์เพิ่มของหน้ารายละเอียด */
export const projectRowSelect = (extraCols = "", extraJoins = "") => `
  SELECT p.id, p.code, p.name, p.customer_id, c.name AS customer_name, p.location, p.stage, ${PROJECT_SUB_SQL("p")} AS sub,
         CONVERT(char(10), p.survey_date, 23) AS survey_date, p.close_reason, p.owner_id, ou.full_name AS owner_name,
         (SELECT COUNT(*) FROM b2b_boqs b WHERE b.project_id = p.id AND b.is_latest = 1) AS boq_count,
         lb.capacity_wp AS boq_capacity_wp, lb.total_sale AS boq_total_sale, p.updated_at${extraCols ? `, ${extraCols}` : ""}
  FROM b2b_projects p
  JOIN b2b_customers c ON c.id = p.customer_id
  LEFT JOIN users ou ON ou.id = p.owner_id
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
    updated_at: r.updated_at as string,
  };
}

export async function loadProject(db: Queryable, id: number): Promise<B2bProject | null> {
  const h = await db.request().input("id", sql.Int, id).query(`
    ${projectRowSelect(
      `c.tax_id, c.branch, c.address, p.contact_name, p.contact_phone, p.contact_email, p.latitude, p.longitude,
       p.stage_before_close, p.closed_at, p.surveyor_id, su.full_name AS surveyor_name, p.survey_note, p.survey_done_at,
       p.note, p.created_at, cu.full_name AS created_by_name, uu.full_name AS updated_by_name`,
      `LEFT JOIN users su ON su.id = p.surveyor_id
       LEFT JOIN users cu ON cu.id = p.created_by
       LEFT JOIN users uu ON uu.id = p.updated_by`,
    )}
    WHERE p.id = @id`);
  const r = h.recordset[0];
  if (!r) return null;
  const [boqs, acts] = await Promise.all([
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
