-- Journey step/sub ของลูกค้า — เก็บ "อยู่ขั้นไหน" ลง leads ตรงๆ แทนการ derive
-- กระจัดกระจายใน pipeline/today/dashboard/BI (design: docs/plan/20260813-01-journey-step-codes.md)
--
-- โครงเลข: step เว้นทีละ 100 (100..1000, terminal 9800/9900)
--          sub ฝังเลข step ในตัว เว้นทีละ 10 (110,120,... / 0 = ไม่มี sub)
-- แถว sub_code = 0 ของ step ที่มี sub ใช้เป็นป้ายชื่อระดับ step (ไว้ group แสดงผล)
--
-- กติกาการคำนวณอยู่ที่ src/lib/journey-rules.mjs (ที่เดียว) — ตารางนี้เก็บป้ายไทย
-- และเป็นทะเบียน code ที่ valid ให้ report/validate ใช้ join

IF OBJECT_ID('dbo.journey_steps', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.journey_steps (
    step_code INT NOT NULL,
    sub_code  INT NOT NULL,            -- 0 = แถวระดับ step / step ไม่มี sub
    label_th  NVARCHAR(100) NOT NULL,
    active    BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_journey_steps PRIMARY KEY (step_code, sub_code)
  );
END
GO

MERGE dbo.journey_steps AS t
USING (VALUES
  (100,  0,   N'ติดตาม'),
  (100,  110, N'ยังไม่ติดต่อ'),
  (100,  120, N'ติดต่อไม่ได้'),
  (100,  130, N'ติดต่อได้ ยังไม่สะดวกคุย'),
  (100,  140, N'ระหว่างเสนอขาย'),
  (200,  0,   N'จองสำรวจ'),
  (200,  210, N'จอง รอยืนยันเงิน'),
  (200,  220, N'จองแล้ว'),
  (300,  0,   N'สำรวจ'),
  (300,  310, N'นัดสำรวจ'),
  (300,  320, N'กำลังสำรวจ'),
  (400,  0,   N'รอใบเสนอราคา'),
  (500,  0,   N'ชำระเงิน'),
  (500,  510, N'รอเสนอลูกค้า/รอชำระ'),
  (500,  520, N'รอยืนยันเงินงวด'),
  (600,  0,   N'มัดจำแล้ว รอนัดติดตั้ง'),
  (700,  0,   N'ติดตั้ง'),
  (700,  710, N'รอติดตั้ง'),
  (700,  720, N'กำลังติดตั้ง'),
  (700,  730, N'ติดตั้งเสร็จ'),
  (800,  0,   N'รอออกใบรับประกัน'),
  (900,  0,   N'ขอขนานไฟ'),
  (1000, 0,   N'ส่งมอบแล้ว'),
  (9800, 0,   N'ส่งกลับ Seeker'),
  (9900, 0,   N'ยกเลิก')
) AS s(step_code, sub_code, label_th)
ON t.step_code = s.step_code AND t.sub_code = s.sub_code
WHEN MATCHED THEN UPDATE SET label_th = s.label_th
WHEN NOT MATCHED THEN INSERT (step_code, sub_code, label_th) VALUES (s.step_code, s.sub_code, s.label_th);
GO

IF COL_LENGTH('dbo.leads', 'journey_step') IS NULL
  ALTER TABLE dbo.leads ADD journey_step INT NULL;
IF COL_LENGTH('dbo.leads', 'journey_sub') IS NULL
  ALTER TABLE dbo.leads ADD journey_sub INT NULL;
IF COL_LENGTH('dbo.leads', 'journey_updated_at') IS NULL
  ALTER TABLE dbo.leads ADD journey_updated_at DATETIME2 NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_leads_journey' AND object_id = OBJECT_ID('dbo.leads'))
  CREATE INDEX IX_leads_journey ON dbo.leads (journey_step, journey_sub);
GO
