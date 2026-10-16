"use client";

import { useState } from "react";
import { OM_FIELDS, type OmParams } from "@/lib/b2b/boq-om";

// กล่องช่องตั้งค่า O&M ในหมวด 13 ของหน้าทำ BOQ — แบบช่องตั้งค่าบนหัวหมวด 13 ของไฟล์ Excel (แผน 20261016-03)
// แก้ช่องแล้วจำนวนบรรทัดสูตรเปลี่ยนทันที (หน้าแม่คิดด้วย omQty) · บันทึกแล้ว server คิดซ้ำ

/** ช่องตัวเลข — เก็บข้อความที่พิมพ์ไว้เองระหว่างแก้ (ลบจนว่างได้ ไม่เด้งกลับเป็น 0) แบบช่องปริมาณในตาราง */
function NumInput({ value, decimal, onChange, disabled }: { value: number; decimal?: boolean; onChange: (n: number) => void; disabled: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input type="number" min={0} step={decimal ? "0.1" : "1"} inputMode={decimal ? "decimal" : "numeric"} disabled={disabled}
      className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-right text-sm tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-gray-50 disabled:text-gray-600"
      value={draft ?? String(value)}
      onFocus={(e) => e.target.select()}
      onChange={(e) => { setDraft(e.target.value); const n = Number(e.target.value); onChange(e.target.value === "" || !Number.isFinite(n) ? 0 : n); }}
      onBlur={() => setDraft(null)} />
  );
}

export default function OmPanel({ params, readOnly, missing, onChange, onAddSet }: {
  params: OmParams | null;
  readOnly: boolean;
  /** บรรทัดสูตรที่ยังไม่มีในใบ (จาก 10 บรรทัด) */
  missing: number;
  onChange: (p: OmParams) => void;
  onAddSet: () => void;
}) {
  const addBtn = !readOnly && missing > 0 && (
    <button type="button" onClick={onAddSet} style={{ minHeight: 0 }}
      className="h-8 rounded-lg border border-primary/30 bg-white px-3 text-xs font-semibold text-primary hover:bg-primary/5">
      {params ? `+ ใส่รายการ O&M ที่ขาด (${missing})` : "+ ใส่รายการ O&M ครบชุด"}
    </button>
  );

  if (!params) {
    if (readOnly) return null;
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-primary/5 px-4 py-2.5">
        <span className="text-xs text-gray-600">คิดค่า O&amp;M จากปี · ครั้งต่อปี · คน · วัน · ระยะทาง แบบไฟล์ Excel — จำนวนทุกบรรทัดคิดให้</span>
        <span className="ml-auto">{addBtn}</span>
      </div>
    );
  }

  const set = (patch: Partial<OmParams>) => onChange({ ...params, ...patch });
  return (
    <div className="border-b border-gray-200 bg-primary/5 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-gray-700">ช่องตั้งค่า O&amp;M</span>
        <span className="text-xxs text-gray-400">จำนวนในหมวดนี้คิดจากช่องเหล่านี้ · ราคาต่อหน่วยจาก Master</span>
        {params.distance_km === 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xxs font-semibold text-amber-800">ยังไม่ใส่ระยะทาง — ค่าเดินทางเป็น 0</span>}
        <span className="ml-auto">{addBtn}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-4 xl:grid-cols-8">
        {OM_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-0.5 block truncate text-xxs font-semibold text-gray-500" title={f.label}>{f.label} ({f.unit})</span>
            <NumInput value={params[f.key]} decimal={f.decimal} disabled={readOnly} onChange={(n) => set({ [f.key]: n } as Partial<OmParams>)} />
          </label>
        ))}
      </div>
      <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-700">
        <input type="checkbox" checked={params.out_of_area} disabled={readOnly} onChange={(e) => set({ out_of_area: e.target.checked })} />
        โครงการต่างพื้นที่ — คิดค่าที่พัก (คืนพักแรม) และเบี้ยเลี้ยง · ในพื้นที่ = ไป-กลับวันเดียว ไม่คิด
      </label>
    </div>
  );
}
