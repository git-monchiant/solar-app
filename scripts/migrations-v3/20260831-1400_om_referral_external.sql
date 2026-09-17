-- O&M: referral ไม่ทำเป็น LIFF ของเรา — เป็นลิงก์ออกไปหน้าสมัคร agent (ผู้ใช้เคาะ 31 ส.ค. แบบ ก.)
-- ★ เก็บ URL ปลายทางไว้ที่ om_liff_apps เพื่อให้แอดมินแก้เองได้จากหน้าเว็บ ไม่ต้อง deploy
IF COL_LENGTH('om_liff_apps', 'external_url') IS NULL
BEGIN
  ALTER TABLE om_liff_apps ADD external_url NVARCHAR(500) NULL;
END
GO

UPDATE om_liff_apps
SET name = N'แนะนำเพื่อน → สมัคร agent',
    note = N'ลิงก์ออกนอก LINE ไปหน้าสมัคร agent (ไม่ใช่ LIFF ของเรา) · ใส่ URL ที่ช่อง external_url',
    endpoint_path = N''   -- คอลัมน์ไม่รับ NULL · ค่าว่าง = ไม่มีหน้า LIFF ของเรา
WHERE code = 'referral';
GO
