-- Add discount note column (e.g. "โปรโมชัน", "ส่วนลดพนักงาน").
ALTER TABLE leads ADD order_discount_note NVARCHAR(200) NULL;
