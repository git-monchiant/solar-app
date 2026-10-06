"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import Dropdown from "@/components/ui/Dropdown";
import { ClockIcon } from "@/components/ui/icons";
import { apiFetch } from "@/lib/api";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatThaiDate } from "@/lib/utils/formatters";
import MaterialEditModal from "@/components/b2b/MaterialEditModal";
import PriceHistoryModal from "@/components/b2b/PriceHistoryModal";
import {
  B2B_MATERIAL_EDIT_ROLES, B2B_MATERIAL_VIEW_ROLES, B2B_PRICE_EDIT_ROLES,
  formatPrice, priceBasisLabel, priceSuffix,
  type B2bCategory, type B2bMaterial,
} from "@/lib/b2b/materials";

// Master Data วัสดุ (โมดูล BOQ) — แผน docs/plan/20261005-01-b2b-boq-module.md เฟส 2
// Solar B2B: เพิ่ม/แก้ข้อมูลรายการ (ราคาอ่านอย่างเดียว) · Purchase: ใส่ราคาในตารางต่อเนื่องหลายแถวแล้วบันทึกทีเดียว
// ตาราง (ไม่ใช่การ์ดแบบหน้า Package) เพราะรายการมีหลายร้อยแถว — จัดกลุ่ม หมวด → หัวข้อย่อย ตามไฟล์ Excel ต้นฉบับ

type StatusFilter = "all" | "pending" | "inactive";

export default function B2bMaterialsPage() {
  const { item } = useActiveMenuItem();   // หัวเรื่อง = ชื่อเมนู (กติกา ui-rules)
  const { activeRoles } = useActiveRoles();
  const canView = hasRole(activeRoles, ...B2B_MATERIAL_VIEW_ROLES);
  const canEditItem = hasRole(activeRoles, ...B2B_MATERIAL_EDIT_ROLES);
  const canEditPrice = hasRole(activeRoles, ...B2B_PRICE_EDIT_ROLES);

  const [categories, setCategories] = useState<B2bCategory[]>([]);
  const [materials, setMaterials] = useState<B2bMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [status, setStatus] = useState<StatusFilter | null>(null);   // null = ยังไม่ตั้ง (รอข้อมูลก่อนเลือกค่าเริ่มต้น)
  const [editing, setEditing] = useState<{ material: B2bMaterial | null } | null>(null);
  const [historyOf, setHistoryOf] = useState<B2bMaterial | null>(null);
  // ราคาที่ Purchase พิมพ์แต่ยังไม่บันทึก — key = id รายการ
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [priceNote, setPriceNote] = useState("");
  const [savingPrices, setSavingPrices] = useState(false);
  const [priceError, setPriceError] = useState("");

  const load = useCallback(() => {
    return apiFetch("/api/b2b/materials")
      .then((r: { categories: B2bCategory[]; materials: B2bMaterial[] }) => {
        setCategories(r.categories);
        setMaterials(r.materials);
        setLoadError("");
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  const pendingCount = materials.filter((m) => m.is_active && m.unit_price == null).length;
  const inactiveCount = materials.filter((m) => !m.is_active).length;
  const activeCount = materials.length - inactiveCount;

  // ค่าเริ่มต้น: Purchase ที่มีงานค้าง เปิดมาเจอ "รอราคา" ก่อน · คนอื่นเห็นทั้งหมด
  const effectiveStatus: StatusFilter = status ?? (canEditPrice && !canEditItem && pendingCount > 0 ? "pending" : "all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (effectiveStatus === "pending" && !(m.is_active && m.unit_price == null)) return false;
      if (effectiveStatus === "inactive" && m.is_active) return false;
      if (catFilter !== "all" && String(m.category_id) !== catFilter) return false;
      if (q && ![m.code, m.name, m.brand, m.model, m.subgroup].some((x) => (x ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [materials, effectiveStatus, catFilter, search]);

  const sections = categories
    .map((c) => ({ cat: c, items: filtered.filter((m) => m.category_id === c.id) }))
    .filter((s) => s.items.length > 0);

  const dirtyIds = Object.keys(drafts).map(Number).filter((id) => {
    const m = materials.find((x) => x.id === id);
    const v = drafts[id];
    return m && v.trim() !== "" && Number(v) !== m.unit_price;
  });

  const savePrices = async () => {
    setPriceError("");
    const items = dirtyIds.map((id) => ({ id, price: Number(drafts[id]) }));
    if (items.some((x) => !Number.isFinite(x.price) || x.price < 0)) {
      setPriceError("ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
      return;
    }
    setSavingPrices(true);
    try {
      await apiFetch("/api/b2b/materials/prices", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, note: priceNote }),
      });
      setDrafts({});
      setPriceNote("");
      await load();
    } catch (e) {
      setPriceError(e instanceof Error && e.message ? e.message : "บันทึกราคาไม่สำเร็จ");
    } finally {
      setSavingPrices(false);
    }
  };

  const toggleActive = async (m: B2bMaterial) => {
    if (!canEditItem) return;
    await apiFetch(`/api/b2b/materials/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !m.is_active }) });
    await load();
  };

  const title = item?.label ?? "Master Data วัสดุ";
  if (activeRoles.length > 0 && !canView) {
    return (
      <div>
        <Header title={title} subtitle="COMMERCIAL (B2B)" />
        <main className="p-3 md:p-6 max-w-[900px]">
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">role ที่กำลังใช้งานไม่มีสิทธิ์เปิดหน้านี้</div>
        </main>
      </div>
    );
  }
  if (loading) return <Loading />;

  const chip = (key: StatusFilter, label: string, n: number, tone = "") => (
    <button key={key} type="button" onClick={() => setStatus(key)} style={{ minHeight: 0 }}
      className={`h-8 px-3 rounded-full text-xs font-semibold border transition-colors ${effectiveStatus === key ? "bg-primary text-white border-primary" : `bg-white border-gray-200 hover:border-gray-300 ${tone || "text-gray-600"}`}`}>
      {label} <span className="ml-1 tabular-nums">{n}</span>
    </button>
  );

  return (
    <div className={dirtyIds.length > 0 ? "pb-28" : ""}>
      <Header title={title} subtitle={`COMMERCIAL (B2B) · ${activeCount} รายการ · รอราคา ${pendingCount}`} />

      <div className="p-3 md:p-6 space-y-4">
        {loadError && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{loadError}</div>}

        {/* Toolbar */}
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา รหัส / รายการ / ยี่ห้อ / รุ่น…"
            className="h-8 px-4 rounded-lg border border-gray-200 text-sm flex-1 min-w-[200px] focus:outline-none focus:border-primary" />
          <Dropdown className="w-full md:w-72" searchable value={catFilter} onChange={(v) => setCatFilter(v || "all")}
            options={[{ value: "all", label: "ทุกหมวด" }, ...categories.map((c) => ({ value: String(c.id), label: `${c.id}. ${c.name}` }))]} />
          <div className="flex items-center gap-1.5">
            {chip("all", "ทั้งหมด", materials.length)}
            {chip("pending", "รอราคา", pendingCount, pendingCount > 0 ? "text-red-600" : "")}
            {chip("inactive", "ปิดใช้งาน", inactiveCount)}
          </div>
          {canEditItem && (
            <button type="button" onClick={() => setEditing({ material: null })}
              className="h-8 px-5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors">+ เพิ่มรายการ</button>
          )}
        </div>

        {materials.length === 0 ? (
          <div className="rounded-xl bg-white border border-gray-300 px-5 py-10 text-center text-sm text-gray-400">
            ยังไม่มีรายการใน Master Data — ข้อมูลตั้งต้นจะนำเข้าจากไฟล์ Excel (sheet Unit price Material){canEditItem ? " หรือกด \"+ เพิ่มรายการ\"" : ""}
          </div>
        ) : sections.length === 0 ? (
          <div className="rounded-xl bg-white border border-gray-300 px-5 py-10 text-center text-sm text-gray-400">ไม่พบรายการตามเงื่อนไขที่เลือก</div>
        ) : sections.map(({ cat, items }) => (
          <section key={cat.id} className="rounded-xl bg-white border border-gray-300 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-baseline gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-gray-900">{cat.id}. {cat.name}</h2>
              {cat.is_addon && <span className="text-xxs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">ส่วนเพิ่มเติม</span>}
              <span className="text-xs font-mono text-gray-400">({items.length})</span>
            </div>
            <div className="overflow-x-auto">
              {/* table-fixed + ความกว้างคอลัมน์ตายตัว — ทุกหมวดเป็นตารางแยก คอลัมน์ต้องตรงกันทั้งหน้า */}
              <table className="w-full text-sm min-w-[1040px] table-fixed">
                <thead>
                  <tr className="text-left text-xs text-gray-500 bg-gray-50">
                    <th className="px-3 py-2 font-semibold w-[72px]">รหัส</th>
                    <th className="px-3 py-2 font-semibold">รายการ</th>
                    <th className="px-3 py-2 font-semibold w-[120px]">ยี่ห้อ</th>
                    <th className="px-3 py-2 font-semibold w-[200px]">รุ่น / ขนาด</th>
                    <th className="px-3 py-2 font-semibold w-[64px]">หน่วย</th>
                    <th className="px-3 py-2 font-semibold text-right w-[200px]">ราคา</th>
                    <th className="px-3 py-2 font-semibold w-[110px]">อัปเดตราคา</th>
                    <th className="px-3 py-2 w-[150px]" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((m, i) => {
                    const newSub = m.subgroup && m.subgroup !== items[i - 1]?.subgroup;
                    const draft = drafts[m.id];
                    const dirty = dirtyIds.includes(m.id);
                    return [
                      newSub ? (
                        <tr key={`sg-${m.id}`} className="bg-slate-50/70">
                          <td colSpan={8} className="px-3 py-1.5 text-xs font-bold text-gray-600">{m.subgroup}</td>
                        </tr>
                      ) : null,
                      <tr key={m.id} className={`border-t border-gray-100 align-middle ${!m.is_active ? "opacity-50" : ""} ${dirty ? "bg-amber-50" : ""}`}>
                        <td className="px-3 py-2 font-mono text-xs text-gray-500">{m.code}</td>
                        <td className="px-3 py-2 text-gray-900 break-words">{m.name}</td>
                        <td className="px-3 py-2 text-gray-600">{m.brand ?? ""}</td>
                        <td className="px-3 py-2 text-gray-600 break-words">{m.model ?? ""}{m.spec_watt ? <span className="text-gray-400"> · {m.spec_watt} W</span> : null}</td>
                        <td className="px-3 py-2 text-gray-600">{m.unit}</td>
                        <td className="px-3 py-1.5 text-right">
                          {canEditPrice && m.is_active ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <input type="number" inputMode="decimal" min={0} step="any"
                                value={draft ?? (m.unit_price ?? "")}
                                onChange={(e) => setDrafts((x) => ({ ...x, [m.id]: e.target.value }))}
                                placeholder="รอราคา"
                                className={`w-28 h-8 px-2 rounded-lg border text-right font-mono tabular-nums text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 ${m.unit_price == null && !dirty ? "border-red-300 placeholder:text-red-400" : "border-gray-200"}`} />
                              <span className="text-xxs text-gray-400 w-12 text-left">{priceSuffix(m.price_basis, m.unit)}</span>
                            </div>
                          ) : m.unit_price == null ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-semibold">รอราคา</span>
                          ) : (
                            <span className="font-mono tabular-nums text-gray-900">{formatPrice(m.unit_price)} <span className="text-xxs text-gray-400">{priceSuffix(m.price_basis, m.unit)}</span></span>
                          )}
                          {m.price_basis !== "unit" && <div className="text-xxs text-gray-400 mt-0.5">{priceBasisLabel(m.price_basis)}</div>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {m.price_updated_at ? <>{formatThaiDate(m.price_updated_at)}<div className="text-gray-400 truncate max-w-[9rem]">{m.price_updated_by_name ?? ""}</div></> : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <button type="button" title="ประวัติราคา" onClick={() => setHistoryOf(m)} style={{ minHeight: 0 }}
                              className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500">
                              <ClockIcon className="w-4 h-4" strokeWidth={2} />
                            </button>
                            <button type="button" onClick={() => setEditing({ material: m })} style={{ minHeight: 0 }}
                              className="text-sm text-primary font-semibold hover:underline">{canEditItem ? "แก้ไข" : "ดู"}</button>
                            {canEditItem && (
                              <button type="button" onClick={() => void toggleActive(m)} style={{ minHeight: 0 }}
                                className={`text-xxs font-bold uppercase px-2 py-1 rounded-full ${m.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                                {m.is_active ? "ACTIVE" : "INACTIVE"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>,
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      {/* แถบบันทึกราคาของ Purchase — โผล่เมื่อมีราคาที่แก้แต่ยังไม่บันทึก */}
      {canEditPrice && dirtyIds.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 md:left-56 z-40 border-t border-gray-200 bg-white/95 backdrop-blur px-3 md:px-6 py-3">
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">แก้ราคา {dirtyIds.length} รายการ</span>
            <input value={priceNote} onChange={(e) => setPriceNote(e.target.value)} placeholder="หมายเหตุ (ไม่บังคับ) เช่น ราคาใบเสนอ supplier ต.ค. 69"
              className="h-9 px-3 rounded-lg border border-gray-200 text-sm flex-1 min-w-[200px] focus:outline-none focus:border-primary" />
            {priceError && <span className="text-sm text-red-600">{priceError}</span>}
            <button type="button" onClick={() => { setDrafts({}); setPriceError(""); }} className="h-9 px-4 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">ยกเลิก</button>
            <button type="button" onClick={() => void savePrices()} disabled={savingPrices}
              className="h-9 px-5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50">
              {savingPrices ? "กำลังบันทึก…" : "บันทึกราคา"}
            </button>
          </div>
        </div>
      )}

      {editing && (
        <MaterialEditModal
          initial={editing.material}
          defaultCategory={catFilter !== "all" ? Number(catFilter) : 1}
          categories={categories}
          materials={materials}
          viewOnly={!canEditItem}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
      {historyOf && <PriceHistoryModal material={historyOf} onClose={() => setHistoryOf(null)} />}
    </div>
  );
}
