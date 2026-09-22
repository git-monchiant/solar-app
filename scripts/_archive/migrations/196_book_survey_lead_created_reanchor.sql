-- 196: ย้ายจุดเริ่มนับของงาน BOOK_SURVEY ที่ปิดไปแล้วกลับมาที่วันยืนยันรับค่าสำรวจ
--
-- migration 195 เปลี่ยนกติกาเป็น "นับจากได้รับค่าสำรวจ" แต่ตั้งใจไม่แตะแถวที่ปิดงานไปแล้ว
-- ผลคือแถวที่ปิดระหว่างวันที่ 14–22 ก.ย. 2569 (ช่วงที่ migration 181 มีผล) ยังตรึง
-- จุดเริ่มนับไว้ที่วันที่ Lead เข้าระบบ ทั้งที่ไม่มีนโยบายข้อไหนใช้กติกานั้นแล้ว
--
-- ผลที่ตามมาคือคำตัดสิน "ทัน / เกินกำหนด" ของงานเหล่านั้นผิด เช่น Lead 922 เข้าระบบ
-- 31 ก.ค. ยืนยันรับเงิน 22 ก.ย. 15:01 และนัดสำรวจสำเร็จ 15:11 — ใช้เวลาจริง 10 นาที
-- แต่ถูกนับเป็นเกินกำหนดเพราะวัดจากวันที่ Lead เข้าระบบ
--
-- วิธีแก้เหมือน migration 177 ทุกประการ: ยึด survey_ready_at เป็นจุดเริ่มนับ ถ้ามีการ
-- นัดหมายเกิดก่อนเงินเข้า ให้หนีบจุดเริ่มนับไว้ที่เวลาปิดงาน ระยะเวลาที่ใช้จะได้ไม่ติดลบ
--
-- ตัวเลขกติกามาจาก OPERATIONAL_SLA_MINUTES.BOOK_SURVEY ใน src/lib/sla-rules.ts
-- (target 1440 นาที · due 1440 นาที · เตือนล่วงหน้า 240 นาที = 20 ชั่วโมงหลังเริ่มนับ)
--
-- Forward-only และรันซ้ำได้ — รอบที่สองจะไม่พบแถวไหนเข้าเงื่อนไข เพราะ anchorSource
-- ของแถวที่แก้แล้วไม่ใช่ lead_created อีกต่อไป

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @changed TABLE(
  id BIGINT NOT NULL,
  lead_id INT NOT NULL,
  old_started_at DATETIME2 NOT NULL,
  new_started_at DATETIME2 NOT NULL,
  anchor_source NVARCHAR(50) NOT NULL
);

;WITH desired AS (
  SELECT si.id,
         CASE WHEN si.completed_at < l.survey_ready_at
              THEN si.completed_at ELSE l.survey_ready_at END AS started_at,
         CASE WHEN si.completed_at < l.survey_ready_at
              THEN N'appointment_before_payment' ELSE N'payment_confirmed' END AS anchor_source
  FROM dbo.lead_sla_instances si
  JOIN dbo.leads l ON l.id = si.lead_id
  WHERE si.policy_code = 'BOOK_SURVEY'
    AND si.status = 'completed'
    AND si.completed_at IS NOT NULL
    AND l.survey_ready_at IS NOT NULL
    AND ISNULL(JSON_VALUE(si.context_json, '$.anchorSource'), '') = 'lead_created'
)
UPDATE si
SET policy_version = 6,
    started_at = d.started_at,
    target_at = DATEADD(DAY, 1, d.started_at),
    due_at = DATEADD(DAY, 1, d.started_at),
    warning_at = DATEADD(HOUR, 20, d.started_at),
    breached_at = CASE WHEN si.completed_at > DATEADD(DAY, 1, d.started_at)
                       THEN si.completed_at ELSE NULL END,
    context_json = JSON_MODIFY(COALESCE(si.context_json, '{}'), '$.anchorSource', d.anchor_source),
    updated_at = GETDATE()
OUTPUT INSERTED.id, INSERTED.lead_id, DELETED.started_at, INSERTED.started_at, d.anchor_source
INTO @changed(id, lead_id, old_started_at, new_started_at, anchor_source)
FROM dbo.lead_sla_instances si
JOIN desired d ON d.id = si.id;

-- ประวัติต้องบอกได้ว่าแถวไหนถูกย้ายจุดเริ่มนับ จากเมื่อไรไปเมื่อไร และด้วยกติกาข้อไหน
INSERT dbo.lead_sla_events(
  sla_instance_id, lead_id, event_type, event_key, from_status, to_status, event_at, detail_json
)
SELECT c.id, c.lead_id, 'anchor_changed',
       CONCAT('sla-anchor-lead-created-correction:', c.id, ':',
              CONVERT(BIGINT, DATEDIFF_BIG(MILLISECOND, '19700101', c.new_started_at))),
       'completed', 'completed', GETDATE(),
       CONCAT(N'{"rule":"book_survey_lead_created_reanchor","anchorSource":"', c.anchor_source,
              N'","from":"', CONVERT(VARCHAR(33), c.old_started_at, 126),
              N'","to":"', CONVERT(VARCHAR(33), c.new_started_at, 126), N'"}')
FROM @changed c
WHERE NOT EXISTS(
  SELECT 1 FROM dbo.lead_sla_events e
  WHERE e.event_key = CONCAT('sla-anchor-lead-created-correction:', c.id, ':',
                             CONVERT(BIGINT, DATEDIFF_BIG(MILLISECOND, '19700101', c.new_started_at)))
);

SELECT COUNT(*) AS [แถวที่ย้ายจุดเริ่มนับ] FROM @changed;
