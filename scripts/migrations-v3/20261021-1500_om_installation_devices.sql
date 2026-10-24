-- Serial อุปกรณ์รายตัวของระบบติดตั้ง O&M — แท็บ "Equipment - Serial" ในหน้างานบริการ
-- (แผน docs/plan/20261021-03-om-equipment-serial-tab.md · ผู้ใช้เคาะ "ตามแนะนำ" 21 ต.ค. 69)
--
-- ★ ทำไมไม่ใช้ lead_inverters / lead_panels / lead_batteries ของฝั่งขาย:
--   ① 2,015 จาก 2,020 ระบบไม่มี lead ② ใบรับประกันสาธารณะ (/warranty/[id]) อ่านตารางฝั่งขายสด
--      O&M แก้ที่นั่นแล้วใบที่ส่งลูกค้าไปแล้วจะเปลี่ยนตาม
-- ★ ตารางเดียวมีคอลัมน์ชนิด (ฝั่งขายแยก 3 ตาราง) — คอลัมน์เหมือนกันหมด ต่างแค่ kw / kwh → spec
-- ★ om_installations.inverter_* / battery_* ยังเป็นช่องที่หน้าอื่นอ่าน — API เขียนแถวแรกกลับทุกครั้ง (src/lib/om/devices.ts)
-- source: sales = คัดลอกจากใบรับประกันฝั่งขาย · import = ตั้งต้นจาก om_installations.inverter_sn (ไฟล์นำเข้า) · manual = แท็บนี้

IF OBJECT_ID('dbo.om_installation_devices', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.om_installation_devices (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    installation_id INT NOT NULL REFERENCES dbo.om_installations(id),
    device_type     VARCHAR(10) COLLATE Latin1_General_BIN2 NOT NULL,
    brand           NVARCHAR(100) NULL,
    spec            DECIMAL(10,3) NULL,          -- kW (inverter) / kWh (battery) · แผง = NULL
    serial_no       NVARCHAR(200) NULL,
    photo_url       NVARCHAR(500) NULL,          -- /api/files/<ไฟล์> ที่เก็บเดียวกับฝั่งขาย
    photo_box       NVARCHAR(50) NULL,           -- "[ymin,xmin,ymax,xmax]" 0-1000 ตำแหน่งป้ายบนรูป
    position        INT NOT NULL DEFAULT 0,
    source          VARCHAR(10) COLLATE Latin1_General_BIN2 NOT NULL DEFAULT 'manual',
    created_by      INT NULL,
    created_at      DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at      DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT CK_om_idev_type   CHECK (device_type IN ('inverter', 'panel', 'battery')),
    CONSTRAINT CK_om_idev_source CHECK (source IN ('sales', 'import', 'manual'))
  );
  CREATE INDEX IX_om_idev_inst ON dbo.om_installation_devices (installation_id, device_type, position);
END
GO

-- คัดลอกจากงานขายแล้วหรือยัง — ครั้งเดียวต่อระบบ (ไม่ทับของที่ O&M แก้ภายหลัง)
IF COL_LENGTH('dbo.om_installations', 'sales_devices_copied_at') IS NULL
  ALTER TABLE dbo.om_installations ADD sales_devices_copied_at DATETIMEOFFSET NULL;
GO

-- ── 1. ระบบจากงานขายที่ออกใบรับประกันแล้ว (gridtie/closed) → คัดลอก Serial ฝั่งขายพร้อมรูปและกรอบ
--   SQL ชุดเดียวกับ copySalesDevices() ใน src/lib/om/devices.ts (รอบกวาดงานขายทำต่อให้ระบบใหม่)
--   ตอนเขียน (solardb_v3 · 21 ต.ค. 69): lead 661 (อินเวอร์เตอร์ 1 · แผง 8) · lead 691 (อินเวอร์เตอร์จาก warranty_inverter_sn · แผง 16)
--   lead 400 / 408 / 421 ยังอยู่ขั้นรับประกัน — รอบกวาดคัดลอกให้เมื่อออกใบ
DECLARE @t TABLE (installation_id INT PRIMARY KEY, lead_id INT, manual BIT);
INSERT INTO @t
SELECT i.id, i.lead_id,
       CASE WHEN EXISTS (SELECT 1 FROM dbo.om_installation_devices d
                         WHERE d.installation_id = i.id AND d.source = 'manual') THEN 1 ELSE 0 END
  FROM dbo.om_installations i JOIN dbo.leads l ON l.id = i.lead_id
 WHERE l.om_only = 0 AND l.status IN ('gridtie', 'closed') AND i.sales_devices_copied_at IS NULL;

DELETE d FROM dbo.om_installation_devices d JOIN @t t ON t.installation_id = d.installation_id
 WHERE t.manual = 0 AND d.source = 'import';

INSERT INTO dbo.om_installation_devices (installation_id, device_type, brand, spec, serial_no, photo_url, photo_box, position, source)
SELECT t.installation_id, 'inverter', x.brand, x.kw, x.serial_no, x.photo_url, x.photo_box,
       ROW_NUMBER() OVER (PARTITION BY t.installation_id ORDER BY x.position, x.id) - 1, 'sales'
  FROM @t t JOIN dbo.lead_inverters x ON x.lead_id = t.lead_id WHERE t.manual = 0;
INSERT INTO dbo.om_installation_devices (installation_id, device_type, brand, spec, serial_no, position, source)
SELECT t.installation_id, 'inverter', l.warranty_inverter_brand, l.warranty_inverter_kw, l.warranty_inverter_sn, 0, 'sales'
  FROM @t t JOIN dbo.leads l ON l.id = t.lead_id
 WHERE t.manual = 0 AND l.warranty_inverter_sn IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.lead_inverters x WHERE x.lead_id = t.lead_id);
INSERT INTO dbo.om_installation_devices (installation_id, device_type, brand, spec, serial_no, photo_url, photo_box, position, source)
SELECT t.installation_id, 'panel', x.brand, NULL, x.serial_no, x.photo_url, x.photo_box,
       ROW_NUMBER() OVER (PARTITION BY t.installation_id ORDER BY x.position, x.id) - 1, 'sales'
  FROM @t t JOIN dbo.lead_panels x ON x.lead_id = t.lead_id WHERE t.manual = 0;
INSERT INTO dbo.om_installation_devices (installation_id, device_type, brand, spec, serial_no, photo_url, photo_box, position, source)
SELECT t.installation_id, 'battery', x.brand, x.kwh, x.serial_no, x.photo_url, x.photo_box,
       ROW_NUMBER() OVER (PARTITION BY t.installation_id ORDER BY x.position, x.id) - 1, 'sales'
  FROM @t t JOIN dbo.lead_batteries x ON x.lead_id = t.lead_id WHERE t.manual = 0;

UPDATE i SET sales_devices_copied_at = SYSDATETIMEOFFSET()
  FROM dbo.om_installations i JOIN @t t ON t.installation_id = i.id;

-- เขียนแถวแรกกลับลงช่องสเปกของระบบ (ตัวเดียวกับ syncInstallationSpec) — ตอนเขียนค่าตรงกันอยู่แล้วทั้ง 2 ระบบ
--   ทำไว้เผื่อฐานที่ refresh ใหม่แล้วข้อมูลฝั่งขายต่างไป · จดที่มาเฉพาะช่องที่เปลี่ยน
DECLARE @i INT, @lead INT;
DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT installation_id, lead_id FROM @t WHERE manual = 0;
OPEN c;
FETCH NEXT FROM c INTO @i, @lead;
WHILE @@FETCH_STATUS = 0
BEGIN
  DECLARE @old TABLE (inverter_brand NVARCHAR(100), inverter_sn NVARCHAR(200), inverter_kw DECIMAL(6,2),
                      battery_brand NVARCHAR(60), battery_kwh DECIMAL(6,2));
  DELETE FROM @old;
  INSERT INTO @old SELECT inverter_brand, inverter_sn, inverter_kw, battery_brand, battery_kwh
                     FROM dbo.om_installations WHERE id = @i;

  UPDATE i SET
    inverter_sn    = inv.serial_no,
    inverter_brand = ISNULL(LEFT(inv.brand, 100), i.inverter_brand),
    inverter_kw    = ISNULL(CASE WHEN inv.spec > 0 AND inv.spec < 10000 THEN CAST(inv.spec AS DECIMAL(6,2)) END, i.inverter_kw),
    battery_brand  = ISNULL(LEFT(bat.brand, 60), i.battery_brand),
    battery_kwh    = ISNULL(CASE WHEN bat.spec > 0 AND bat.spec < 10000 THEN CAST(bat.spec AS DECIMAL(6,2)) END, i.battery_kwh)
  FROM dbo.om_installations i
  OUTER APPLY (SELECT TOP 1 brand, spec, serial_no FROM dbo.om_installation_devices
                WHERE installation_id = i.id AND device_type = 'inverter' ORDER BY position, id) inv
  OUTER APPLY (SELECT TOP 1 brand, spec FROM dbo.om_installation_devices
                WHERE installation_id = i.id AND device_type = 'battery' ORDER BY position, id) bat
  WHERE i.id = @i
    AND EXISTS (SELECT 1 FROM dbo.om_installation_devices WHERE installation_id = @i AND device_type IN ('inverter', 'battery'));

  INSERT INTO dbo.om_field_sources (house_id, installation_id, table_name, column_name, new_value, old_value,
                                    source_kind, source_ref, match_method, confidence)
  SELECT i.house_id, i.id, 'om_installations', v.col, v.nv, v.ov, 'sales',
         CONCAT(N'lead ', @lead), N'Serial จากใบรับประกันฝั่งขาย', 'confirmed'
    FROM dbo.om_installations i CROSS JOIN @old o
   CROSS APPLY (VALUES
     ('inverter_sn',    i.inverter_sn    COLLATE DATABASE_DEFAULT, o.inverter_sn    COLLATE DATABASE_DEFAULT),
     ('inverter_brand', i.inverter_brand COLLATE DATABASE_DEFAULT, o.inverter_brand COLLATE DATABASE_DEFAULT),
     ('inverter_kw',    CONVERT(NVARCHAR(40), i.inverter_kw), CONVERT(NVARCHAR(40), o.inverter_kw)),
     ('battery_brand',  i.battery_brand  COLLATE DATABASE_DEFAULT, o.battery_brand  COLLATE DATABASE_DEFAULT),
     ('battery_kwh',    CONVERT(NVARCHAR(40), i.battery_kwh), CONVERT(NVARCHAR(40), o.battery_kwh))
   ) v(col, nv, ov)
   WHERE i.id = @i AND EXISTS (SELECT v.nv EXCEPT SELECT v.ov);

  FETCH NEXT FROM c INTO @i, @lead;
END
CLOSE c;
DEALLOCATE c;
GO

-- ── 2. ระบบที่มี SN อินเวอร์เตอร์ในช่องเดิม (ไฟล์นำเข้า ABB/HUAWEI/SMA · ระบบขายที่ยังไม่ออกใบรับประกัน) → 1 แถว ไม่มีรูป
--   ตอนเขียน 704 ระบบ (706 ลบ 2 ระบบที่คัดลอกจากงานขายในข้อ 1) · ไม่มีช่องไหนใส่หลาย SN
--   ระบบที่รู้แค่ kW/ยี่ห้อ (758) ไม่สร้างแถว — หน้าเพิ่ม Serial ก็บังคับต้องมี Serial
INSERT INTO dbo.om_installation_devices (installation_id, device_type, brand, spec, serial_no, position, source)
SELECT i.id, 'inverter', i.inverter_brand, i.inverter_kw, LTRIM(RTRIM(i.inverter_sn)), 0, 'import'
  FROM dbo.om_installations i
 WHERE i.inverter_sn IS NOT NULL AND LTRIM(RTRIM(i.inverter_sn)) <> N''
   AND i.sales_devices_copied_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.om_installation_devices d WHERE d.installation_id = i.id);
GO
