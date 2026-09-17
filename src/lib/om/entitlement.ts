import { sql } from "@/lib/db";

// สิทธิ์แบบนับครั้ง — ผูกกับ "ประเภทงาน" ตั้งแต่ 9 ก.ย. 69 (เผื่อขายแพ็คตรวจเช็ก/งานอื่นเป็นครั้ง)
// เดิมทุกใบเป็นล้างแผงโดยปริยาย · ตอนนี้ทั้ง om_entitlement_grants และ om_redemptions มี service_type_id
// ★ NULL = ล้างแผง — แถวเก่าเติมค่าจริงไปหมดแล้ว แต่ยังกัน NULL ไว้เผื่อโค้ดที่ insert ไม่ระบุชนิด
// ★ "รอบ" กับ "สิทธิ์" คนละเรื่อง: สิทธิ์บอกทำได้กี่ครั้ง · รอบ (cycle_months) บอกควรทำทุกกี่เดือน
//   ล้างแผงมีทั้งคู่ · ซ่อมมีแต่สิทธิ์ไม่มีรอบ — ทั้งสองค่าอยู่ที่ om_service_type เพิ่มชนิดใหม่ที่ DB ได้เลย

export const CLEANING_CODE = "cleaning";

/** id ของ "ล้างแผง" ในรูป SQL — ใช้ในวิว/คิวรีที่ประกาศตัวแปรไม่ได้ */
export const CLEANING_ID_SQL = `(SELECT TOP 1 id FROM om_service_type WHERE code = N'${CLEANING_CODE}')`;

/** รอบล้างแผงเป็นเดือน — ผู้ใช้เคาะ 6 เดือน (2 ครั้ง/ปี) · ไม่ตั้งค่า = ถือว่า 12 */
export const CLEANING_CYCLE_SQL = `ISNULL((SELECT TOP 1 cycle_months FROM om_service_type WHERE code = N'${CLEANING_CODE}'), 12)`;

/** เงื่อนไข "แถวนี้เป็นของล้างแผง" — alias คือ om_entitlement_grants หรือ om_redemptions */
export const isCleaning = (alias: string) =>
  `(ISNULL(${alias}.service_type_id, ${CLEANING_ID_SQL}) = ${CLEANING_ID_SQL})`;

/** ถึงคิวล้าง = ไม่เคยล้าง หรือครบรอบแล้ว — ใช้กับคิวรีที่มี alias บ้านชื่อ h */
export const DUE_WASH_SQL = `NOT EXISTS (
      SELECT 1 FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id
      WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isCleaning("rd")}
        AND DATEADD(month, ${CLEANING_CYCLE_SQL}, rd.service_date) > SYSDATETIMEOFFSET())`;

export type ServiceType = {
  id: number; code: string; label_th: string;
  consumes_quota: boolean; cycle_months: number | null; active: boolean;
};

/** อ่านตารางประเภทงาน (5 แถว) — แคชสั้น ๆ พอกันยิงซ้ำในคำขอเดียว */
let cache: { at: number; rows: ServiceType[] } | null = null;
export async function serviceTypes(db: sql.ConnectionPool): Promise<ServiceType[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.rows;
  const r = await db.request().query(`
    SELECT id, code, label_th, consumes_quota, cycle_months, active
    FROM om_service_type ORDER BY sort_order, id`);
  cache = { at: Date.now(), rows: r.recordset as ServiceType[] };
  return cache.rows;
}

/** ประเภทงานที่จะผูกกับสิทธิ์ — ไม่ระบุ = ล้างแผง · ระบุมาแล้วต้องมีจริงและยังเปิดใช้ */
export async function resolveServiceType(db: sql.ConnectionPool, wanted: unknown): Promise<ServiceType> {
  const rows = await serviceTypes(db);
  const cleaning = rows.find((t) => t.code === CLEANING_CODE);
  if (wanted === undefined || wanted === null || wanted === "") {
    if (!cleaning) throw new Error("ไม่พบประเภทงาน 'ล้างแผง' ในระบบ");
    return cleaning;
  }
  const id = Number(wanted);
  const hit = rows.find((t) => t.id === id);
  if (!hit) throw new Error("ไม่พบประเภทงานนี้");
  if (!hit.active) throw new Error(`ประเภทงาน "${hit.label_th}" ปิดใช้อยู่`);
  return hit;
}
