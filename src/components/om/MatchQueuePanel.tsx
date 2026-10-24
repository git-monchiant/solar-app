"use client";

// ห่อหน้าคิวจับคู่ให้เอามาแสดงเป็นแท็บในหน้าตั้งค่าได้ (ผู้ใช้เคาะ 9 ก.ย. 69 "ไม่อยากเพิ่มเมนู")
// หน้า /om/match-queue ยังอยู่เหมือนเดิม — ปุ่มในแถบ sync ของหน้าบ้านยังลิงก์ไปที่นั่นได้ต่อ
import MatchQueuePage from "@/app/(app)/om/match-queue/page";

export default function MatchQueuePanel() {
  return <MatchQueuePage />;
}
