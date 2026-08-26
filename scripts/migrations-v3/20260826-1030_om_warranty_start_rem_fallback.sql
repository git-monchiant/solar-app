-- ปรับสูตรวันเริ่มประกัน om_installations.warranty_start
-- เดิม: MAX(install_date, transfer_date) — ไม่รู้จัก rem_transfer_date (วันโอนจาก REM)
--       ทำให้ 533 หลังที่มีแต่วันโอน REM ขึ้น "ไม่มีวันประกัน"
-- ใหม่: วันโอน = COALESCE(transfer_date, rem_transfer_date) แล้วค่อยเทียบ
--   · มีทั้งวันติดตั้งและวันโอน  → ใช้วันล่าสุด
--   · มีวันเดียว                 → ใช้วันนั้น
--   · ไม่มีเลย                   → NULL (แสดง ⚠ ต่อไป)
-- หมายเหตุ: กรณีมีวันโอนทั้ง 2 แหล่ง ใช้ค่าจากชีต (transfer_date) เป็นหลักเหมือนเดิม
--           เพื่อไม่ให้ค่าประกันของ 706 หลังที่คำนวณได้อยู่แล้วขยับ

ALTER TABLE dbo.om_installations DROP COLUMN warranty_start;
GO
ALTER TABLE dbo.om_installations ADD warranty_start AS (
  CASE
    WHEN install_date IS NULL AND COALESCE(transfer_date, rem_transfer_date) IS NULL THEN NULL
    WHEN install_date IS NULL THEN COALESCE(transfer_date, rem_transfer_date)
    WHEN COALESCE(transfer_date, rem_transfer_date) IS NULL THEN install_date
    WHEN install_date >= COALESCE(transfer_date, rem_transfer_date) THEN install_date
    ELSE COALESCE(transfer_date, rem_transfer_date)
  END
) PERSISTED;
GO
