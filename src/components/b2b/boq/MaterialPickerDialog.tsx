"use client";

import { useMemo, useState } from "react";
import { formatPrice, priceSuffix, type B2bCategory, type B2bMaterial } from "@/lib/b2b/materials";

// ป๊อปอัปเลือกรายการจาก Master เข้าหมวดของใบ BOQ — เปลือกยกจาก PackagePickerDialog (ช่องค้นหา + จัดกลุ่ม หัวข้อย่อย)
// ต่างจากต้นแบบ: ติ๊กได้หลายรายการแล้วเพิ่มทีเดียว (ใบ BOQ มีหลายสิบบรรทัดต่อหมวด) · สลับดู "ทุกหมวด" ได้
export default function MaterialPickerDialog({ category, categories, materials, onPick, onAddNew, onClose }: {
  category: B2bCategory;
  categories: B2bCategory[];
  materials: B2bMaterial[];
  onPick: (items: B2bMaterial[]) => void;
  /** ไม่พบรายการ → เพิ่มเข้า Master (Solar B2B) — ขึ้น "รอราคา" จนกว่า Purchase จะใส่ */
  onAddNew: () => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [allCats, setAllCats] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const q = filter.trim().toLowerCase();

  const groups = useMemo(() => {
    const catName = new Map(categories.map((c) => [c.id, c.name]));
    const m = new Map<string, B2bMaterial[]>();
    for (const x of materials) {
      if (!x.is_active) continue;
      if (!allCats && x.category_id !== category.id) continue;
      if (q && ![x.code, x.name, x.brand, x.model, x.subgroup].some((v) => (v ?? "").toLowerCase().includes(q))) continue;
      const g = allCats ? `${x.category_id}. ${catName.get(x.category_id) ?? ""}${x.subgroup ? ` · ${x.subgroup}` : ""}` : (x.subgroup ?? "ทั่วไป");
      m.set(g, [...(m.get(g) ?? []), x]);
    }
    return [...m.entries()];
  }, [materials, categories, category.id, allCats, q]);

  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const add = () => onPick(materials.filter((m) => picked.has(m.id)));

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-900/40 p-4 pt-[6vh] backdrop-blur-sm">
      <div className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="shrink-0 border-b border-gray-100 p-3 space-y-2">
          <div className="text-sm font-bold text-gray-800">เลือกจาก Master → {category.id}. {category.name}</div>
          <div className="flex items-center gap-2">
            <input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && onClose()}
              placeholder="พิมพ์ค้นหา รหัส / รายการ / ยี่ห้อ / รุ่น…"
              className="h-10 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
            <label className="inline-flex shrink-0 items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={allCats} onChange={(e) => setAllCats(e.target.checked)} /> ทุกหมวด
            </label>
            <button type="button" onClick={onClose} aria-label="ปิด"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">×</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {groups.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">ไม่พบรายการ{allCats ? "" : "ในหมวดนี้ — ลองติ๊ก \"ทุกหมวด\""}</div>
          ) : groups.map(([g, items]) => (
            <div key={g} className="border-t border-gray-100 first:border-t-0">
              <div className="sticky top-0 z-10 bg-gray-50/95 px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-gray-500 backdrop-blur">{g}</div>
              {items.map((m) => (
                <label key={m.id} className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-primary/5 ${picked.has(m.id) ? "bg-primary/5" : ""}`}>
                  <input type="checkbox" checked={picked.has(m.id)} onChange={() => toggle(m.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-800">{m.name}{m.model ? <span className="font-normal text-gray-500"> · {m.model}</span> : null}</span>
                    <span className="text-xxs text-gray-400">{m.code}{m.brand ? ` · ${m.brand}` : ""} · หน่วย {m.unit}</span>
                  </span>
                  <span className={`shrink-0 text-sm font-bold tabular-nums ${m.unit_price == null ? "text-red-600" : "text-gray-700"}`}>
                    {formatPrice(m.unit_price)}{m.unit_price != null && <span className="ml-1 text-xxs font-normal text-gray-400">{priceSuffix(m.price_basis, m.unit)}</span>}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-gray-100 px-3 py-2.5">
          <button type="button" onClick={onAddNew} className="text-xs font-semibold text-primary hover:underline" style={{ minHeight: 0 }}>
            ไม่พบรายการ → เพิ่มเข้า Master
          </button>
          <span className="ml-auto text-xs text-gray-500">เลือก {picked.size} รายการ</span>
          <button type="button" onClick={add} disabled={picked.size === 0}
            className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-40">เพิ่มเข้าใบ</button>
        </div>
      </div>
    </div>
  );
}
