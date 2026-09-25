-- วันประกันของบ้านที่มาจากงานขาย ต้องตรงกับใบรับประกันที่ออกให้ลูกค้า (แผน docs/plan/20260925-01)
-- เดิม: sales-sweep ใส่แค่ install_date → warranty_start คิดจากวันติดตั้ง/วันโอน
--       ไม่ได้อ่าน leads.warranty_start_date เลย ⇒ ไม่ตรงใบ (lead 408 ต่าง 27 วัน · lead 691 ต่าง 1 วัน)
-- ใหม่: เก็บช่วงประกันจากใบรับประกันฝั่งขาย แล้วให้ warranty_start ใช้ค่านี้ก่อนเมื่อมี
--   · sales_warranty_start / sales_warranty_end — sales-sweep ตามค่าจาก leads ทุกรอบ (syncSalesWarranty)
--   · บ้านที่ไม่มี lead (นำเข้าชีต/REM) = NULL → สูตรเดิมทุกอย่าง
-- ★ warranty_start เป็น computed — drop/add ใหม่ ไม่มีข้อมูลหาย (แบบเดียวกับ 20260826-1030)
--   ตารางนี้เป็นของ v3 ล้วน v2 ไม่อ่าน จึงไม่ขัดกติกา "ห้ามลบคอลัมน์" ใน README

IF COL_LENGTH('dbo.om_installations', 'sales_warranty_start') IS NULL
  ALTER TABLE dbo.om_installations ADD sales_warranty_start DATE NULL;
IF COL_LENGTH('dbo.om_installations', 'sales_warranty_end') IS NULL
  ALTER TABLE dbo.om_installations ADD sales_warranty_end DATE NULL;
GO

-- statistics ที่ SQL Server สร้างไว้บนคอลัมน์เดิม — ลบก่อน กัน DROP COLUMN ติด
DECLARE @drop NVARCHAR(MAX) = N'';
SELECT @drop += N'DROP STATISTICS dbo.om_installations.' + QUOTENAME(s.name) + N';'
  FROM sys.stats s
  JOIN sys.stats_columns sc ON sc.object_id = s.object_id AND sc.stats_id = s.stats_id
  JOIN sys.columns c ON c.object_id = sc.object_id AND c.column_id = sc.column_id
 WHERE s.object_id = OBJECT_ID('dbo.om_installations') AND c.name = 'warranty_start'
   AND NOT EXISTS (SELECT 1 FROM sys.indexes i WHERE i.object_id = s.object_id AND i.index_id = s.stats_id);
IF @drop <> N'' EXEC sp_executesql @drop;
GO

IF COL_LENGTH('dbo.om_installations', 'warranty_start') IS NOT NULL
  ALTER TABLE dbo.om_installations DROP COLUMN warranty_start;
GO
ALTER TABLE dbo.om_installations ADD warranty_start AS (
  CASE
    WHEN sales_warranty_start IS NOT NULL THEN sales_warranty_start
    WHEN install_date IS NULL AND COALESCE(transfer_date, rem_transfer_date) IS NULL THEN NULL
    WHEN install_date IS NULL THEN COALESCE(transfer_date, rem_transfer_date)
    WHEN COALESCE(transfer_date, rem_transfer_date) IS NULL THEN install_date
    WHEN install_date >= COALESCE(transfer_date, rem_transfer_date) THEN install_date
    ELSE COALESCE(transfer_date, rem_transfer_date)
  END
) PERSISTED;
GO

-- วิวนี้อ้างตาราง (ไม่ schemabound) — refresh metadata อย่างเดียว ไม่แตะนิยามวิว
IF OBJECT_ID('dbo.om_entitlement_balance', 'V') IS NOT NULL
  EXEC sp_refreshview N'dbo.om_entitlement_balance';
GO

-- backfill + จดที่มา — ตรรกะเดียวกับ syncSalesWarranty() ใน src/lib/om/sales-sweep.ts
DECLARE @chg TABLE (installation_id INT, house_id INT, lead_id INT, doc_no NVARCHAR(100),
                    old_sws DATE, new_sws DATE, old_ws DATE, new_ws DATE);
UPDATE i SET sales_warranty_start = l.warranty_start_date, sales_warranty_end = l.warranty_end_date,
             updated_at = SYSDATETIMEOFFSET()
OUTPUT inserted.id, inserted.house_id, inserted.lead_id, l.warranty_doc_no,
       deleted.sales_warranty_start, inserted.sales_warranty_start, deleted.warranty_start, inserted.warranty_start
  INTO @chg
FROM dbo.om_installations i JOIN dbo.leads l ON l.id = i.lead_id
WHERE l.om_only = 0
  AND EXISTS (SELECT i.sales_warranty_start, i.sales_warranty_end
              EXCEPT SELECT l.warranty_start_date, l.warranty_end_date);

INSERT INTO dbo.om_field_sources (house_id, installation_id, table_name, column_name, new_value, old_value,
                                  source_kind, source_ref, match_method, confidence)
SELECT house_id, installation_id, 'om_installations', 'warranty_start',
       CONVERT(char(10), new_ws, 23), CONVERT(char(10), old_ws, 23), 'sales',
       CONCAT(N'lead ', lead_id, CASE WHEN doc_no IS NULL THEN N'' ELSE N' · ใบรับประกัน ' + doc_no END),
       CASE WHEN new_sws IS NULL THEN N'ฝั่งขายลบวันประกัน → กลับไปใช้วันติดตั้ง/วันโอน'
            ELSE N'วันเริ่มประกันบนใบรับประกันฝั่งขาย' END,
       'confirmed'
  FROM @chg c
 WHERE EXISTS (SELECT c.old_sws EXCEPT SELECT c.new_sws);
GO
