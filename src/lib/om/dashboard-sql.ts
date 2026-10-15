// คิวรีของหน้าภาพรวม O&M ที่ใช้ร่วมกันระหว่าง "ตัวเลข" (/api/om/dashboard) กับ "รายชื่อหลังตัวเลข" (/api/om/dashboard/rows)
// ★ แผน 20261015-02: กดตัวเลขแล้วเปิดหน้าต่างรายชื่อ — จำนวนแถวต้องเท่ากับตัวเลขที่กดเสมอ (กติกา ui-rules)
//   ⇒ นิยามอยู่ที่เดียว ห้ามเขียนเกณฑ์ขึ้นใหม่ในแต่ละ route (บทเรียน badge เกินจริง 190 หลัง — follow-sql.ts)
// ★ ฝั่ง server เท่านั้น
import { fixDates, sql } from "@/lib/db";
import { DUE_WASH_SQL, isCleaning } from "@/lib/om/entitlement";
import { OM_PAY_LIVE_SQL } from "@/lib/om/om-quotation";

/** บ้านในความดูแล = บ้าน O&M ที่มีระบบติดตั้งแล้ว (alias บ้านชื่อ h) — การ์ด "บ้านในความดูแล" */
export const OM_CARED_HOUSE_SQL = `h.is_om = 1 AND EXISTS (SELECT 1 FROM om_installations i WHERE i.house_id = h.id)`;

/** เคยล้างอย่างน้อย 1 ครั้ง — คู่ตรงข้ามของ "ไม่เคยล้างเลย" ในการ์ดทะเบียนบ้าน (alias บ้านชื่อ h) */
export const EVER_WASHED_SQL = `EXISTS (
        SELECT 1 FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id
         WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isCleaning("rd")})`;

/** สิทธิ์ล้างที่ให้ไว้ / ใช้ไป ของบ้าน h — ชุดเดียวกับการ์ดสิทธิ์ (⑥ ของ /api/om/dashboard) */
export const HOUSE_GRANTED_SQL = `(SELECT ISNULL(SUM(g.qty), 0) FROM om_entitlement_grants g
             JOIN om_installations i ON i.id = g.installation_id
            WHERE i.house_id = h.id AND ${isCleaning("g")})`;
export const HOUSE_USED_SQL = `(SELECT COUNT(*) FROM om_redemptions rd
             JOIN om_installations i ON i.id = rd.installation_id
            WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isCleaning("rd")})`;

/** คอลัมน์บอกตัวบ้านต่อแถว (ลูกค้า · เบอร์ · โครงการ · ล้างล่าสุด) — สูตรเดียวกับ #due ใน follow-sql.ts
 *  ต้อง LEFT JOIN om_projects pj ON pj.project_id = h.project_id ไว้แล้ว */
export const HOUSE_INFO_COLS = `h.id house_id, h.house_number, h.project_id,
           ISNULL(pj.name_th, h.project_name) project_name,
           (SELECT TOP 1 c.full_name FROM om_house_customers hc JOIN om_customers c ON c.id = hc.customer_id
             WHERE hc.house_id = h.id AND hc.is_current = 1
             ORDER BY CASE hc.role WHEN 'owner' THEN 0 ELSE 1 END, hc.id) customer_name,
           (SELECT TOP 1 p.phone FROM om_house_customers hc
             JOIN om_customer_phones p ON p.customer_id = hc.customer_id
            WHERE hc.house_id = h.id AND hc.is_current = 1 AND p.status <> 'invalid'
            ORDER BY p.is_primary DESC, p.id) phone,
           (SELECT CONVERT(char(10), MAX(rd.service_date), 23) FROM om_redemptions rd
             JOIN om_installations i ON i.id = rd.installation_id
            WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isCleaning("rd")}) last_wash`;

export { DUE_WASH_SQL };

/** วันที่ (YYYY-MM-DD) ตามเวลาไทย — ช่วงวันที่ของหน้าภาพรวมเป็นวันไทยเสมอ */
export const bkkDay = (v: unknown) =>
  v ? new Date(String(v)).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }) : null;

export type OmQuoteMoney = {
  quotation_id: number; doc_no: string | null; package_name: string | null; plan_type: string | null;
  booking_id: number; job_status: string | null; house_id: number; house_number: string | null;
  project_name: string | null; customer_name: string | null; phone: string | null;
  total: number; received: number; outstanding: number;
  /** วันที่ลูกค้ารับใบ (ส่งให้ทีมขาย · ไม่มีใช้วันอนุมัติ) — ใช้ตัดช่วงวันที่ */
  at: string | null; paid_at: string | null;
};

/**
 * ใบเสนอราคา O&M + เงินที่รับแล้ว — ★ ชุดเดียวกับหน้ารายรับ O&M (/api/om/report/payments)
 *   1 แถว = ใบที่ส่งลูกค้าแล้ว หรือมีเงินผูกอยู่ · เงินนับเฉพาะ Account ยืนยันแล้ว · เช็คเด้งไม่นับ
 *   แก้เกณฑ์ที่นี่ต้องตามไปแก้หน้ารายรับด้วย (และกลับกัน) ไม่งั้นการ์ดกับรายงานตัวเลขไม่ตรงกัน
 * ★ ใบงานที่ยกเลิกแล้วตัดทิ้ง — ลูกค้าไม่เอาแล้ว ไม่ใช่มูลค่างาน/ไม่ใช่เงินค้างรับ
 */
export async function loadOmQuoteMoney(db: sql.ConnectionPool): Promise<OmQuoteMoney[]> {
  const r = await db.request().query(`
    SELECT q.id quotation_id, q.doc_no, q.package_name_snapshot package_name, omp.plan_type,
           q.contract_total_incl_vat total,
           CONVERT(varchar(33), COALESCE(q.sent_to_customer_at, q.approved_at), 126) at,
           b.id booking_id, b.status job_status, b.house_id, h.house_number,
           COALESCE(pj.name_th, h.project_name) project_name, l.full_name customer_name, l.phone,
           (SELECT ISNULL(SUM(p.amount), 0) FROM payments p
             WHERE p.lead_id = q.lead_id AND p.slip_field = CONCAT(N'om_quote_', q.id)
               AND p.confirmed_at IS NOT NULL AND ${OM_PAY_LIVE_SQL("p")}) received,
           (SELECT CONVERT(varchar(33), MIN(p.confirmed_at), 126) FROM payments p
             WHERE p.lead_id = q.lead_id AND p.slip_field = CONCAT(N'om_quote_', q.id)
               AND p.confirmed_at IS NOT NULL AND ${OM_PAY_LIVE_SQL("p")}) paid_at
      FROM quotations q
      JOIN om_bookings b ON b.id = q.om_booking_id
      JOIN om_houses h ON h.id = b.house_id
      LEFT JOIN om_projects pj ON pj.project_id = h.project_id
      JOIN leads l ON l.id = q.lead_id
      LEFT JOIN om_packages omp ON omp.id = q.om_package_id
     WHERE q.om_booking_id IS NOT NULL
       AND b.status <> 'cancelled'
       AND (q.sent_to_customer_at IS NOT NULL
            OR EXISTS (SELECT 1 FROM payments p WHERE p.lead_id = q.lead_id AND p.slip_field = CONCAT(N'om_quote_', q.id)))
     ORDER BY COALESCE(q.sent_to_customer_at, q.approved_at) DESC, q.id DESC;`);
  return fixDates(r.recordset).map((x) => {
    const total = Number(x.total || 0), received = Number(x.received || 0);
    return {
      ...(x as unknown as OmQuoteMoney),
      total, received, outstanding: Math.max(0, total - received),
      at: bkkDay(x.at), paid_at: bkkDay(x.paid_at),
    };
  });
}

/** role ที่เห็นการ์ดมูลค่างาน O&M + รายชื่อเงินบนหน้าภาพรวม
 *  ตั้งต้นจากชุดของหน้ารายรับ O&M (admin · account · sales_sup · solar_sup)
 *  ★ 15 ต.ค. 69 ผู้ใช้สั่งเพิ่ม sales (ทีมขายเห็นด้วย) · solar ไม่ต้อง
 *    ใช้กับหน้าภาพรวมเท่านั้น — หน้ารายรับ O&M (/api/om/report/payments) ยังเป็นชุดเดิม ไม่ได้ขยายตาม */
export const OM_MONEY_ROLES = ["admin", "account", "sales_sup", "solar_sup", "sales"] as const;

/** ช่วงวันที่ของหน้าภาพรวม — YYYY-MM-DD ที่ถูกรูปแบบเท่านั้น · ไม่ส่ง = 12 เดือนล่าสุด (1 ของเดือนที่ 11 ก่อนหน้า → วันนี้)
 *  กราฟงานล้างแสดงได้ไม่เกิน 24 เดือน — ช่วงยาวกว่านั้นตัดเหลือ 24 เดือนท้าย (from ขยับตาม) */
export function dashRange(u: URLSearchParams) {
  const ok = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const [ty, tm] = today.split("-").map(Number);
  const ymOf = (y: number, m: number) => {
    const x = new Date(Date.UTC(y, m - 1, 1));
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  let to = ok(u.get("to")) ?? today;
  let from = ok(u.get("from")) ?? `${ymOf(ty, tm - 11)}-01`;
  if (from > to) [from, to] = [to, from];
  // ไม่มีข้อมูลอนาคต — ถึงวันเลยวันนี้ ตัดเหลือวันนี้ (ไม่งั้นการตัด 24 เดือนนับจากปลายทางไกล ๆ ทิ้งข้อมูลจริงหมด)
  if (to > today) to = today;
  if (from > to) from = to;
  const [fy, fm] = from.split("-").map(Number);
  const [ey, em] = to.split("-").map(Number);
  let months = Array.from({ length: (ey - fy) * 12 + (em - fm) + 1 }, (_, i) => ymOf(fy, fm + i));
  if (months.length > 24) {
    months = months.slice(-24);
    from = `${months[0]}-01`;
  }
  return { from, to, months, today };
}

/** แถวที่อยู่ในช่วงวันที่ (เทียบเป็นวันไทย YYYY-MM-DD) */
export const inRange = (d: string | null, from: string, to: string) => !!d && d >= from && d <= to;
