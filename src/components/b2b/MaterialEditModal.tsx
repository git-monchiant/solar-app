"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import Dropdown from "@/components/ui/Dropdown";
import { XIcon } from "@/components/ui/icons";
import {
  PRICE_BASIS, allowedBases, defaultBasis, formatPrice, priceSuffix,
  type B2bCategory, type B2bMaterial, type MaterialFields,
} from "@/lib/b2b/materials";

// ป๊อปอัปเพิ่ม/แก้ข้อมูลรายการ Master — โครงยกจากหน้าจัดการ Package O&M (หัว · fieldset · ปุ่มท้าย + สวิตช์สถานะ)
// ราคาไม่อยู่ในฟอร์มนี้ (Purchase ใส่ในตาราง) — แสดงราคาปัจจุบันให้ดูอย่างเดียว
// viewOnly = Purchase เปิดดู (fieldset ปิดทั้งก้อน)

type Draft = MaterialFields & { id?: number; code?: string };

const blank = (category_id: number): Draft => ({
  category_id, subgroup: null, name: "", brand: null, model: null, spec_watt: null, unit: "",
  price_basis: defaultBasis(category_id), warranty: null, note: null, sort_order: 0, is_active: true,
});

// จำนวนการ์ดแบบราคา → คอลัมน์ (class เต็มให้ Tailwind สแกนเจอ) — ทุกแถวเต็ม ไม่มีการ์ดค้างเดี่ยว
const BASIS_GRID: Record<number, string> = { 1: "", 2: "md:grid-cols-2", 3: "md:grid-cols-3" };

// วัตต์ที่พิมพ์อยู่ในชื่อรุ่น ("Jinko Solar 700W" → 700) — ไว้เตือนเมื่อไม่ตรงกับช่องวัตต์ต่อแผงที่ใช้คิดต้นทุนจริง
const wattFromModel = (model: string | null) => {
  const m = /(\d+(?:\.\d+)?)\s*W(?!p)\b/i.exec(model ?? "");
  return m ? Number(m[1]) : null;
};

const sameText = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim() === (b ?? "").trim();

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

  // แบบราคาผูกกับหมวด — ย้ายไปหมวดที่ไม่รองรับแบบเดิม สลับเป็นแบบหลักของหมวดใหม่ให้เลย
  // (ถ้ามีราคาอยู่แล้ว กล่องเตือน "ราคาเดิมจะเปลี่ยนความหมาย" ด้านล่างจะขึ้นเอง)
  const bases = PRICE_BASIS.filter((b) => allowedBases(d.category_id).includes(b.key));
  const allBases = bases.length === PRICE_BASIS.length;
  const changeCategory = (category_id: number) =>
    setD((x) => ({ ...x, category_id, price_basis: allowedBases(category_id).includes(x.price_basis) ? x.price_basis : defaultBasis(category_id) }));

  // ตัวเลือกพิมพ์ช่วย — หัวข้อย่อยของหมวดที่เลือก · หน่วยที่เคยใช้
  const subgroups = [...new Set(materials.filter((m) => m.category_id === d.category_id && m.subgroup).map((m) => m.subgroup as string))];
  const units = [...new Set(materials.map((m) => m.unit).filter(Boolean))];

  // ลำดับในหมวด: ข้อมูลนำเข้าเรียง 10, 20, 30… — รายการใหม่/ย้ายหมวดหรือหัวข้อย่อย ต้องต่อท้ายหัวข้อย่อยของตัวเอง
  // (ถ้าปล่อย 0 จะไปโผล่บนสุดของหมวด และหัวข้อย่อยในตารางแตกเป็นสองก้อน)
  const placeSort = () => {
    const peers = materials.filter((m) => m.category_id === d.category_id && m.id !== d.id);
    const same = peers.filter((m) => sameText(m.subgroup, d.subgroup));
    const base = same.length > 0 ? same : peers;
    return base.length > 0 ? Math.max(...base.map((m) => m.sort_order)) + 1 : 10;
  };

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const moved = !initial || initial.category_id !== d.category_id || !sameText(initial.subgroup, d.subgroup);
      const body = JSON.stringify({ ...d, sort_order: moved ? placeSort() : d.sort_order });
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

  // ราคาที่ Purchase ใส่ไว้ผูกกับแบบราคา + หน่วยเดิม — เปลี่ยนแล้วตัวเลขเดิมจะถูกอ่านเป็นความหมายใหม่ทันที ต้องเตือน
  const priced = initial?.unit_price != null;
  const oldSuffix = initial ? priceSuffix(initial.price_basis, initial.unit) : "";
  const newSuffix = priceSuffix(d.price_basis, d.unit.trim());
  const priceMeaningChanged = !!initial && priced && (initial.price_basis !== d.price_basis || oldSuffix !== newSuffix);
  const modelWatt = wattFromModel(d.model);
  const wattMismatch = d.price_basis === "watt" && modelWatt != null && d.spec_watt != null && modelWatt !== d.spec_watt;

  const fieldCls = "w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm outline-none transition-colors hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-gray-50 disabled:text-gray-600 disabled:hover:border-gray-200 disabled:cursor-default";
  const labelCls = "block text-xs font-semibold text-gray-500 mb-1";
  const sectionTitle = "text-xs font-bold text-gray-800";
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
            {/* รหัส + ชื่อ/รุ่นเดิม — หลายแถวชื่อเหมือนกัน ("PV Module") ต้องเห็นว่ากำลังแก้ตัวไหน */}
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {initial ? `รหัส ${initial.code} · ${initial.name}${initial.model ? ` · ${initial.model}` : ""}` : "รายการใหม่เริ่มที่ \"รอราคา\" จนกว่า Purchase จะใส่ราคา"}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ minHeight: 0 }} className="w-9 h-9 shrink-0 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
            <XIcon className="w-5 h-5 text-gray-500" strokeWidth={2} />
          </button>
        </div>

        <fieldset disabled={viewOnly} className="min-w-0 p-4 md:p-6 space-y-4 bg-slate-50/50">
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className={`${sectionTitle} mb-3`}>รายการ</div>
            <div className="grid gap-3 md:grid-cols-12">
              <div className="md:col-span-7">
                <label className={labelCls}>หมวด {req}</label>
                <Dropdown searchable disabled={viewOnly} value={String(d.category_id)} onChange={(v) => { if (v) changeCategory(Number(v)); }}
                  options={categories.map((c) => ({ value: String(c.id), label: `${c.id}. ${c.name}${c.is_addon ? " (ส่วนเพิ่มเติม)" : ""}` }))} />
              </div>
              <div className="md:col-span-5">
                <label className={labelCls}>หัวข้อย่อย</label>
                <input list="b2b-subgroups" value={d.subgroup ?? ""} onChange={(e) => set({ subgroup: e.target.value || null })}
                  placeholder={subgroups.length > 0 ? `เช่น ${subgroups.slice(0, 2).join(", ")}` : "ไม่บังคับ"} className={fieldCls} />
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
            <div className={`${sectionTitle} mb-1`}>แบบราคา {req}</div>
            <p className="text-xs text-gray-400 mb-3">
              กำหนดว่าราคาที่ Purchase ใส่ คิดเป็นต้นทุนในใบ BOQ อย่างไร
              {bases.length < PRICE_BASIS.length && <> · {bases.length === 1 ? "หมวดนี้ใช้แบบเดียว" : `หมวดนี้เลือกได้ ${bases.length} แบบ`}</>}
            </p>
            {/* แสดงเฉพาะแบบที่หมวดนี้ใช้ (CATEGORY_PRICE_BASES) · ครบ 5 แบบ = แถวบนคิดตามปริมาณ 3 · แถวล่างคิดเป็น % 2 */}
            <div className={`grid gap-2 ${allBases ? "md:grid-cols-6" : (BASIS_GRID[bases.length] ?? "md:grid-cols-2")}`}>
              {bases.map((b) => (
                <button key={b.key} type="button" onClick={() => set({ price_basis: b.key })} aria-pressed={d.price_basis === b.key}
                  className={`${allBases ? (b.key.startsWith("pct") ? "md:col-span-3" : "md:col-span-2") : ""} text-left rounded-lg border px-3 py-2 transition-colors ${d.price_basis === b.key ? "border-primary bg-primary/5" : "border-gray-200 bg-white hover:border-gray-300"} disabled:cursor-default`}>
                  <div className={`text-sm font-semibold ${d.price_basis === b.key ? "text-primary" : "text-gray-800"}`}>{b.label}</div>
                  <div className="text-xs text-gray-500">{b.hint}</div>
                </button>
              ))}
            </div>
            {d.price_basis === "watt" && (
              <div className="mt-3 max-w-xs">
                <label className={labelCls}>วัตต์ต่อแผง (W) {req}</label>
                <input type="number" value={d.spec_watt ?? ""} onChange={(e) => set({ spec_watt: e.target.value === "" ? null : Number(e.target.value) })} placeholder="เช่น 730" className={`text-right ${fieldCls}`} />
                {wattMismatch && <p className="mt-1 text-xs text-amber-700">⚠ รุ่นระบุ {modelWatt} W แต่ช่องนี้ {d.spec_watt} W — ต้นทุนคิดจากช่องนี้</p>}
              </div>
            )}
            {initial && (
              <div className="mt-3 text-sm text-gray-600">
                ราคาปัจจุบัน: <span className={`font-mono font-semibold ${priced ? "text-gray-900" : "text-red-600"}`}>{formatPrice(initial.unit_price)}</span>
                {priced && <span className="text-gray-400"> {oldSuffix}</span>}
                <span className="text-xs text-gray-400"> · ใส่/ปรับโดย Purchase</span>
              </div>
            )}
            {priceMeaningChanged && (
              <p className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                ⚠ เปลี่ยนแบบราคา/หน่วยแล้ว ราคาเดิม {formatPrice(initial?.unit_price)} {oldSuffix} จะกลายเป็น {formatPrice(initial?.unit_price)} {newSuffix} — แจ้ง Purchase ให้ตรวจราคาหลังบันทึก
              </p>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <label htmlFor="b2b-material-note" className={`block ${sectionTitle} mb-3`}>หมายเหตุ</label>
            <textarea id="b2b-material-note" value={d.note ?? ""} onChange={(e) => set({ note: e.target.value || null })} rows={2}
              placeholder="เช่น ราคาอ้างอิงใบเสนอ supplier · ลบ ⚠ ออกเมื่อตรวจข้อมูลแล้ว"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm outline-none transition-colors hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-gray-50 disabled:text-gray-600" />
          </section>
        </fieldset>

        {/* ปุ่มท้าย — ยกจาก Package O&M: สวิตช์สถานะซ้าย · ยกเลิก/บันทึกขวา · ป้าย ACTIVE/INACTIVE ชุดเดียวกับตาราง */}
        <div className="px-6 py-3 border-t border-gray-100 flex items-center gap-3 flex-wrap rounded-b-2xl">
          {viewOnly ? (
            <>
              <span className={`text-xs font-bold uppercase px-3 py-1.5 rounded-full ${d.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                {d.is_active ? "ACTIVE" : "INACTIVE"}
              </span>
              <button type="button" onClick={onClose} className="ml-auto h-9 px-6 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">ปิด</button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5" title="ปิด = เลือกใส่ BOQ ใหม่ไม่ได้ แต่ BOQ เก่ายังอ้างได้">
                <button type="button" role="switch" aria-checked={d.is_active} aria-label="สถานะใช้งาน" onClick={() => set({ is_active: !d.is_active })}
                  className={`relative rounded-full transition-colors ${d.is_active ? "bg-emerald-500" : "bg-gray-300"}`}
                  style={{ width: "44px", height: "24px", minWidth: "44px", minHeight: "24px" }}>
                  <span className="absolute rounded-full bg-white shadow-sm transition-all"
                    style={{ width: "18px", height: "18px", top: "3px", left: d.is_active ? "23px" : "3px" }} />
                </button>
                <span className={`text-sm font-bold uppercase ${d.is_active ? "text-emerald-700" : "text-gray-500"}`}>{d.is_active ? "ACTIVE" : "INACTIVE"}</span>
                {!d.is_active && <span className="max-md:hidden text-xs text-gray-400">เลือกใส่ BOQ ใหม่ไม่ได้ · BOQ เก่ายังอ้างได้</span>}
              </div>
              {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={onClose} className="h-9 px-5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">ยกเลิก</button>
                <button type="button" onClick={() => void save()} disabled={saving}
                  className="h-9 px-6 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50">
                  {saving ? "กำลังบันทึก…" : "บันทึก"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
