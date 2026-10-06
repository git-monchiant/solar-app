"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import Dropdown from "@/components/ui/Dropdown";
import { XIcon } from "@/components/ui/icons";
import {
  PRICE_BASIS, formatPrice, priceSuffix,
  type B2bCategory, type B2bMaterial, type MaterialFields,
} from "@/lib/b2b/materials";

// ป๊อปอัปเพิ่ม/แก้ข้อมูลรายการ Master — โครงยกจากหน้าจัดการ Package O&M (หัว · fieldset · ปุ่มท้าย)
// ราคาไม่อยู่ในฟอร์มนี้ (Purchase ใส่ในตาราง) — แสดงราคาปัจจุบันให้ดูอย่างเดียว
// viewOnly = Purchase เปิดดู (fieldset ปิดทั้งก้อน)

type Draft = MaterialFields & { id?: number; code?: string };

const blank = (category_id: number): Draft => ({
  category_id, subgroup: null, name: "", brand: null, model: null, spec_watt: null, unit: "",
  price_basis: "unit", warranty: null, note: null, sort_order: 0, is_active: true,
});

export default function MaterialEditModal({ initial, defaultCategory, categories, materials, viewOnly, onClose, onSaved }: {
  initial: B2bMaterial | null;
  defaultCategory: number;
  categories: B2bCategory[];
  materials: B2bMaterial[];
  viewOnly: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<Draft>(() => (initial ? { ...initial } : blank(defaultCategory)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  // ตัวเลือกพิมพ์ช่วย — หัวข้อย่อยของหมวดที่เลือก · หน่วยที่เคยใช้
  const subgroups = [...new Set(materials.filter((m) => m.category_id === d.category_id && m.subgroup).map((m) => m.subgroup as string))];
  const units = [...new Set(materials.map((m) => m.unit).filter(Boolean))];

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const body = JSON.stringify(d);
      const headers = { "Content-Type": "application/json" };
      if (d.id) await apiFetch(`/api/b2b/materials/${d.id}`, { method: "PATCH", headers, body });
      else await apiFetch("/api/b2b/materials", { method: "POST", headers, body });
      onSaved();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setSaving(false);
    }
  };

  const fieldCls = "w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm outline-none transition-colors hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-gray-50 disabled:text-gray-600 disabled:hover:border-gray-200 disabled:cursor-default";
  const labelCls = "block text-xs font-semibold text-gray-500 mb-1";
  const req = <span className="text-red-500">*</span>;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-50 flex items-start justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/20 w-full max-w-3xl my-2">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900 truncate">
                {!d.id ? "เพิ่มรายการใหม่" : viewOnly ? "รายละเอียดรายการ" : "แก้ไขรายการ"}
              </h2>
              {viewOnly && (
                <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xxs font-bold text-gray-500">อ่านอย่างเดียว</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{d.code ? `รหัส ${d.code}` : "รายการใหม่เริ่มที่ \"รอราคา\" จนกว่า Purchase จะใส่ราคา"}</p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 shrink-0 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
            <XIcon className="w-5 h-5 text-gray-500" strokeWidth={2} />
          </button>
        </div>

        <fieldset disabled={viewOnly} className="min-w-0 p-4 md:p-6 space-y-4 bg-slate-50/50">
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-xs font-bold text-gray-800 mb-3">รายการ</div>
            <div className="grid gap-3 md:grid-cols-12">
              <div className="md:col-span-7">
                <label className={labelCls}>หมวด {req}</label>
                <Dropdown searchable disabled={viewOnly} value={String(d.category_id)} onChange={(v) => { if (v) set({ category_id: Number(v) }); }}
                  options={categories.map((c) => ({ value: String(c.id), label: `${c.id}. ${c.name}${c.is_addon ? " (ส่วนเพิ่มเติม)" : ""}` }))} />
              </div>
              <div className="md:col-span-5">
                <label className={labelCls}>หัวข้อย่อย</label>
                <input list="b2b-subgroups" value={d.subgroup ?? ""} onChange={(e) => set({ subgroup: e.target.value || null })} placeholder="เช่น End Clamp, Rail" className={fieldCls} />
                <datalist id="b2b-subgroups">{subgroups.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
              <div className="md:col-span-12">
                <label className={labelCls}>ชื่อรายการ {req}</label>
                <input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="เช่น PV Module, ค่าทำแบบแปลน" className={fieldCls} />
              </div>
              <div className="md:col-span-5">
                <label className={labelCls}>ยี่ห้อ</label>
                <input value={d.brand ?? ""} onChange={(e) => set({ brand: e.target.value || null })} placeholder="เช่น Trina Solar, Huawei" className={fieldCls} />
              </div>
              <div className="md:col-span-7">
                <label className={labelCls}>รุ่น / ขนาด</label>
                <input value={d.model ?? ""} onChange={(e) => set({ model: e.target.value || null })} placeholder="เช่น SUN2000-150K-MG0, CV-FD 1Cx16 Sq.mm." className={fieldCls} />
              </div>
              <div className="md:col-span-4">
                <label className={labelCls}>หน่วย {req}</label>
                <input list="b2b-units" value={d.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="เช่น Set., m., Pcs, Lot." className={fieldCls} />
                <datalist id="b2b-units">{units.map((u) => <option key={u} value={u} />)}</datalist>
              </div>
              <div className="md:col-span-8">
                <label className={labelCls}>รับประกัน</label>
                <input value={d.warranty ?? ""} onChange={(e) => set({ warranty: e.target.value || null })} placeholder="เช่น 10 ปี จากผู้ผลิต" className={fieldCls} />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-xs font-bold text-gray-800 mb-1">แบบราคา {req}</div>
            <p className="text-xs text-gray-400 mb-3">กำหนดว่าราคาที่ Purchase ใส่ คิดเป็นต้นทุนในใบ BOQ อย่างไร</p>
            <div className="grid gap-2 md:grid-cols-2">
              {PRICE_BASIS.map((b) => (
                <button key={b.key} type="button" onClick={() => set({ price_basis: b.key })}
                  className={`text-left rounded-lg border px-3 py-2 transition-colors ${d.price_basis === b.key ? "border-primary bg-primary/5" : "border-gray-200 bg-white hover:border-gray-300"} disabled:cursor-default`}>
                  <div className={`text-sm font-semibold ${d.price_basis === b.key ? "text-primary" : "text-gray-800"}`}>{b.label}</div>
                  <div className="text-xs text-gray-500">{b.hint}</div>
                </button>
              ))}
            </div>
            {d.price_basis === "watt" && (
              <div className="mt-3 max-w-xs">
                <label className={labelCls}>วัตต์ต่อแผง (W) {req}</label>
                <input type="number" value={d.spec_watt ?? ""} onChange={(e) => set({ spec_watt: e.target.value === "" ? null : Number(e.target.value) })} placeholder="เช่น 730" className={`text-right ${fieldCls}`} />
              </div>
            )}
            {d.id && (
              <div className="mt-3 text-sm text-gray-600">
                ราคาปัจจุบัน: <span className={`font-mono font-semibold ${initial?.unit_price == null ? "text-red-600" : "text-gray-900"}`}>{formatPrice(initial?.unit_price)}</span>
                {initial?.unit_price != null && <span className="text-gray-400"> {priceSuffix(d.price_basis, d.unit)}</span>}
                <span className="text-xs text-gray-400"> · ใส่/ปรับโดย Purchase</span>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <label className={labelCls}>หมายเหตุ</label>
            <textarea value={d.note ?? ""} onChange={(e) => set({ note: e.target.value || null })} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm outline-none transition-colors hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-gray-50 disabled:text-gray-600" />
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={d.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
              ใช้งานอยู่ (ปิด = เลือกใส่ BOQ ใหม่ไม่ได้ แต่ BOQ เก่ายังอ้างได้)
            </label>
          </section>
        </fieldset>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          {error && <div className="mr-auto text-sm text-red-600">{error}</div>}
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            {viewOnly ? "ปิด" : "ยกเลิก"}
          </button>
          {!viewOnly && (
            <button type="button" onClick={() => void save()} disabled={saving}
              className="h-9 px-5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50">
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
