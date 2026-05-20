-- Standardize leads.lost_reason to the "{group_title} — {item}" format that
-- LostModal saves today. Pre-modal rows stored the bare item without the
-- group prefix, so the dashboard's LOST chart shows the same group split
-- across two labels (e.g. "เปลี่ยนใจ" and "ปิดการขายไม่สำเร็จ — เปลี่ยนใจ").
--
-- The em-dash separator (U+2014 " — ") matches LostModal's finalReason
-- formatter exactly so downstream consumers see one canonical value.
--
-- Intentionally NOT touched (need human review separately):
--   - lost_reason = 'test'  (lead #643 — appears to be a real lost lead with
--                            placeholder text typed in; user wants to look at
--                            it before deciding)
--   - lost_reason = 'อื่นๆ'  (3 rows where the picker was set to OTHER but no
--                            free-text note was saved — no info to recover)

-- ความพร้อม group (4 bare items)
UPDATE leads SET lost_reason = N'ความพร้อม — ครอบครัวไม่อนุมัติ / ผู้มีอำนาจไม่ตัดสินใจ' WHERE lost_reason = N'ครอบครัวไม่อนุมัติ / ผู้มีอำนาจไม่ตัดสินใจ';
UPDATE leads SET lost_reason = N'ความพร้อม — อยู่ต่างจังหวัด / ไม่สะดวก'                    WHERE lost_reason = N'อยู่ต่างจังหวัด / ไม่สะดวก';
UPDATE leads SET lost_reason = N'ความพร้อม — ยังไม่ตัดสินใจ / ขอเวลาคิด'                   WHERE lost_reason = N'ยังไม่ตัดสินใจ / ขอเวลาคิด';
UPDATE leads SET lost_reason = N'ความพร้อม — ปัญหาการเงินชั่วคราว'                         WHERE lost_reason = N'ปัญหาการเงินชั่วคราว';

-- ลูกค้าไม่สนใจ group (3 bare items)
UPDATE leads SET lost_reason = N'ลูกค้าไม่สนใจ — ไม่คุ้ม - ไม่อยู่บ้านกลางวัน'                  WHERE lost_reason = N'ไม่คุ้ม - ไม่อยู่บ้านกลางวัน';
UPDATE leads SET lost_reason = N'ลูกค้าไม่สนใจ — คู่แข่งราคาถูกกว่า'                          WHERE lost_reason = N'คู่แข่งราคาถูกกว่า';
UPDATE leads SET lost_reason = N'ลูกค้าไม่สนใจ — บ้าน/หลังคาไม่เหมาะกับการติดตั้ง'             WHERE lost_reason = N'บ้าน/หลังคาไม่เหมาะกับการติดตั้ง';

-- ปิดการขายไม่สำเร็จ group (2 bare items)
UPDATE leads SET lost_reason = N'ปิดการขายไม่สำเร็จ — เปลี่ยนใจ' WHERE lost_reason = N'เปลี่ยนใจ';
UPDATE leads SET lost_reason = N'ปิดการขายไม่สำเร็จ — ราคาสูง'   WHERE lost_reason = N'ราคาสูง';

-- Free-text → อื่นๆ. Match on exact strings so we don't catch the (separately
-- preserved) bare 'อื่นๆ' / 'test' rows.
UPDATE leads SET lost_reason = N'อื่นๆ — 7/5/2026 เนื่องจากมีผู้ป่วยเลยขอระงับไว้ก่อน' WHERE lost_reason = N'7/5/2026 เนื่องจากมีผู้ป่วยเลยขอระงับไว้ก่อน';
UPDATE leads SET lost_reason = N'อื่นๆ — ลูกค้าแจ้งว่าน่าจะไม่ได้ใช้บริการค่ะ'        WHERE lost_reason = N'ลูกค้าแจ้งว่าน่าจะไม่ได้ใช้บริการค่ะ';

PRINT 'lost_reason normalized to {group} — {item} format';
GO
