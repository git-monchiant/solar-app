import { getDb, sql } from "@/lib/db";

export { sql };

// ตาราง b2b_* มีเฉพาะฐานของ v3 — กันโค้ดยิงใส่ solardb (prod) / solardb_dev ของ v2 แบบเดียวกับ getOmDb
export async function getB2bDb(): Promise<sql.ConnectionPool> {
  const name = process.env.DB_NAME || "";
  if (!/v3$/i.test(name)) {
    throw new Error(`B2B module refuses DB "${name}" — DB_NAME ต้องลงท้าย v3`);
  }
  return getDb();
}
