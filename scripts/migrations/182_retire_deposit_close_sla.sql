-- 182: ถอด SLA DEPOSIT_CLOSE ("ติดตามปิดการขายและรับมัดจำ") ตามคำสั่งผู้ใช้
--
-- ไม่อยู่ในตาราง SLA ที่บริษัทกำหนด ข้อ 6 ชำระมัดจำ 20% ของตารางคือ
-- PAYMENT_INSTALLMENT_1 (7 วัน) / LOAN_PREAPPROVAL (15 วัน) ส่วน DEPOSIT_CLOSE
-- นับ 3 วันนับจากเข้า Order ซึ่งเป็นกติกาที่ไม่มีใครกำหนด
--
-- ทำแบบเดียวกับ 165 (ถอด AFTER_SALES): ปิด policy และยกเลิกงานทุกแถว งานจึงหายจาก
-- แท็บ SLA Tracking ชิปนับบนหน้า Today/Pipeline Dashboard และแถบ "เคยเกิน SLA"
-- บนการ์ดพร้อมกัน engine ไม่สร้างงานนี้อีกแล้ว (src/lib/sla-service.ts)
--
-- Forward-only และรันซ้ำได้

SET NOCOUNT ON;
SET XACT_ABORT ON;

UPDATE dbo.sla_policies SET is_active=0, updated_at=GETDATE()
WHERE policy_code='DEPOSIT_CLOSE' AND is_active=1;

DECLARE @cancelled TABLE (id BIGINT, lead_id INT, old_status NVARCHAR(30));

UPDATE si
SET status='cancelled',
    -- เวลาที่รับมัดจำเป็นข้อเท็จจริงเก็บไว้ ส่วนคำตัดสินว่าเกินกำหนดเป็นของ policy
    -- ที่ถูกถอด จึงถอนออกไปพร้อมกัน
    breached_at=NULL,
    context_json=JSON_MODIFY(COALESCE(si.context_json,'{}'),'$.retiredBy','deposit_close_retired'),
    updated_at=GETDATE()
OUTPUT INSERTED.id, INSERTED.lead_id, DELETED.status INTO @cancelled
FROM dbo.lead_sla_instances si
WHERE si.policy_code='DEPOSIT_CLOSE' AND si.status<>'cancelled';

INSERT dbo.lead_sla_events(sla_instance_id,lead_id,event_type,event_key,from_status,to_status,event_at,detail_json)
SELECT c.id,c.lead_id,'cancelled',CONCAT('sla-cancelled:',c.id,':policy-retired'),c.old_status,'cancelled',GETDATE(),
       N'{"reason":"policy_retired","policyCode":"DEPOSIT_CLOSE","migration":182}'
FROM @cancelled c
WHERE NOT EXISTS (SELECT 1 FROM dbo.lead_sla_events e WHERE e.event_key=CONCAT('sla-cancelled:',c.id,':policy-retired'));
