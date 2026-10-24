"use client";

// หน้าช่าง — ใบตรวจรับงาน / ใบบริการ (mockup 20260910_01)
// ★ เนื้อในย้ายไป components/om/JobFormPanel.tsx ตอนเฟส 3 (แผน 20260922-01)
//   เพราะหน้ารายละเอียดงานบริการเอาใบเดียวกันไปแสดงเป็นแท็บด้วย
//   ไฟล์นี้เหลือหน้าที่เดียว: แปลง params ของ route เป็น jobId แล้วส่งต่อ
// ★ route นี้ยังอยู่ที่เดิม — เมนู "เช็คลิสต์" (ผู้ใช้สั่ง 16 ก.ย. 69) และลิงก์เก่าไม่พัง

import { use } from "react";
import JobFormPanel from "@/components/om/JobFormPanel";

export default function FieldJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <JobFormPanel jobId={id} />;
}
