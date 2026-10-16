-- ค่าตั้งการ sync REM อัตโนมัติ — ตั้งจากหน้าเว็บ ไม่ต้อง crontab ข้างนอก (ผู้ใช้เคาะ 3 ก.ย.)
-- ตัวตั้งเวลาอยู่ในแอป (instrumentation) อ่านค่าพวกนี้ · เปลี่ยนค่าปุ๊บ รอบถัดไปใช้ทันที
-- ★ ทุกกติกาเป็น config (ผู้ใช้เคาะ 31 ส.ค.) — ห้าม hardcode รอบเวลาในโค้ด

MERGE dbo.om_settings AS t
USING (VALUES
  ('sync.rem_auto',        'true',  N'เปิด sync REM อัตโนมัติ',            'sync', 0, 1),
  ('sync.rem_every_min',   '360',     N'ดึงทุกกี่นาที (360 = 6 ชม.)',                       'sync', 0, 2),
  ('sync.rem_batch',       '200',     N'ดึงกี่โครงการต่อรอบ (200 = ทุกโครงการ)',      'sync', 0, 3),
  ('sync.sweep_auto',      'true',  N'กวาดงานขายเข้าระบบอัตโนมัติ',        'sync', 0, 4),
  ('sync.promo_auto',      'true',  N'ดึงของแถม/โซลาร์อัตโนมัติ',          'sync', 0, 5)
) AS s([key], value_json, label_th, group_key, pending_biz, sort_order)
ON t.[key] = s.[key]
WHEN NOT MATCHED THEN
  INSERT ([key], value_json, label_th, group_key, pending_biz, sort_order)
  VALUES (s.[key], s.value_json, s.label_th, s.group_key, s.pending_biz, s.sort_order);
GO
