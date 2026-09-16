-- สิทธิ์แบบนับครั้งต้องรู้ว่าเป็นสิทธิ์ของงานชนิดไหน (ผู้ใช้เคาะ 9 ก.ย. 69)
-- เดิม om_entitlement_grants มีแค่จำนวนครั้ง ⇒ ทุกใบถูกตีความว่าเป็น "ล้างแผง" โดยปริยาย
-- พอจะขายแพ็คตรวจเช็ก/งานอื่นแบบนับครั้ง ต้องแยกให้ออกว่าใบไหนใช้กับงานอะไร
--   NULL = ล้างแผง (ของเดิม 1,804 ใบไม่ต้องแตะ)
IF COL_LENGTH('om_entitlement_grants', 'service_type_id') IS NULL
  ALTER TABLE om_entitlement_grants ADD service_type_id INT NULL;
GO

-- ★ รอบกับสิทธิ์เป็นคนละเรื่อง — สิทธิ์บอก "ทำได้กี่ครั้ง" รอบบอก "ควรทำทุกกี่เดือน"
--   ล้างแผงมีทั้งคู่ · ซ่อมมีแต่สิทธิ์ไม่มีรอบ · เก็บที่ตารางประเภทงานเพื่อเพิ่มชนิดใหม่โดยไม่แก้โค้ด
IF COL_LENGTH('om_service_type', 'cycle_months') IS NULL
  ALTER TABLE om_service_type ADD cycle_months INT NULL;
GO

-- ล้างแผง = 2 ครั้ง/ปี (ผู้ใช้เคาะ 8 ก.ย. 69) ⇒ รอบ 6 เดือน
UPDATE om_service_type SET cycle_months = 6 WHERE code = 'cleaning' AND cycle_months IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_om_entitlement_grants_type')
  CREATE INDEX IX_om_entitlement_grants_type ON om_entitlement_grants (installation_id, service_type_id);
GO
