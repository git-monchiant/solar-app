-- ประวัติการแก้สิทธิ์ล้างแผง — ทุกการเพิ่ม/ลบ grant กับ redemption ต้องมีร่องรอย
-- เหตุผล: ข้อมูล import cutoff แค่ มิ.ย. 69 · แอดมินต้องเติมรายการล้างที่เกิดหลังจากนั้นเอง
-- และปรับสิทธิ์ที่ซื้อเพิ่ม/ต่อสัญญา/หมดอายุ — เป็นตัวเลขที่ลูกค้าใช้อ้างสิทธิ์ ต้องตรวจย้อนได้ว่าใครแก้

IF OBJECT_ID('dbo.om_entitlement_history') IS NULL
CREATE TABLE dbo.om_entitlement_history (
  id             INT IDENTITY(1,1) CONSTRAINT PK_om_entitlement_history PRIMARY KEY,
  house_id       INT           NOT NULL CONSTRAINT FK_om_ent_hist_house REFERENCES dbo.om_houses(id),
  installation_id INT          NULL,
  kind           NVARCHAR(12)  NOT NULL,   -- grant | redemption
  [action]       NVARCHAR(12)  NOT NULL,   -- add | remove | edit
  ref_id         INT           NULL,       -- id ของแถวที่ถูกกระทำ (ตอน add = id ใหม่)
  qty            INT           NULL,       -- grant: จำนวน (+/-) · redemption: -1
  detail         NVARCHAR(400) NULL,       -- ข้อมูลของแถวตอนนั้น (เก็บไว้กู้ด้วยมือได้ถ้าลบผิด)
  reason         NVARCHAR(300) NULL,
  actor_user_id  INT           NULL,
  created_at     DATETIMEOFFSET NOT NULL CONSTRAINT DF_om_ent_hist_at DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT CK_om_ent_hist_kind CHECK (kind IN ('grant','redemption')),
  CONSTRAINT CK_om_ent_hist_action CHECK ([action] IN ('add','remove','edit'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_om_ent_hist_house')
CREATE INDEX IX_om_ent_hist_house ON dbo.om_entitlement_history(house_id, created_at DESC);
GO
