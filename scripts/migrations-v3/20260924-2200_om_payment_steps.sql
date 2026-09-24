-- ขั้นย่อยของ "ชำระเงิน" 2300 ของงานบริการ O&M (แผน docs/plan/20260924-02 เฟส 4)
--
-- ใบงานสถานะ payment (om_bookings.status) — ใบเสนอราคาอนุมัติครบและ Sale ส่งให้ลูกค้าแล้ว
-- ขั้นย่อยอ่านจากแถว payments ของใบเสนอราคา (slip_field = 'om_quote_<quotations.id>') ดู src/lib/om/journey-sql.ts
--   2310 รอชำระ            — ยังไม่มีสลิป
--   2320 รอ Account ยืนยัน — มีสลิปแล้ว ยังไม่ยืนยันรับเงิน
--   2330 ชำระแล้ว รอนัด     — Account ยืนยันรับเงินแล้ว (เติมสิทธิ์ที่ซื้อแล้ว) รอโทรนัด
-- ป้ายอย่างเดียว ไม่แตะโครงสร้างตาราง · รันซ้ำได้

MERGE dbo.journey_steps AS t
USING (VALUES
  (2300, 2310, N'รอชำระ'),
  (2300, 2320, N'รอ Account ยืนยันรับเงิน'),
  (2300, 2330, N'ชำระแล้ว รอนัด')
) AS s(step_code, sub_code, label_th)
ON t.step_code = s.step_code AND t.sub_code = s.sub_code
WHEN MATCHED THEN UPDATE SET label_th = s.label_th, active = 1
WHEN NOT MATCHED THEN INSERT (step_code, sub_code, label_th) VALUES (s.step_code, s.sub_code, s.label_th);
GO
