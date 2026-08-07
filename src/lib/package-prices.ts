import { getDb, sql } from "@/lib/db";

/**
 * สลับช่วงราคาที่ใช้งานให้อัตโนมัติตามวันที่ — ไม่ต้องรอให้ใครมากดเอง
 *
 * ช่วงราคาที่ "ครอบวันนี้" (start_date <= วันนี้ <= expire_date) จะถูกตั้งเป็น
 * is_active = 1 ส่วนช่วงอื่นของ package เดียวกันถูกปิด แล้ว mirror ราคาไปที่
 * packages.price/monthly_installment/monthly_saving/start_date/expire_date
 * เพื่อให้โค้ดเดิมที่อ่าน packages.price (ใบเสนอราคา, dropdown, dashboard, PDF)
 * เห็นราคาที่ถูกต้องทันทีโดยไม่ต้องแก้อะไร
 *
 * ถ้าไม่มีช่วงไหนครอบวันนี้เลย (เช่นช่วงเดิมหมดอายุแล้วยังไม่ตั้งช่วงใหม่) จะไม่แตะ
 * ของเดิม — ปล่อยให้ราคาปัจจุบันค้างไว้ดีกว่าทำให้ package หายไปจากระบบ
 *
 * ปลอดภัยต่อการเรียกซ้ำ: ทำงานเป็น transaction เดียว ปิดก่อนเปิดเสมอ (ไม่ให้ชน
 * filtered unique index UX_ppp_one_active) และ throttle ไว้ไม่ให้ยิงถี่เกินจำเป็น
 */
let lastSyncAt = 0;
const THROTTLE_MS = 60_000;

export async function syncActivePricePeriods(options?: { force?: boolean }) {
  const now = Date.now();
  if (!options?.force && now - lastSyncAt < THROTTLE_MS) return;
  lastSyncAt = now;

  const db = await getDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    // ตารางอาจยังไม่มี (prod ที่ยังไม่ได้รัน migration 141) — ให้เงียบไว้
    const exists = await new sql.Request(tx).query(
      `SELECT CASE WHEN OBJECT_ID('package_price_periods','U') IS NULL THEN 0 ELSE 1 END has_table`,
    );
    if (!exists.recordset[0]?.has_table) {
      await tx.commit();
      return;
    }

    // ช่วงที่ควรใช้งานวันนี้ของแต่ละ package — ถ้าซ้อนทับกันเอาอันที่เริ่มทีหลังสุด
    const currentCte = `
      WITH cur AS (
        SELECT id, package_id,
               ROW_NUMBER() OVER (PARTITION BY package_id ORDER BY start_date DESC, id DESC) rn
        FROM package_price_periods
        WHERE (start_date  IS NULL OR start_date  <= CAST(GETDATE() AS DATE))
          AND (expire_date IS NULL OR expire_date >= CAST(GETDATE() AS DATE))
      )`;

    // ปิดก่อน แล้วค่อยเปิด — สลับทางกันจะชน unique index
    await new sql.Request(tx).query(`${currentCte}
      UPDATE ppp SET is_active = 0
      FROM package_price_periods ppp
      JOIN cur ON cur.package_id = ppp.package_id AND cur.rn = 1
      WHERE ppp.id <> cur.id AND ppp.is_active = 1`);

    await new sql.Request(tx).query(`${currentCte}
      UPDATE ppp SET is_active = 1
      FROM package_price_periods ppp
      JOIN cur ON cur.id = ppp.id AND cur.rn = 1
      WHERE ppp.is_active = 0`);

    await new sql.Request(tx).query(`
      UPDATE p
      SET p.price = a.price, p.monthly_installment = a.monthly_installment,
          p.monthly_saving = a.monthly_saving, p.start_date = a.start_date, p.expire_date = a.expire_date
      FROM packages p
      JOIN package_price_periods a ON a.package_id = p.id AND a.is_active = 1
      WHERE p.price <> a.price
         OR ISNULL(p.monthly_installment,'') <> ISNULL(a.monthly_installment,'')
         OR ISNULL(p.monthly_saving,-1) <> ISNULL(a.monthly_saving,-1)
         OR ISNULL(p.start_date,'1900-01-01') <> ISNULL(a.start_date,'1900-01-01')
         OR ISNULL(p.expire_date,'1900-01-01') <> ISNULL(a.expire_date,'1900-01-01')`);

    await tx.commit();
  } catch (error) {
    try { await tx.rollback(); } catch { /* ignore */ }
    // ไม่ให้พังทั้งคำขอเพราะ sync ราคา — log ไว้พอ
    console.error("syncActivePricePeriods error:", error);
  }
}

/**
 * ราคาที่จะใช้จริงของ Package หนึ่งใบเสนอราคา
 *
 * ปกติใช้ราคาปัจจุบัน (packages.price = ช่วงที่ Active) แต่ผู้ใช้เลือกช่วงราคาอื่น
 * จาก dropdown ได้ ซึ่งต้องเป็นราคาที่มีอยู่จริงในช่วงราคาของ package นั้นเท่านั้น
 * ถ้าส่งราคามั่วมาให้ตกกลับไปใช้ราคาปัจจุบัน — กันการยิง API ตรงเพื่อกดราคาเอง
 */
export async function resolvePackagePrice(
  request: sql.Request,
  packageId: number | null | undefined,
  requestedPrice: unknown,
  currentPrice: number,
  leadId?: number | null,
): Promise<number> {
  const requested = Number(requestedPrice);
  if (!packageId || !Number.isFinite(requested) || requested <= 0) return currentPrice;
  if (requested === currentPrice) return currentPrice;
  try {
    const found = await request
      .input("ppp_pid", sql.Int, packageId)
      .input("ppp_price", sql.Decimal(12, 2), requested)
      .input("ppp_lead", sql.NVarChar(20), String(Number(leadId) || 0))
      .query(`SELECT TOP 1 1 ok FROM package_price_periods
              WHERE package_id=@ppp_pid AND price=@ppp_price
                AND (is_active = 1
                     OR ',' + REPLACE(ISNULL(allowed_lead_ids,''),' ','') + ',' LIKE '%,' + @ppp_lead + ',%')`);
    return found.recordset.length ? requested : currentPrice;
  } catch {
    return currentPrice;   // ตารางยังไม่มี (ยังไม่ได้รัน migration 141)
  }
}
