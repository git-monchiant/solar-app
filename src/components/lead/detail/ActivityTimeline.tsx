"use client";

// ไทม์ไลน์กิจกรรมของ lead — ตอนนี้เป็นตัวบางที่ครอบเปลือกกลาง ui/Timeline
// (แยกเปลือกออกไปตอนเฟส 3 แผน 20260922-01 เพื่อให้ O&M ใช้ตัวเดียวกันได้)
// ★ พฤติกรรมเดิมทุกอย่าง: ป้าย Today/Yesterday, วันที่แบบ en-US, ข้อความตอนว่าง

import ActivityItem, { Activity } from "./ActivityItem";
import Timeline from "@/components/ui/Timeline";

interface Props {
  activities: Activity[];
  loading: boolean;
}

export default function ActivityTimeline({ activities, loading }: Props) {
  return (
    <Timeline
      items={activities}
      loading={loading}
      renderItem={(a, isLast) => <ActivityItem activity={a} isLast={isLast} />}
    />
  );
}
