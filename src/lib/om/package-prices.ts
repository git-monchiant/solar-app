import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

/**
 * สลับช่วงราคา Active ของแพ็คเกจ O&M ตามวันที่ — ตรรกะเดียวกับ syncActivePricePeriods
 * ของ Package ฝั่งขาย (src/lib/package-prices.ts) แค่เปลี่ยนตาราง:
 *   ช่วงที่ครอบวันนี้ = Active (ซ้อนกันเอาอันที่เริ่มทีหลังสุด) → mirror ราคาไป om_packages.price
 *   ไม่มีช่วงไหนครอบวันนี้ = ไม่แตะของเดิม (ราคาเดิมค้างไว้ ดีกว่าแพ็คเกจหายไปเฉยๆ)
 */
let lastSyncAt = 0;
const THROTTLE_MS = 60_000;

export async function syncOmPricePeriods(options?: { force?: boolean }) {
  const now = Date.now();
  if (!options?.force && now - lastSyncAt < THROTTLE_MS) return;
  lastSyncAt = now;

  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    const currentCte = `
      WITH cur AS (
        SELECT id, om_package_id,
               ROW_NUMBER() OVER (PARTITION BY om_package_id ORDER BY start_date DESC, id DESC) rn
        FROM om_package_price_periods
        WHERE (start_date  IS NULL OR start_date  <= CAST(GETDATE() AS DATE))
          AND (expire_date IS NULL OR expire_date >= CAST(GETDATE() AS DATE))
      )`;
    // ปิดก่อนแล้วค่อยเปิด — สลับทางกันจะชน UX_om_ppp_one_active
    await new sql.Request(tx).query(`${currentCte}
      UPDATE ppp SET is_active = 0
      FROM om_package_price_periods ppp
      JOIN cur ON cur.om_package_id = ppp.om_package_id AND cur.rn = 1
      WHERE ppp.id <> cur.id AND ppp.is_active = 1`);
    await new sql.Request(tx).query(`${currentCte}
      UPDATE ppp SET is_active = 1
      FROM om_package_price_periods ppp
      JOIN cur ON cur.id = ppp.id AND cur.rn = 1
      WHERE ppp.is_active = 0`);
    await new sql.Request(tx).query(`
      UPDATE p SET p.price = a.price
      FROM om_packages p
      JOIN om_package_price_periods a ON a.om_package_id = p.id AND a.is_active = 1
      WHERE p.price <> a.price`);
    await tx.commit();
  } catch (error) {
    try { await tx.rollback(); } catch { /* ignore */ }
    console.error("syncOmPricePeriods error:", error);
  }
}
