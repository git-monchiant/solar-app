# Lead SLA Timeline

## Goal

เพิ่ม SLA Timeline ในแท็บ Timeline ของ Lead เพื่อให้เห็นงานตาม SLA ทั้งกระบวนการควบคู่กับ milestone และ Activity Timeline เดิม

## Scope

- เพิ่ม API ราย Lead ที่คืน SLA ทั้งงานปัจจุบัน งานสำเร็จ งานยกเลิก และประวัติการติดตาม
- จัดกลุ่ม SLA ตาม Lead Management, Pre-Survey, Survey, Proposal, Order, Installation และ After Sales
- แสดง SLA, กำหนดเสร็จ, เวลาที่ใช้จริง, ผู้รับผิดชอบ และสถานะ
- แยกสถานะสำเร็จในเวลา, สำเร็จเกินเวลา, ใกล้กำหนด, เกินกำหนด และยังไม่เริ่มด้วยสีที่อ่านง่าย
- รองรับ desktop/mobile และพับ–ขยายแต่ละกลุ่ม
- คง milestone Timeline และ Activity Timeline เดิมไว้

## Implementation

1. เพิ่ม route `/api/leads/[id]/sla` พร้อมตรวจ Active Role และ sync milestone ก่อนอ่านข้อมูล
2. เพิ่ม component `LeadSlaTimeline` สำหรับจัดกลุ่ม คำนวณเวลา และแสดงผล
3. เชื่อม component เข้าด้านบนของแท็บ Timeline และ refresh พร้อมข้อมูล Lead
4. ตรวจ TypeScript, ESLint, SLA tests, production build และ API/UI บน Development

## Layout refinement

- รวม SLA เข้าในกรอบ Timeline เดิมและวางใต้กลุ่ม Pre-Survey, Survey, Quotation, Order, Install และ Warranty / After Sales
- ใช้ตัวนับเดียวต่อกลุ่มเพื่อรวม milestone และ SLA ที่เสร็จแล้ว ลดพื้นที่และหัวข้อซ้ำ
- แสดง SLA เป็นรายการบนเส้น Timeline เดียวกับ milestone โดยไม่มีกล่องหรือตาราง SLA แยกภายในกลุ่ม

## Rollback

- Source backup: `C:\Project\_backups\Solar-V0\20260817-lead-sla-timeline-preimplementation`
- Git baseline: commit `0e9ad97`
- งานนี้ไม่มี schema migration

## Status

done

## Data correctness refinements (2026-08-18)

- เรียง SLA และ milestone ภายในแต่ละขั้นตามเวลาเกิดจริง โดยมีกติกาสำรองเมื่อเวลาเท่ากัน
- แยกเวลาเปิดเอกสาร Pre-Survey ออกจากเวลานัดสำรวจจริง เพื่อไม่ให้ BOOK_SURVEY แสดง 0 นาทีผิด
- ปิด FIRST_CONTACT ด้วยกิจกรรมติดต่อครั้งแรก และใช้เวลานัดสำรวจเป็นหลักฐานสำรองเฉพาะเมื่อไม่มีกิจกรรมติดต่อ
- แสดงวันที่พร้อมเวลาใน milestone ทุกขั้น โดยใช้ช่วงเวลานัดหมายเมื่อมี และระบุว่าไม่พบเวลาแทนการแสดง 00:00 จากข้อมูลชนิด DATE
- แสดง Activity “กำหนด Grade” จาก Customer Info พร้อมเกรดเดิม→ใหม่ เหตุผล ผู้ดำเนินการ และเวลาบันทึก
- แสดง “กำหนด Grade Lead” เป็น milestone ใน Pre-Survey Timeline ด้วย; Grade รุ่นใหม่ใช้เวลาจริงจาก Activity และ Grade เก่าที่ไม่มี audit แสดงสถานะปัจจุบันพร้อมระบุว่าไม่มีประวัติเวลา
