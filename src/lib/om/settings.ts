import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// ค่าตั้งของโมดูล O&M — เก็บใน om_settings แก้ได้จากหน้าเว็บ ไม่ต้อง deploy
// ★ ห้ามฝังตัวเลข/เงื่อนไขพวกนี้ในโค้ด (ผู้ใช้เคาะ 31 ส.ค.: ทุกกติกาต้องเป็น config)

export interface OmSetting {
  key: string;
  value: unknown;          // parse แล้ว — number | boolean | object | null
  label_th: string;
  group_key: string;
  pending_biz: boolean;    // ★ ยังรอ business ตอบ — หน้าแอดมินต้องขึ้นธงเตือน
  note: string | null;
  sort_order: number;
}

// ค่าที่ใช้เมื่อ DB ยังไม่มีค่า (เช่นเพิ่ง migrate หรือรอ business)
// ★ ค่ารอ business ตั้งเป็นแบบผ่อนปรนที่สุด — ไม่ตัดสิทธิ์ ไม่บล็อกลูกค้า
const FALLBACK: Record<string, unknown> = {
  "booking.slot_per_team": 2,
  "booking.advance_days_max": 60,
  "booking.advance_hours_min": 24,
  "reschedule.by_customer": true,
  "reschedule.max_times": 2,
  "reschedule.min_hours_before": 24,
  "reschedule.reset_to_pending": true,
  "reschedule.unassign_team": true,
  "reschedule.notify_line": true,
  "cancel.min_hours_before": 0,      // 0 = ยกเลิกได้ตลอด (รอ business)
  "cancel.refund_quota": false,      // ตัดสิทธิ์ตอนปิดงาน จึงยังไม่มีอะไรต้องคืน
  "noshow.consume_quota": false,     // ไม่ตัดสิทธิ์ (รอ business)
};

const parse = (raw: string | null): unknown => {
  if (raw == null || raw === "") return null;
  try { return JSON.parse(raw); } catch { return raw; }   // scalar ที่ไม่ใช่ JSON เก็บเป็น string
};

/** อ่านค่าเดียว — คืน fallback ถ้ายังไม่ได้ตั้ง */
export async function getSetting<T = unknown>(key: string): Promise<T> {
  const db = await getOmDb();
  const r = await db.request().input("k", sql.NVarChar(80), key)
    .query(`SELECT value_json FROM om_settings WHERE [key] = @k COLLATE Latin1_General_BIN2`);
  const v = parse(r.recordset[0]?.value_json ?? null);
  return (v ?? FALLBACK[key] ?? null) as T;
}

/** อ่านทีเดียวทั้งกลุ่ม — ใช้ตอนตรวจกติกาหลายข้อพร้อมกัน จะได้ไม่ยิง DB หลายรอบ */
export async function getSettings(prefix?: string): Promise<Record<string, unknown>> {
  const db = await getOmDb();
  const r = await db.request().input("p", sql.NVarChar(40), prefix ? prefix + "%" : "%")
    .query(`SELECT [key], value_json FROM om_settings WHERE [key] LIKE @p`);
  const out: Record<string, unknown> = { ...FALLBACK };
  for (const x of r.recordset) {
    const v = parse(x.value_json);
    if (v !== null) out[x.key] = v;
  }
  return out;
}

/** รายการเต็มสำหรับหน้าตั้งค่า (รวมป้าย/กลุ่ม/ธงรอ business) */
export async function listSettings(): Promise<OmSetting[]> {
  const db = await getOmDb();
  const r = await db.request().query(
    `SELECT [key], value_json, label_th, group_key, pending_biz, note, sort_order
     FROM om_settings ORDER BY sort_order, [key]`);
  return r.recordset.map((x) => ({
    key: x.key, value: parse(x.value_json), label_th: x.label_th,
    group_key: x.group_key, pending_biz: !!x.pending_biz, note: x.note, sort_order: x.sort_order,
  }));
}

/** คีย์ที่ยังรอ business ตอบ — เอาไปขึ้นธงเตือนในหน้าแอดมิน */
export async function pendingBizKeys(): Promise<string[]> {
  const db = await getOmDb();
  const r = await db.request().query(
    `SELECT [key] FROM om_settings WHERE pending_biz = 1 AND value_json IS NULL ORDER BY sort_order`);
  return r.recordset.map((x) => x.key as string);
}
