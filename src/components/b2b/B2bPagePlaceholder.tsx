"use client";

import Header from "@/components/layout/Header";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import { hasRole, useActiveRoles, type Role } from "@/lib/roles";

// เปลือกหน้าของโมดูล BOQ ช่วงเฟส 1 (แผน docs/plan/20261005-01-b2b-boq-module.md)
// หัวเรื่อง = ชื่อเมนู (กติกา ui-rules) · ตรวจ role ที่สวมอยู่ — คนเปิด URL ตรงโดยไม่มีสิทธิ์เห็นข้อความแทนเนื้อหา
// role โหลดไม่เสร็จ (activeRoles ยังว่าง) ยังไม่ตัดสิน กันข้อความ "ไม่มีสิทธิ์" กะพริบตอนเปิดหน้า

export default function B2bPagePlaceholder({ fallbackTitle, roles, phase, points }: {
  fallbackTitle: string;
  roles: Role[];
  phase: string;
  points: string[];
}) {
  const { item } = useActiveMenuItem();
  const { activeRoles } = useActiveRoles();
  const denied = activeRoles.length > 0 && !hasRole(activeRoles, ...roles);

  return (
    <div>
      <Header title={item?.label ?? fallbackTitle} subtitle="COMMERCIAL (B2B)" />
      <main className="p-3 md:p-6 max-w-[900px]">
        {denied ? (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            role ที่กำลังใช้งานไม่มีสิทธิ์เปิดหน้านี้
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
            <div className="text-xs font-bold uppercase tracking-widest text-teal-700">กำลังพัฒนา · {phase}</div>
            <ul className="mt-3 space-y-1.5 text-sm text-gray-600 list-disc pl-5">
              {points.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
