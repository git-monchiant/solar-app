-- O&M: โครงระบบจองคิว · จ่ายงานช่าง · เลื่อนนัด
-- ตามแผน docs/plans/20260831_02 · ผู้ใช้อนุมัติ 31 ส.ค. 2569
-- ★ กติกา MSSQL ของโปรเจกต์: DATETIMEOFFSET (ไม่ใช่ DATETIME2) · คอลัมน์รหัส/คีย์ใส่ COLLATE
--   Latin1_General_BIN2 (Thai_CI_AS ไม่สนตัวพิมพ์ จะทำให้ 'Booking.X' ชนกับ 'booking.x') · ไม่ใช้ MERGE

-- ═══ 1) config กลางของโมดูล ═══
IF OBJECT_ID('om_settings') IS NULL
CREATE TABLE om_settings (
  [key]        NVARCHAR(80) COLLATE Latin1_General_BIN2 NOT NULL PRIMARY KEY,
  value_json   NVARCHAR(MAX) NULL,            -- NULL = ยังไม่เคาะ ให้โค้ดใช้ค่าผ่อนปรน + ขึ้นธงเตือน
  label_th     NVARCHAR(200) NOT NULL,
  group_key    NVARCHAR(40) COLLATE Latin1_General_BIN2 NOT NULL,
  pending_biz  BIT NOT NULL DEFAULT 0,        -- ★ รอ business ตอบ — หน้าแอดมินขึ้นธงเตือน
  note         NVARCHAR(400) NULL,
  sort_order   INT NOT NULL DEFAULT 100,
  updated_by   INT NULL,
  updated_at   DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  -- ★ ISJSON('2')=0 ใน MSSQL (scalar ไม่นับเป็น JSON) — ต้องยอมรับ number/boolean ด้วย
  CONSTRAINT CK_om_settings_json CHECK (
    value_json IS NULL OR ISJSON(value_json) = 1
    OR value_json IN ('true','false') OR TRY_CAST(value_json AS FLOAT) IS NOT NULL)
);
GO

-- ═══ 2) ศูนย์บริการ · ทีมช่าง ═══
IF OBJECT_ID('om_service_centers') IS NULL
CREATE TABLE om_service_centers (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  name       NVARCHAR(120) NOT NULL,
  phone      VARCHAR(20) NULL,
  note       NVARCHAR(400) NULL,
  is_active  BIT NOT NULL DEFAULT 1,
  created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
GO

IF OBJECT_ID('om_teams') IS NULL
CREATE TABLE om_teams (
  id                INT IDENTITY(1,1) PRIMARY KEY,
  center_id         INT NULL REFERENCES om_service_centers(id),
  name              NVARCHAR(80) NOT NULL,
  capacity_override INT NULL,                 -- NULL = ใช้ค่ากลาง booking.slot_per_team
  color             VARCHAR(9) NULL,          -- สีในปฏิทิน
  is_active         BIT NOT NULL DEFAULT 1,
  created_at        DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
GO

IF OBJECT_ID('om_team_members') IS NULL
CREATE TABLE om_team_members (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  team_id    INT NOT NULL REFERENCES om_teams(id),
  user_id    INT NOT NULL,                    -- users.id ของระบบเขา (อ่านอย่างเดียว)
  role       VARCHAR(10) NOT NULL DEFAULT 'member',   -- lead | member
  is_current BIT NOT NULL DEFAULT 1,
  created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_team_members_team')
  CREATE INDEX IX_om_team_members_team ON om_team_members(team_id, is_current);
GO

-- วันที่ทีมไม่ว่าง (ลา/อบรม)
IF OBJECT_ID('om_team_offdays') IS NULL
CREATE TABLE om_team_offdays (
  id       INT IDENTITY(1,1) PRIMARY KEY,
  team_id  INT NOT NULL REFERENCES om_teams(id),
  [date]   DATE NOT NULL,
  reason   NVARCHAR(200) NULL,
  CONSTRAINT UQ_om_team_offdays UNIQUE (team_id, [date])
);
GO

-- ═══ 3) ความจุ (ห้าม hardcode — กติกาโปรเจกต์) ═══
IF OBJECT_ID('om_slot_config') IS NULL
CREATE TABLE om_slot_config (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  center_id  INT NULL REFERENCES om_service_centers(id),   -- NULL = ใช้กับทุกศูนย์
  weekday    TINYINT NOT NULL,                -- 0=อาทิตย์ … 6=เสาร์
  start_time TIME(0) NOT NULL,
  end_time   TIME(0) NOT NULL,
  capacity   INT NOT NULL,
  is_open    BIT NOT NULL DEFAULT 1,
  CONSTRAINT CK_om_slot_weekday CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT CK_om_slot_time CHECK (end_time > start_time)
);
GO

IF OBJECT_ID('om_holidays') IS NULL
CREATE TABLE om_holidays (
  id        INT IDENTITY(1,1) PRIMARY KEY,
  [date]    DATE NOT NULL,
  name      NVARCHAR(120) NOT NULL,
  center_id INT NULL REFERENCES om_service_centers(id)     -- NULL = ปิดทุกศูนย์
);
GO

-- ═══ 4) นัด — เพิ่มคอลัมน์ที่ยังขาด ═══
IF COL_LENGTH('om_bookings','team_id') IS NULL
  ALTER TABLE om_bookings ADD
    service_center_id INT NULL,
    team_id           INT NULL,
    queue_index       INT NULL,               -- ลำดับในทีมของวันนั้น
    rescheduled_count INT NOT NULL DEFAULT 0,
    [source]          VARCHAR(10) NOT NULL DEFAULT 'admin', -- liff | admin | phone
    cancelled_reason  NVARCHAR(300) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_bookings_sched')
  CREATE INDEX IX_om_bookings_sched ON om_bookings(scheduled_at, status);
GO

-- ═══ 5) ประวัติทุกการเปลี่ยนแปลง (ข้อ 4 ที่ผู้ใช้เคาะ) ═══
IF OBJECT_ID('om_booking_history') IS NULL
CREATE TABLE om_booking_history (
  id             BIGINT IDENTITY(1,1) PRIMARY KEY,
  booking_id     INT NOT NULL REFERENCES om_bookings(id),
  [action]       VARCHAR(20) COLLATE Latin1_General_BIN2 NOT NULL,
  -- create confirm reschedule assign_team reorder start done cancel no_show
  actor_user_id  INT NULL,
  actor_role     VARCHAR(20) NULL,            -- admin | technician | customer | system
  from_json      NVARCHAR(MAX) NULL,
  to_json        NVARCHAR(MAX) NULL,
  reason         NVARCHAR(300) NULL,
  created_at     DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT CK_om_bh_from CHECK (from_json IS NULL OR ISJSON(from_json) = 1),
  CONSTRAINT CK_om_bh_to   CHECK (to_json   IS NULL OR ISJSON(to_json)   = 1)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_bh_booking')
  CREATE INDEX IX_om_bh_booking ON om_booking_history(booking_id, created_at DESC);
GO

-- ═══ 6) seed config เริ่มต้น (UPDATE แล้วเช็ค @@ROWCOUNT ก่อน INSERT — ไม่ใช้ MERGE) ═══
DECLARE @s TABLE (k NVARCHAR(80), v NVARCHAR(MAX), l NVARCHAR(200), g NVARCHAR(40), p BIT, n NVARCHAR(400), o INT);
INSERT INTO @s VALUES
 ('booking.slot_per_team',      '2',    N'จำนวนคิวต่อทีมต่อช่วงเวลา',        'booking',    0, N'ค่ากลาง — ทีมที่ตั้ง capacity_override เองจะใช้ค่าของทีม', 10),
 ('booking.advance_days_max',   '60',   N'ลูกค้าจองล่วงหน้าได้ไม่เกิน (วัน)', 'booking',    0, NULL, 20),
 ('booking.advance_hours_min',  '24',   N'ต้องจองก่อนอย่างน้อย (ชั่วโมง)',   'booking',    0, NULL, 30),
 ('reschedule.by_customer',     'true', N'ลูกค้าเลื่อนนัดเองได้',            'reschedule', 0, N'ปิดแล้วต้องโทรหาแอดมินอย่างเดียว', 40),
 ('reschedule.max_times',       '2',    N'เลื่อนได้กี่ครั้งต่อนัด',           'reschedule', 0, NULL, 50),
 ('reschedule.min_hours_before','24',   N'เลื่อนได้ก่อนถึงนัด (ชั่วโมง)',    'reschedule', 0, NULL, 60),
 ('reschedule.reset_to_pending','true', N'เลื่อนแล้วกลับเป็นรอยืนยัน',       'reschedule', 0, N'วันใหม่ยังไม่ได้ตกลงกับลูกค้าจริง', 70),
 ('reschedule.unassign_team',   'true', N'เลื่อนแล้วปลดทีมที่จ่ายไว้ออก',    'reschedule', 0, N'ทีมเดิมอาจไม่ว่างวันใหม่', 80),
 ('reschedule.notify_line',     'true', N'แจ้งลูกค้าทาง LINE เมื่อเลื่อน',   'reschedule', 0, NULL, 90),
 ('cancel.min_hours_before',    NULL,   N'ยกเลิกได้ก่อนถึงนัด (ชั่วโมง)',    'cancel',     1, N'★ รอ business — ระหว่างรอ ยกเลิกได้ตลอด', 100),
 ('cancel.refund_quota',        NULL,   N'ยกเลิกแล้วคืนสิทธิ์ล้างแผง',        'cancel',     1, N'★ รอ business — ตอนนี้ตัดสิทธิ์ตอนปิดงาน จึงยังไม่มีอะไรต้องคืน', 110),
 ('noshow.consume_quota',       NULL,   N'ลูกค้าไม่อยู่บ้าน (no-show) นับใช้สิทธิ์', 'cancel', 1, N'★ รอ business — ค่าเริ่มต้นตอนนี้คือไม่ตัดสิทธิ์', 120);

UPDATE t SET t.label_th=s.l, t.group_key=s.g, t.pending_biz=s.p, t.note=s.n, t.sort_order=s.o
FROM om_settings t JOIN @s s ON s.k = t.[key] COLLATE Latin1_General_BIN2;   -- ★ ไม่แตะ value_json ที่แอดมินตั้งไว้แล้ว

INSERT INTO om_settings ([key], value_json, label_th, group_key, pending_biz, note, sort_order)
SELECT s.k, s.v, s.l, s.g, s.p, s.n, s.o FROM @s s
WHERE NOT EXISTS (SELECT 1 FROM om_settings t WHERE t.[key] = s.k COLLATE Latin1_General_BIN2);
GO

-- ═══ 7) seed ศูนย์+ทีม+ความจุ ตั้งต้น (แอดมินแก้เองได้ทีหลัง) ═══
IF NOT EXISTS (SELECT 1 FROM om_service_centers)
BEGIN
  INSERT INTO om_service_centers (name, note) VALUES (N'ศูนย์บริการหลัก', N'สร้างอัตโนมัติตอน migration — แก้ชื่อ/เพิ่มศูนย์ได้ที่หน้าตั้งค่า');
  DECLARE @c INT = SCOPE_IDENTITY();
  INSERT INTO om_teams (center_id, name, color) VALUES (@c, N'ทีม A', '#22c55e'), (@c, N'ทีม B', '#3b82f6'), (@c, N'ทีม C', '#f59e0b');
  -- จ-ศ 4 ช่วงเวลา ความจุ 6 · เสาร์-อาทิตย์ปิด (แก้ได้ที่หน้าตั้งค่า)
  INSERT INTO om_slot_config (center_id, weekday, start_time, end_time, capacity, is_open)
  SELECT @c, d.wd, t.st, t.et, 6, 1
  FROM (VALUES (1),(2),(3),(4),(5)) d(wd)
  CROSS JOIN (VALUES ('09:00','10:30'),('10:30','12:00'),('13:00','14:30'),('14:30','16:00')) t(st,et);
END
GO
