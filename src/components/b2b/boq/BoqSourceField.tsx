"use client";

import { useEffect, useMemo, useState } from "react";
import Dropdown from "@/components/ui/Dropdown";
import { apiFetch } from "@/lib/api";
import { formatTHB } from "@/lib/utils/formatters";

// ช่องเลือก "ใบต้นทาง" — ป๊อปอัปสร้าง BOQ (เริ่มจาก · แผน 20261016-02) และป๊อปอัปดึงหมวดจากใบอื่น (แผน 20261016-05)
// ตัวเลือก = ทุก Revision ของทุกเลขที่ (Rev ล่าสุดก่อน Rev เก่าต่อท้ายในเลขที่เดียวกัน) · ใบของโครงการเดียวกันขึ้นก่อน

export type BoqSourceRow = {
  id: number; doc_no: string; revision: number; is_latest: boolean; project_id: number | null; project_name: string;
  option_label: string | null; capacity_wp: number | null; margin_pct: number | null;
};

/** ผลคัดลอกจาก POST /api/b2b/boqs → ข้อความแจ้งหลังสร้าง (null = ไม่ได้คัดลอก) */
export const copiedMessage = (c: { lines: number; inactive: number; om_reset?: boolean } | null | undefined) =>
  c ? `คัดลอก ${c.lines} บรรทัด ใช้ราคาปัจจุบันใน Master${c.inactive ? ` · ${c.inactive} รายการปิดใช้งานใน Master แล้ว คงราคาเดิม` : ""}${c.om_reset ? " · ระยะทาง O&M เป็นของไซต์เดิม ตั้งเป็น 0 ให้กรอกใหม่" : ""}` : null;

export default function BoqSourceField({ projectId, value, onChange, labelCls, label = "เริ่มจาก", blankLabel = "ใบเปล่า — เลือกรายการเอง", excludeId, hint }: {
  projectId: number | null;
  value: string;
  onChange: (id: string, row: BoqSourceRow | null) => void;
  labelCls: string;
  label?: string;
  /** ตัวเลือกว่าง (null = ไม่มีตัวเลือกว่าง) */
  blankLabel?: string | null;
  /** ไม่ให้เลือกใบนี้ (ดึงหมวดเข้าใบตัวเอง) */
  excludeId?: number;
  hint?: string | null;
}) {
  const [rows, setRows] = useState<BoqSourceRow[] | null>(null);
  useEffect(() => {
    apiFetch("/api/b2b/boqs?all=1").then((r: BoqSourceRow[]) => setRows(r)).catch(() => setRows([]));
  }, []);

  const options = useMemo(() => {
    const list = (rows ?? []).filter((r) => r.id !== excludeId);
    const sorted = projectId == null ? list : [...list.filter((r) => r.project_id === projectId), ...list.filter((r) => r.project_id !== projectId)];
    return [
      ...(blankLabel ? [{ value: "", label: blankLabel }] : []),
      ...sorted.map((r) => ({
        value: String(r.id),
        label: [
          `${r.doc_no} Rev ${r.revision}${r.is_latest ? "" : " (Rev เก่า)"}`,
          r.option_label,
          r.capacity_wp ? `${formatTHB(r.capacity_wp / 1000, { decimals: 2 })} kWp` : null,
          r.project_id === projectId ? "โครงการนี้" : r.project_name,
        ].filter(Boolean).join(" · "),
      })),
    ];
  }, [rows, projectId, excludeId, blankLabel]);

  const defaultHint = "คัดลอกทุกบรรทัด + ส่วนเพิ่มเติม · ราคาดึงใหม่จาก Master ปัจจุบัน (ราคาใส่เองในหมวดเสริมคงเดิม)";
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <Dropdown searchable value={value} options={options} placeholder={rows ? (blankLabel ? "ใบเปล่า" : "เลือกใบ BOQ…") : "กำลังโหลด…"}
        onChange={(v) => onChange(v, rows?.find((r) => String(r.id) === v) ?? null)} />
      {value && hint !== null && <p className="mt-1 text-xs text-gray-400">{hint ?? defaultHint}</p>}
    </div>
  );
}
