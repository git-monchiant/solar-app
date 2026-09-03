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
};

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
  const link = await linkContracts(db);
  // สร้างเจ้าของจาก REM ให้บ้านโอนแล้วที่ยังไม่มีลูกค้า (limit สูงพอสำหรับรอบเดียว)
  const owners = await linkOwnersFromRem(db, 500);
  const grants = await grantOnSale(db);
  return { contractsLinked: link.contracts, unitsLinked: link.units, owners, grantsCreated: grants };
}
