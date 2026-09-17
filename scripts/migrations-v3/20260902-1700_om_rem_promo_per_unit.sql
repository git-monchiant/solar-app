-- ดึงโปรโมชัน "รายหลัง" — เพราะยิงทั้งโครงการแล้ว REM ส่ง promotions มาไม่ครบ
-- พิสูจน์ 2 ก.ย.: โครงการ 70503 ยิงทั้งโครงการได้โปรฯ 9 แถว · ยิงรายหลังได้ 64 แถว (หาย 86%)
--   และโปรฯ โซลาร์ก็หายด้วย — สุ่ม 11 หลังที่ "ทั้งโครงการว่าไม่มีโซลาร์" ยิงรายหลังพบจริง 4 หลัง
-- ⇒ unit/transfer/owner ยังยิงทั้งโครงการได้ (ครบดี เร็ว) แต่ promotions ต้องยิงทีละ unitID
--   {"projectID":"70503","unitID":"70503-0001","unitNumber":"","houseNumber":""}
-- ★ คอลัมน์นี้ทำให้ทำงานต่อได้ถ้าหลุดกลางทาง — เก็บเฉพาะที่ยังไม่เคยดึง

IF COL_LENGTH('dbo.om_rem_transfers','promo_synced_at') IS NULL
  ALTER TABLE dbo.om_rem_transfers ADD promo_synced_at DATETIMEOFFSET NULL;
GO
IF COL_LENGTH('dbo.om_rem_transfers','promo_count') IS NULL
  ALTER TABLE dbo.om_rem_transfers ADD promo_count INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_rem_tr_promo_todo')
CREATE INDEX IX_om_rem_tr_promo_todo ON dbo.om_rem_transfers(promo_synced_at)
  INCLUDE (project_id, unit_id, contract_id);
GO
