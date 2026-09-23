"use client";

import type { ReactNode } from "react";

// เปลือกไทม์ไลน์กลาง — จัดกลุ่มตามวัน + หัวกลุ่ม + สถานะว่าง/กำลังโหลด
// ★ แยกออกมาจาก lead/detail/ActivityTimeline.tsx ตอนทำเฟส 3 ของแผน 20260922-01
//   เดิมฝั่งขายมีไทม์ไลน์อยู่ที่เดียวและผูกกับชนิดข้อมูลของ lead ทั้งก้อน
//   O&M จะใช้ด้วยต้องก๊อปโค้ดจัดกลุ่มไปอีกชุด — แก้ทีหลังก็เพี้ยนคนละที่
//   ⇒ ยกเฉพาะ "เปลือก" มาไว้ตรงกลาง ส่วนหน้าตาของแต่ละแถวเป็นของใครของมัน (renderItem)
//
// ★ ป้ายวันส่งเข้ามาได้ เพราะฝั่งขายใช้อังกฤษ (Today/Yesterday) ส่วน O&M เป็นไทยล้วน
//   ค่า default = ของเดิมฝั่งขายเป๊ะ ๆ เพื่อไม่ให้พฤติกรรมหน้า lead เปลี่ยนแม้แต่นิดเดียว

export interface TimelineEntry {
  id: number | string;
  created_at: string;
}

interface Props<T extends TimelineEntry> {
  items: T[];
  loading?: boolean;
  /** หน้าตาของ 1 แถว — isLast ใช้ตัดเส้นแนวตั้งของแถวสุดท้าย */
  renderItem: (item: T, isLast: boolean) => ReactNode;
  labels?: {
    today?: string;
    yesterday?: string;
    empty?: string;
    emptyHint?: string;
    /** locale ของหัวกลุ่มวันอื่น ๆ */
    locale?: string;
  };
  className?: string;
}

function groupByDate<T extends TimelineEntry>(items: T[], l: NonNullable<Props<T>["labels"]>) {
  const groups: Record<string, T[]> = {};
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const a of items) {
    const dateStr = new Date(a.created_at).toDateString();
    let label: string;
    if (dateStr === today) label = l.today ?? "Today";
    else if (dateStr === yesterday) label = l.yesterday ?? "Yesterday";
    else label = new Date(a.created_at).toLocaleDateString(l.locale ?? "en-US", { day: "numeric", month: "short" });

    if (!groups[label]) groups[label] = [];
    groups[label].push(a);
  }

  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

export default function Timeline<T extends TimelineEntry>({
  items, loading, renderItem, labels = {}, className = "px-4 py-4",
}: Props<T>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <div className="text-gray mb-1">{labels.empty ?? "No activities yet"}</div>
        <div className="text-xs text-gray/60">{labels.emptyHint ?? "Add your first note or log a call"}</div>
      </div>
    );
  }

  const groups = groupByDate(items, labels);

  return (
    <div className={className}>
      {groups.map((group) => (
        <div key={group.label}>
          <div className="text-xs font-semibold text-gray/50 uppercase tracking-wider mb-3">{group.label}</div>
          {group.items.map((item, i) => {
            const isLast = group === groups[groups.length - 1] && i === group.items.length - 1;
            return <div key={item.id}>{renderItem(item, isLast)}</div>;
          })}
        </div>
      ))}
    </div>
  );
}
