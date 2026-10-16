"use client";

import { useEffect, useMemo, useState } from "react";
import Dropdown from "@/components/ui/Dropdown";
import { apiFetch } from "@/lib/api";
import { formatTHB } from "@/lib/utils/formatters";

// ช่อง "เริ่มจาก" ในป๊อปอัปสร้าง BOQ — ใบเปล่า / คัดลอกจาก BOQ ใบอื่น (แผน 20261016-02)
// ใช้ทั้งป๊อปอัป "+ BOQ ขนาดใหม่" ของหน้าโครงการ และ "+ สร้าง BOQ" ของหน้ารายการ
// ตัวเลือก = Rev ล่าสุดของทุกเลขที่ (API รายการ BOQ) · ใบของโครงการเดียวกันขึ้นก่อน

export type BoqSourceRow = {
  id: number; doc_no: string; revision: number; project_id: number | null; project_name: string;
  option_label: string | null; capacity_wp: number | null; margin_pct: number | null;
};

/** ผลคัดลอกจาก POST /api/b2b/boqs → ข้อความแจ้งหลังสร้าง (null = ไม่ได้คัดลอก) */
export const copiedMessage = (c: { lines: number; inactive: number } | null | undefined) =>
  c ? `คัดลอก ${c.lines} บรรทัด ใช้ราคาปัจจุบันใน Master${c.inactive ? ` · ${c.inactive} รายการปิดใช้งานใน Master แล้ว คงราคาเดิม` : ""}` : null;

export default function BoqSourceField({ projectId, value, onChange, labelCls }: {
  projectId: number | null;
  value: string;
  onChange: (id: string, row: BoqSourceRow | null) => void;
  labelCls: string;
}) {
  const [rows, setRows] = useState<BoqSourceRow[] | null>(null);
  useEffect(() => {
    apiFetch("/api/b2b/boqs").then((r: BoqSourceRow[]) => setRows(r)).catch(() => setRows([]));
  }, []);

  const options = useMemo(() => {
    const list = rows ?? [];
    const sorted = projectId == null ? list : [...list.filter((r) => r.project_id === projectId), ...list.filter((r) => r.project_id !== projectId)];
    return [
      { value: "", label: "ใบเปล่า — เลือกรายการเอง" },
      ...sorted.map((r) => ({
        value: String(r.id),
        label: [
          `${r.doc_no} Rev ${r.revision}`,
          r.option_label,
          r.capacity_wp ? `${formatTHB(r.capacity_wp / 1000, { decimals: 2 })} kWp` : null,
          r.project_id === projectId ? "โครงการนี้" : r.project_name,
        ].filter(Boolean).join(" · "),
      })),
    ];
  }, [rows, projectId]);

  return (
    <div>
      <label className={labelCls}>เริ่มจาก</label>
      <Dropdown searchable value={value} options={options} placeholder={rows ? "ใบเปล่า" : "กำลังโหลด…"}
        onChange={(v) => onChange(v, rows?.find((r) => String(r.id) === v) ?? null)} />
      {value && (
        <p className="mt-1 text-xs text-gray-400">คัดลอกทุกบรรทัด + ส่วนเพิ่มเติม · ราคาดึงใหม่จาก Master ปัจจุบัน (ราคาใส่เองในหมวดเสริมคงเดิม)</p>
      )}
    </div>
  );
}
