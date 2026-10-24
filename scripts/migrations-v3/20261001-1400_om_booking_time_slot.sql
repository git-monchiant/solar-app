-- ช่วงเวลาที่จองของใบงาน O&M (แผน docs/plan/20261001-01-om-shared-survey-schedule.md เฟส 1 · ผู้ใช้เคาะ 1 ต.ค. 69)
--
-- ทีมสำรวจกับทีมล้างเป็นชุดเดียวกัน ⇒ นัด O&M ต้องเก็บแบบนัดสำรวจ เพื่อลงปฏิทินร่วมกันได้
--   รูปแบบเดียวกับ leads.survey_time_slot = JSON array ของช่อง 30 นาที เช่น ["09:00","09:30","10:00"]
--   (HOURLY_SLOTS ใน src/lib/time-slots.ts · 09:00–16:30)
-- ★ scheduled_at คงไว้ = วันนัด + เวลาเริ่มของช่องแรก — การเรียง/งานวันนี้/cron เตือน/PDF ยังใช้ได้เหมือนเดิม
-- ★ nullable — ใบที่ยังไม่มีวันนัด (ติดตาม/เสนอราคา/ชำระเงิน) ไม่มีช่วงเวลา

IF COL_LENGTH('dbo.om_bookings', 'time_slot') IS NULL
  ALTER TABLE dbo.om_bookings ADD time_slot NVARCHAR(200) NULL;
GO

-- backfill ใบเดิมที่มีวันนัด: เวลาเริ่ม (ปัดลงเป็น :00/:30) → ช่อง 30 นาทีจนจบช่วงใน om_slot_config ที่ครอบเวลาเริ่มอยู่
--   09:00 → 09:00/09:30/10:00 · 10:30 → 10:30/11:00/11:30 · 13:00 → 13:00/13:30/14:00 · 14:30 → 14:30/15:00/15:30
--   ลากในปฏิทินมากลางช่วง (เช่น 10:40) → นับจาก 10:30 ถึงจบช่วงนั้น · ไม่อยู่ในช่วงไหนเลย → ช่องเดียว
--   นอก 09:00–16:30 → ไม่มีช่องให้ ⇒ ค่าว่าง (หน้าจอใช้ scheduled_at แทน)
-- ★ กติกาเดียวกับ omSlotsFor() ใน src/lib/om/time-slot.ts (API ที่หน้าจอเก่ายังไม่ส่ง time_slot)
;WITH hs AS (
  SELECT CAST(v AS time(0)) s FROM (VALUES
    ('09:00'), ('09:30'), ('10:00'), ('10:30'), ('11:00'), ('11:30'), ('12:00'), ('12:30'),
    ('13:00'), ('13:30'), ('14:00'), ('14:30'), ('15:00'), ('15:30'), ('16:00'), ('16:30')) x(v)
), b AS (
  SELECT id,
         CAST(scheduled_at AS time(0)) t,
         TIMEFROMPARTS(DATEPART(hour, scheduled_at), (DATEPART(minute, scheduled_at) / 30) * 30, 0, 0, 0) f
    FROM dbo.om_bookings
   WHERE scheduled_at IS NOT NULL AND time_slot IS NULL
), e AS (
  SELECT b.id, b.f,
         COALESCE((SELECT TOP 1 CAST(c.end_time AS time(0)) FROM dbo.om_slot_config c
                    WHERE c.start_time <= b.t AND b.t < c.end_time ORDER BY c.end_time),
                  DATEADD(minute, 30, b.f)) e
    FROM b
)
UPDATE bk SET time_slot = x.js
  FROM dbo.om_bookings bk
  JOIN (SELECT e.id, '["' + STRING_AGG(CONVERT(char(5), hs.s, 108), '","') WITHIN GROUP (ORDER BY hs.s) + '"]' js
          FROM e JOIN hs ON hs.s >= e.f AND hs.s < e.e
         GROUP BY e.id) x ON x.id = bk.id;
GO
