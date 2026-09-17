import { sql } from "@/lib/db";
import { linkOwnersFromRem, type OwnerLinkResult } from "@/lib/om/rem-owner-link";

// เชื่อมทะเบียน REM (staging) กลับเข้าข้อมูลจริง — รันเองหลัง sync ทุกครั้ง
// แก้ปัญหา "บ้านตัวอย่าง/พร้อมขาย ที่ขายทีหลัง" ให้อัตโนมัติ:
//   REM มีสัญญาโอน → เชื่อม rem_contract_id → บ้านโผล่กลับลิสต์เอง (เกณฑ์ "แสดง" = โอนแล้ว)
//   → สร้างเจ้าของจาก REM → ได้ชื่อลูกค้า
// ★ ทุกอย่าง idempotent — รันซ้ำกี่รอบก็ไม่พัง · เชื่อมเฉพาะที่ตรง "สัญญาเดียว" กันเดาผิด
//   (กติกาผู้ใช้ 1 ก.ย.: house_number ใช้ได้เฉพาะภายในโครงการเดียวกัน)

export type ReconcileResult = {
  contractsLinked: number; unitsLinked: number; owners: OwnerLinkResult; grantsCreated: number;
  housesOpened: number; housesCreated: number; installationsCreated: number;
};

// ★ 8 ก.ย. 69 — สาเหตุที่บ้านโอนใหม่ (2569) หลุดจากระบบ 97 หลัง:
//   rem_sync ดึงสัญญาใหม่มาลง staging ได้ แต่ทุกขั้นของ reconcile บังคับ h.is_om = 1
//   ⇒ บ้านที่ยังปิดธง (import ตอนยังไม่ขาย) หรือยังไม่มีในทะเบียน ไม่เคยถูกแตะเลย
//   แก้ด้วย 2 ขั้นใหม่ก่อน linkContracts — เงื่อนไขเดียวกันทั้งคู่: REM มีสัญญาโอน + ของแถมโซลาร์ (ไม่ยกเลิก)
//   และบ้านเลขที่นั้นตรง "สัญญาเดียว" ในโครงการ (กติกาผู้ใช้ 1 ก.ย.: ห้ามเดาข้ามโครงการ)

// เงื่อนไขร่วม: สัญญาโอนที่มีของแถมโซลาร์ และยังไม่ผูกกับ installation ไหน
const SOLD_WITH_SOLAR = `
  SELECT t.contract_id, t.project_id, t.project_name, t.house_number, t.house_number_key, t.unit_id, t.transfer_date
  FROM om_rem_transfers t
  WHERE ISNULL(t.house_number_key, N'') <> N''
    AND EXISTS (SELECT 1 FROM om_rem_promotions p
                WHERE p.contract_id = t.contract_id AND p.is_solar = 1 AND ISNULL(p.is_cancelled, 0) = 0)
    AND NOT EXISTS (SELECT 1 FROM om_installations i WHERE i.rem_contract_id = t.contract_id)
    AND 1 = (SELECT COUNT(DISTINCT t2.contract_id) FROM om_rem_transfers t2
             WHERE t2.project_id = t.project_id AND t2.house_number_key = t.house_number_key)`;

// ขั้น 0a — เปิดธงบ้านที่มีในทะเบียนแต่ is_om = 0 (import ตอนยังไม่ขาย แล้วขายทีหลัง)
// ★ ไม่แตะบ้านที่คนตั้งใจปิด (om_excluded_reason มีค่า — เช่น "ไม่ได้ติดโซลาร์") — คนชนะระบบเสมอ
async function openSoldHouses(db: sql.ConnectionPool): Promise<number> {
  const r = await db.request().query(`
    ;WITH s AS (${SOLD_WITH_SOLAR}),
    tgt AS (
      SELECT h.id
      FROM om_houses h JOIN s ON s.project_id = h.project_id
        AND s.house_number_key = REPLACE(h.house_number, N' ', N'') COLLATE Latin1_General_BIN2
      WHERE ISNULL(h.is_om, 0) = 0 AND h.segment = 'house' AND h.om_excluded_reason IS NULL
      GROUP BY h.id HAVING COUNT(DISTINCT s.contract_id) = 1)
    UPDATE h SET h.is_om = 1, h.has_solar = 1,
                 h.project_map_source = ISNULL(h.project_map_source, N'rem_reconcile'),
                 h.note = LEFT(CONCAT(ISNULL(h.note, N''), N' [rem_reconcile เปิดเป็นลูกค้า O&M ',
                                      CONVERT(varchar(10), SYSDATETIMEOFFSET(), 23), N' — REM โอนแล้ว+ของแถมโซลาร์]'), 4000),
                 h.updated_at = SYSDATETIMEOFFSET()
    FROM om_houses h JOIN tgt ON tgt.id = h.id;
    SELECT @@ROWCOUNT n;`);
  return r.recordset[0].n as number;
}

// ขั้น 0a' — บ้านที่เป็นลูกค้า O&M แล้วแต่ "ไม่มีแถว installation" (บ้านที่ import ตอนยังไม่ขาย ไม่เคยมีระบบ)
// ★ เจอตอนรันจริง 8 ก.ย.: เปิดธง 78 หลังแล้ว แต่ linkContracts/grantOnSale เห็นแค่ผ่าน om_installations
//   ⇒ ไม่มีแถวให้ผูกสัญญา = contractsLinked 0 · สิทธิ์ 0 · ต้องสร้าง installation ให้ก่อน
async function ensureInstallations(db: sql.ConnectionPool): Promise<number> {
  const r = await db.request().query(`
    ;WITH s AS (${SOLD_WITH_SOLAR}),
    tgt AS (
      SELECT h.id house_id, MIN(s.contract_id) contract_id, MIN(s.transfer_date) transfer_date
      FROM om_houses h JOIN s ON s.project_id = h.project_id
        AND s.house_number_key = REPLACE(h.house_number, N' ', N'') COLLATE Latin1_General_BIN2
      WHERE h.is_om = 1 AND h.segment = 'house'
        AND NOT EXISTS (SELECT 1 FROM om_installations i WHERE i.house_id = h.id)
      GROUP BY h.id HAVING COUNT(DISTINCT s.contract_id) = 1)
    INSERT INTO om_installations (house_id, rem_contract_id, rem_transfer_date, rem_contract_status, rem_checked_at, note)
    SELECT house_id, contract_id, transfer_date, N'transferred', SYSDATETIMEOFFSET(),
           N'สร้างอัตโนมัติจาก REM (rem_reconcile) — บ้านเดิมไม่มีแถวระบบ'
    FROM tgt;
    SELECT @@ROWCOUNT n;`);
  return r.recordset[0].n as number;
}

// ขั้น 0b — สร้างบ้าน + installation ให้สัญญาที่ไม่มีบ้านในทะเบียนเลย
// ★ ทำทีละแถวในทรานแซกชันเดียว เพราะต้องได้ house.id ไปใส่ installation · ทุกแถวติด source_batch_id ให้ตามรอย/ถอนได้
async function createHousesFromRem(db: sql.ConnectionPool): Promise<number> {
  const pick = await db.request().query(`
    ;WITH s AS (${SOLD_WITH_SOLAR})
    SELECT s.*, pj.name_th
    FROM s JOIN om_projects pj ON pj.project_id = s.project_id AND pj.project_type = 'H' AND ISNULL(pj.is_demo, 0) = 0
    WHERE NOT EXISTS (SELECT 1 FROM om_houses h WHERE h.project_id = s.project_id
                      AND REPLACE(h.house_number, N' ', N'') COLLATE Latin1_General_BIN2 = s.house_number_key)`);
  const rows = pick.recordset as {
    contract_id: string; project_id: string; project_name: string | null; house_number: string;
    unit_id: string | null; transfer_date: Date | null; name_th: string | null;
  }[];
  if (!rows.length) return 0;

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const b = await new sql.Request(tx)
      .input("f", sql.NVarChar(200), "REM om_rem_transfers (rem_reconcile)")
      .input("n", sql.NVarChar(400), "สร้างบ้านอัตโนมัติ — REM โอนแล้ว + ของแถมโซลาร์ แต่ไม่มีในทะเบียน")
      .input("c", sql.Int, rows.length)
      .query(`INSERT INTO om_import_batches (source_file, note, row_count) OUTPUT INSERTED.id VALUES (@f, @n, @c)`);
    const batchId = b.recordset[0].id as number;

    for (const x of rows) {
      const h = await new sql.Request(tx)
        .input("hn", sql.NVarChar(100), x.house_number)
        .input("p", sql.NVarChar(20), x.project_id)
        .input("pn", sql.NVarChar(300), x.name_th ?? x.project_name ?? null)
        .input("u", sql.NVarChar(100), x.unit_id)
        .input("b", sql.Int, batchId)
        .input("nt", sql.NVarChar(400), `สร้างอัตโนมัติจาก REM (rem_reconcile) — สัญญา ${x.contract_id}`)
        .query(`INSERT INTO om_houses (segment, house_number, project_id, project_name, rem_unit_id,
                                       has_solar, is_om, is_vip, project_map_source, source_batch_id, note)
                OUTPUT INSERTED.id
                VALUES ('house', @hn, @p, @pn, @u, 1, 1, 0, N'rem_reconcile', @b, @nt)`);
      const houseId = h.recordset[0].id as number;
      await new sql.Request(tx)
        .input("h", sql.Int, houseId).input("ct", sql.NVarChar(80), x.contract_id)
        .input("td", sql.DateTimeOffset, x.transfer_date).input("b", sql.Int, batchId)
        .query(`INSERT INTO om_installations (house_id, rem_contract_id, rem_transfer_date, rem_contract_status,
                                              rem_checked_at, source_batch_id, note)
                VALUES (@h, @ct, @td, N'transferred', SYSDATETIMEOFFSET(), @b,
                        N'สร้างอัตโนมัติจาก REM (rem_reconcile)')`);
    }
    await tx.commit();
    return rows.length;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ขั้น 1 — เชื่อม rem_contract_id + rem_transfer_date + rem_unit_id ให้บ้านที่ตรงสัญญาเดียว
async function linkContracts(db: sql.ConnectionPool): Promise<{ contracts: number; units: number }> {
  const r = await db.request().query(`
    -- installation ที่ยังไม่มีเลขสัญญา แต่บ้านตรง "สัญญาเดียว" ในทะเบียน REM
    ;WITH one AS (
      SELECT i.id inst_id,
             MIN(t.contract_id) contract_id, MIN(t.transfer_date) td
      FROM om_houses h JOIN om_installations i ON i.house_id = h.id
      JOIN om_rem_transfers t ON t.project_id = h.project_id
        AND t.house_number_key = REPLACE(h.house_number, N' ', N'') COLLATE Latin1_General_BIN2
      WHERE h.is_om = 1 AND i.rem_contract_id IS NULL
      GROUP BY i.id HAVING COUNT(DISTINCT t.contract_id) = 1)
    UPDATE i SET i.rem_contract_id = o.contract_id, i.rem_transfer_date = o.td,
                 i.rem_contract_status = N'transferred', i.rem_checked_at = SYSDATETIMEOFFSET(),
                 i.updated_at = SYSDATETIMEOFFSET()
    FROM om_installations i JOIN one o ON o.inst_id = i.id;
    SELECT @@ROWCOUNT c;

    -- เติม rem_unit_id ให้บ้านที่ตรง unit เดียว
    ;WITH oneu AS (
      SELECT h.id house_id, MIN(u.unit_id) unit_id
      FROM om_houses h JOIN om_rem_units u ON u.project_id = h.project_id
        AND u.house_number_key = REPLACE(h.house_number, N' ', N'') COLLATE Latin1_General_BIN2
      WHERE h.is_om = 1 AND h.rem_unit_id IS NULL
      GROUP BY h.id HAVING COUNT(DISTINCT u.unit_id) = 1)
    UPDATE h SET h.rem_unit_id = o.unit_id, h.updated_at = SYSDATETIMEOFFSET()
    FROM om_houses h JOIN oneu o ON o.house_id = h.id;
    SELECT @@ROWCOUNT u;`);
  const rs = r.recordsets as sql.IRecordSet<Record<string, number>>[];
  return { contracts: rs[0][0].c, units: rs[1][0].u };
}

// ขั้น 3 — สร้างสิทธิ์ล้างแผงตอนบ้านขายจริง
// ★ บ้านยังไม่ขายถูกคลีนสิทธิ์ออก (unit เปล่า) · พอมีสัญญาโอน + โปรฯ บอกจำนวนปี O&M → ให้สิทธิ์
//   จำนวน = ปีสัญญา O&M × 2 ครั้ง/ปี (ตามที่ข้อมูลนำเข้าใช้: 2 ปี → 4 ครั้ง)
//   ★ ไม่มีข้อมูลปี O&M = ไม่ให้ (รอ business) — ไม่เดา
async function grantOnSale(db: sql.ConnectionPool): Promise<number> {
  const r = await db.request().query(`
    ;WITH need AS (
      SELECT i.id inst_id, MAX(pr.om_years) yrs
      FROM om_houses h JOIN om_installations i ON i.house_id = h.id
      JOIN om_rem_promotions pr ON pr.contract_id = i.rem_contract_id
      WHERE h.is_om = 1 AND i.rem_contract_id IS NOT NULL
        AND pr.is_solar = 1 AND pr.is_cancelled = 0 AND pr.om_years IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM om_entitlement_grants g WHERE g.installation_id = i.id)
      GROUP BY i.id)
    INSERT INTO om_entitlement_grants (installation_id, qty, source, contract_term, reason)
    SELECT inst_id, yrs * 2, 'contract_base', CAST(yrs AS varchar(10)), N'ให้สิทธิ์อัตโนมัติตอนขาย (จากปี O&M ในโปรฯ)'
    FROM need;
    SELECT @@ROWCOUNT n;`);
  return r.recordset[0].n as number;
}

export async function reconcileRemLinks(db: sql.ConnectionPool): Promise<ReconcileResult> {
  // ★ ต้องมาก่อน — เปิด/สร้างบ้านให้เป็น is_om=1 เสียก่อน ขั้นถัดไปถึงจะเห็น
  const housesOpened = await openSoldHouses(db);
  const installationsCreated = await ensureInstallations(db);   // ★ หลังเปิดธง ก่อนผูกสัญญา
  const housesCreated = await createHousesFromRem(db);
  const link = await linkContracts(db);
  // สร้างเจ้าของจาก REM ให้บ้านโอนแล้วที่ยังไม่มีลูกค้า (limit สูงพอสำหรับรอบเดียว)
  const owners = await linkOwnersFromRem(db, 500);
  const grants = await grantOnSale(db);
  return { contractsLinked: link.contracts, unitsLinked: link.units, owners, grantsCreated: grants,
           housesOpened, housesCreated, installationsCreated };
}
