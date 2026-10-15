import { sql } from "./db";
import { thaiDateShort } from "./project";
import { logActivity } from "./project-server";
import type { B2bOmContract, B2bOmContractDetail, B2bOmVisit, B2bOmVisitRow } from "./om";
import { addMonthsIso, visitDueDates } from "./om";

// ฝั่ง server ของ O&M B2B — สร้างสัญญา · ขั้นของครั้งเข้างาน · โหลด · timeline (แผน docs/plan/20261015-09-b2b-om.md)

type Queryable = { request(): sql.Request };
const num = (v: unknown) => (v == null ? null : Number(v));
const TODAY = "CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE)";

/** ขั้นของครั้งเข้างาน (alias v) — คิดตอนอ่าน ไม่มีคอลัมน์ให้คอย sync
 *  ถึงรอบ 4100 = ยังไม่นัด และกำหนดอยู่ในเดือนนี้/เดือนหน้า (หรือเลยมาแล้ว) · นัดแล้ว 4200 · ถึงวันนัดแล้วยังไม่ปิด 4300
 *  ปิด 4500 · ข้าม 4900 · ยังไม่ถึงรอบ = NULL · สัญญาที่ยกเลิก = NULL (ไม่ขึ้นคิว) */
export const VISIT_STEP_SQL = (v = "v", c = "c") => `
  CASE WHEN ${c}.cancelled_at IS NOT NULL THEN NULL
       WHEN ${v}.status = 'planned' THEN CASE WHEN ${v}.due_date < DATEADD(MONTH, 2, DATEFROMPARTS(YEAR(${TODAY}), MONTH(${TODAY}), 1)) THEN 4100 END
       WHEN ${v}.status = 'scheduled' THEN CASE WHEN ${v}.scheduled_date <= ${TODAY} THEN 4300 ELSE 4200 END
       WHEN ${v}.status = 'done' THEN 4500
       WHEN ${v}.status = 'skipped' THEN 4900
  END`;

const VISIT_COLS = `
  v.id, v.contract_id, v.project_id, v.seq_no, CONVERT(char(10), v.due_date, 23) AS due_date, v.status, ${VISIT_STEP_SQL()} AS step,
  CONVERT(char(10), v.scheduled_date, 23) AS scheduled_date, v.days, v.lead_user_id, lu.full_name AS lead_name, v.schedule_note,
  CONVERT(char(10), v.done_date, 23) AS done_date, v.result_note, v.files_json, v.skip_reason, v.closed_at, cu.full_name AS closed_by_name`;
const VISIT_JOINS = `
  JOIN b2b_om_contracts c ON c.id = v.contract_id
  LEFT JOIN users lu ON lu.id = v.lead_user_id
  LEFT JOIN users cu ON cu.id = v.closed_by`;

/** แถว SQL → ครั้งเข้างาน (step / files แปลงที่นี่ที่เดียว) */
function toVisit(r: Record<string, unknown>): B2bOmVisit {
  return {
    id: r.id as number, contract_id: r.contract_id as number, project_id: r.project_id as number, seq_no: r.seq_no as number,
    due_date: r.due_date as string, status: r.status as B2bOmVisit["status"], step: num(r.step),
    scheduled_date: (r.scheduled_date as string) ?? null, days: num(r.days), lead_user_id: num(r.lead_user_id),
    lead_name: (r.lead_name as string) ?? null, schedule_note: (r.schedule_note as string) ?? null,
    done_date: (r.done_date as string) ?? null, result_note: (r.result_note as string) ?? null,
    files: r.files_json ? JSON.parse(r.files_json as string) : [], skip_reason: (r.skip_reason as string) ?? null,
    closed_at: (r.closed_at as string) ?? null, closed_by_name: (r.closed_by_name as string) ?? null,
  };
}

/** รายการครั้งเข้างานตามแท็บ (หน้า /b2b/om) */
export async function listVisits(db: Queryable, tab: string): Promise<B2bOmVisitRow[]> {
  const where: Record<string, string> = {
    due: "x.step = 4100", scheduled: "x.step = 4200", onsite: "x.step = 4300", done: "x.step IN (4500, 4900)",
    upcoming: "x.step IS NULL AND x.status = 'planned' AND x.cancelled_at IS NULL", all: "1 = 1",
  };
  const order = tab === "done" ? "x.closed_at DESC" : tab === "scheduled" || tab === "onsite" ? "x.scheduled_date, x.id" : "x.due_date, x.id";
  const r = await db.request().query(`
    SELECT x.* FROM (
      SELECT ${VISIT_COLS}, c.visits_total, c.cancelled_at, p.code AS project_code, p.name AS project_name, cust.name AS customer_name, p.location
      FROM b2b_om_visits v ${VISIT_JOINS}
      JOIN b2b_projects p ON p.id = v.project_id
      JOIN b2b_customers cust ON cust.id = p.customer_id
    ) x WHERE ${where[tab] ?? where.all} ORDER BY ${order}`);
  return r.recordset.map((row) => ({
    ...toVisit(row), visits_total: row.visits_total, project_code: row.project_code, project_name: row.project_name,
    customer_name: row.customer_name, location: row.location,
  }));
}

/** ปฏิทิน: นัดที่ทับช่วง [from, to] (นับจำนวนวันเข้างาน) + ครั้งที่ยังไม่นัดแต่กำหนดอยู่ในช่วง (ไว้โชว์ข้างปฏิทิน) */
export async function listVisitsInRange(db: Queryable, from: string, to: string): Promise<B2bOmVisitRow[]> {
  const r = await db.request().input("f", sql.Date, from).input("t", sql.Date, to).query(`
    SELECT ${VISIT_COLS}, c.visits_total, p.code AS project_code, p.name AS project_name, cust.name AS customer_name, p.location
    FROM b2b_om_visits v ${VISIT_JOINS}
    JOIN b2b_projects p ON p.id = v.project_id
    JOIN b2b_customers cust ON cust.id = p.customer_id
    WHERE c.cancelled_at IS NULL AND (
      (v.scheduled_date IS NOT NULL AND v.scheduled_date <= @t AND DATEADD(DAY, COALESCE(v.days, 1) - 1, v.scheduled_date) >= @f)
      OR (v.status = 'planned' AND v.due_date BETWEEN @f AND @t))
    ORDER BY COALESCE(v.scheduled_date, v.due_date), v.id`);
  return r.recordset.map((row) => ({
    ...toVisit(row), visits_total: row.visits_total, project_code: row.project_code, project_name: row.project_name,
    customer_name: row.customer_name, location: row.location,
  }));
}

const CONTRACT_SELECT = `
  SELECT c.id, c.project_id, c.seq, c.source, CONVERT(char(10), c.start_date, 23) AS start_date, CONVERT(char(10), c.end_date, 23) AS end_date,
         c.years, c.visits_per_year, c.visits_total, c.contact_name, c.contact_phone, c.note, c.cancelled_at, c.cancel_reason,
         c.created_at, u.full_name AS created_by_name,
         p.code AS project_code, p.name AS project_name, cust.name AS customer_name, p.location, p.latitude, p.longitude,
         (SELECT COUNT(*) FROM b2b_om_visits v WHERE v.contract_id = c.id AND v.status IN ('done', 'skipped')) AS used,
         (SELECT CONVERT(char(10), MIN(COALESCE(v.scheduled_date, v.due_date)), 23) FROM b2b_om_visits v
           WHERE v.contract_id = c.id AND v.status IN ('planned', 'scheduled')) AS next_due
  FROM b2b_om_contracts c
  JOIN b2b_projects p ON p.id = c.project_id
  JOIN b2b_customers cust ON cust.id = p.customer_id
  LEFT JOIN users u ON u.id = c.created_by`;

function toContract(r: Record<string, unknown>): B2bOmContract {
  const used = Number(r.used);
  const status: B2bOmContract["status"] = r.cancelled_at ? "cancelled" : used >= Number(r.visits_total) ? "ended" : "active";
  return {
    id: r.id as number, project_id: r.project_id as number, seq: r.seq as number, source: r.source as B2bOmContract["source"],
    start_date: r.start_date as string, end_date: r.end_date as string, years: r.years as number,
    visits_per_year: r.visits_per_year as number, visits_total: r.visits_total as number,
    contact_name: (r.contact_name as string) ?? null, contact_phone: (r.contact_phone as string) ?? null, note: (r.note as string) ?? null,
    cancelled_at: (r.cancelled_at as string) ?? null, cancel_reason: (r.cancel_reason as string) ?? null,
    created_at: r.created_at as string, created_by_name: (r.created_by_name as string) ?? null,
    project_code: r.project_code as string, project_name: r.project_name as string, customer_name: r.customer_name as string,
    location: (r.location as string) ?? null, latitude: num(r.latitude), longitude: num(r.longitude),
    used, next_due: (r.next_due as string) ?? null, status,
  };
}

export async function listContracts(db: Queryable): Promise<B2bOmContract[]> {
  const r = await db.request().query(`${CONTRACT_SELECT} ORDER BY CASE WHEN c.cancelled_at IS NULL THEN 0 ELSE 1 END, c.end_date, c.id`);
  return r.recordset.map(toContract);
}

export async function loadContract(db: Queryable, id: number): Promise<B2bOmContractDetail | null> {
  const r = await db.request().input("id", sql.Int, id).query(`${CONTRACT_SELECT} WHERE c.id = @id`);
  if (!r.recordset[0]) return null;
  const [visits, acts] = await Promise.all([
    db.request().input("id", sql.Int, id).query(`SELECT ${VISIT_COLS} FROM b2b_om_visits v ${VISIT_JOINS} WHERE v.contract_id = @id ORDER BY v.seq_no`),
    db.request().input("id", sql.Int, id).query(`
      SELECT TOP 300 a.id, a.visit_id, a.kind, a.message, a.created_at, u.full_name AS created_by_name
      FROM b2b_om_activities a LEFT JOIN users u ON u.id = a.created_by
      WHERE a.contract_id = @id ORDER BY a.created_at DESC, a.id DESC`),
  ]);
  return { ...toContract(r.recordset[0]), visits: visits.recordset.map(toVisit), activities: acts.recordset };
}

export async function logOm(db: Queryable, contractId: number, visitId: number | null, kind: string, message: string, userId: number | null) {
  await db.request().input("c", sql.Int, contractId).input("v", sql.Int, visitId).input("k", sql.VarChar(30), kind)
    .input("m", sql.NVarChar(1000), message.slice(0, 1000)).input("u", sql.Int, userId)
    .query(`INSERT INTO b2b_om_activities (contract_id, visit_id, kind, message, created_by) VALUES (@c, @v, @k, @m, @u)`);
}

/** สร้างสัญญา O&M + ตารางเข้างานทั้งสัญญา (เรียกใน transaction ตอนปิดโครงการ · หรือกดสร้างเองที่หน้าโครงการ)
 *  ค่าตั้งต้น: ปี/ครั้งต่อปีจากใบที่ได้งาน (เก็บที่โครงการ) · เริ่ม = วันส่งมอบ (milestone) · ผู้ประสานงาน = ผู้ติดต่อของโครงการ
 *  ใบไม่มี O&M (0 ปี / 0 ครั้ง) หรือมีสัญญาแล้ว → ไม่สร้าง (คืน null) */
export async function createOmContract(
  db: Queryable, projectId: number, userId: number | null,
  override?: { years: number; visits_per_year: number; start_date: string },
): Promise<number | null> {
  const p = (await db.request().input("p", sql.Int, projectId).query(`
    SELECT p.om_years, p.om_visits_per_year, p.contact_name, p.contact_phone,
           (SELECT CONVERT(char(10), m.done_date, 23) FROM b2b_project_milestones m WHERE m.project_id = p.id AND m.kind = 'handover') AS handover_date,
           (SELECT COUNT(*) FROM b2b_om_contracts c WHERE c.project_id = p.id) AS contracts
    FROM b2b_projects p WHERE p.id = @p`)).recordset[0];
  if (!p || p.contracts > 0) return null;
  const years = override?.years ?? Number(p.om_years ?? 0);
  const perYear = override?.visits_per_year ?? Number(p.om_visits_per_year ?? 0);
  if (!(years > 0 && perYear > 0)) return null;
  const start = override?.start_date ?? p.handover_date ?? new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const end = addMonthsIso(start, years * 12);
  const dues = visitDueDates(start, years, perYear);
  const c = (await db.request().input("p", sql.Int, projectId).input("s", sql.Date, start).input("e", sql.Date, end)
    .input("y", sql.Int, years).input("v", sql.Int, perYear).input("t", sql.Int, dues.length)
    .input("cn", sql.NVarChar(200), p.contact_name).input("cp", sql.NVarChar(50), p.contact_phone).input("u", sql.Int, userId)
    .query(`INSERT INTO b2b_om_contracts (project_id, seq, source, start_date, end_date, years, visits_per_year, visits_total, contact_name, contact_phone, created_by, updated_by)
            OUTPUT INSERTED.id VALUES (@p, 1, 'project', @s, @e, @y, @v, @t, @cn, @cp, @u, @u)`)).recordset[0].id as number;
  for (const [i, d] of dues.entries()) {
    await db.request().input("c", sql.Int, c).input("p", sql.Int, projectId).input("n", sql.Int, i + 1).input("d", sql.Date, d)
      .query(`INSERT INTO b2b_om_visits (contract_id, project_id, seq_no, due_date) VALUES (@c, @p, @n, @d)`);
  }
  const text = `สัญญา O&M ${years} ปี ปีละ ${perYear} ครั้ง (รวม ${dues.length} ครั้ง) · ${thaiDateShort(start)} – ${thaiDateShort(end)}`;
  await logOm(db, c, null, "created", `สร้าง${text}${override ? "" : " — จากใบที่ได้งาน เริ่มนับวันส่งมอบ"}`, userId);
  await logActivity(db, projectId, "om_contract", { message: `สร้าง${text}`, userId });
  return c;
}
