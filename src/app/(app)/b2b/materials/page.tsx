"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import Dropdown from "@/components/ui/Dropdown";
import { useDialog } from "@/components/ui/Dialog";
import { useUnsavedGuard } from "@/lib/hooks/useUnsavedGuard";
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

type StatusFilter = "all" | "pending" | "review" | "inactive";

// รายการที่สคริปต์นำเข้าจาก Excel ติดธง "⚠ ตรวจ: …" ไว้ (ระบบตัดสินใจแทนทีม) — ลบ ⚠ ออกจากหมายเหตุเมื่อตรวจแล้ว
const needsReview = (m: B2bMaterial) => m.is_active && (m.note ?? "").includes("⚠");

// รุ่นแผงส่วนใหญ่มีวัตต์ในชื่ออยู่แล้ว ("Jinko Solar 700W") — ต่อท้าย "· 700 W" เฉพาะรุ่นที่ไม่มี
const wattInModel = (m: B2bMaterial) =>
  m.spec_watt != null && (m.model ?? "").replace(/\s/g, "").toLowerCase().includes(`${m.spec_watt}w`);

// "บาท/หน่วย" กับ "บาท/W" อ่านจากหน่วยท้ายช่องได้เลย — แบบอื่น (Wp ระบบ / % สองแบบ) ต้องมีป้ายบอกใต้ราคา
const showBasisLabel = (m: B2bMaterial) => m.price_basis !== "unit" && m.price_basis !== "watt";

const statusPill = (active: boolean) =>
  `shrink-0 w-[72px] inline-flex justify-center whitespace-nowrap text-xxs font-bold uppercase py-1 rounded-full ${active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`;

export default function B2bMaterialsPage() {
  const { item } = useActiveMenuItem();   // หัวเรื่อง = ชื่อเมนู (กติกา ui-rules)
  const { activeRoles } = useActiveRoles();
  const canView = hasRole(activeRoles, ...B2B_MATERIAL_VIEW_ROLES);
  const canEditItem = hasRole(activeRoles, ...B2B_MATERIAL_EDIT_ROLES);
  const canEditPrice = hasRole(activeRoles, ...B2B_PRICE_EDIT_ROLES);
  const dialog = useDialog();

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
  const reviewCount = materials.filter(needsReview).length;

  // ค่าเริ่มต้น: Purchase ที่มีงานค้าง เปิดมาเจอ "รอราคา" ก่อน · คนอื่นเห็นทั้งหมด
  const effectiveStatus: StatusFilter = status ?? (canEditPrice && !canEditItem && pendingCount > 0 ? "pending" : "all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (effectiveStatus === "pending" && !(m.is_active && m.unit_price == null)) return false;
      if (effectiveStatus === "inactive" && m.is_active) return false;
      if (effectiveStatus === "review" && !needsReview(m)) return false;
      if (catFilter !== "all" && String(m.category_id) !== catFilter) return false;
      if (q && ![m.code, m.name, m.brand, m.model, m.subgroup, m.note].some((x) => (x ?? "").toLowerCase().includes(q))) return false;
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
  // ราคาที่พิมพ์ค้างไว้ — ออกจากหน้า (เมนู/ลิงก์/ปิดแท็บ) เตือนก่อน (ทบทวน BOQ 15 ต.ค.)
  const askLeave = useCallback(() => dialog.confirm({
    title: "ออกจากหน้านี้?", message: "มีราคาที่พิมพ์ไว้แต่ยังไม่บันทึก — ออกแล้วราคาที่พิมพ์จะหาย", confirmText: "ออกโดยไม่บันทึก", variant: "danger",
  }), [dialog]);
  useUnsavedGuard(dirtyIds.length > 0, askLeave);

  // desktop ค้าง 3 ชั้น: Header → toolbar → หัวหมวด + หัวคอลัมน์ — Header/toolbar ตัดบรรทัดตามจอ วัดสดไม่ใช้ค่า fix
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [hdrH, setHdrH] = useState(0);
  const [barH, setBarH] = useState(0);
  useEffect(() => {
    const hdr = rootRef.current?.firstElementChild as HTMLElement | null;   // Header = ลูกตัวแรกของหน้า (sticky top-0)
    const bar = barRef.current;
    if (!hdr || !bar) return;
    const ro = new ResizeObserver(() => { setHdrH(hdr.offsetHeight); setBarH(bar.offsetHeight); });
    ro.observe(hdr);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [loading]);

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

  // ปิดใช้ต้องยืนยันก่อน (กดพลาดแถวเดียว = รายการหายจากตัวเลือกของทุก BOQ ใหม่) · เปิดกลับไม่ต้องถาม
  const toggleActive = async (m: B2bMaterial) => {
    if (!canEditItem) return;
    if (m.is_active && !(await dialog.confirm({
      title: "ปิดใช้งานรายการนี้?",
      message: `${m.code} · ${m.name}\nปิดแล้วเลือกใส่ BOQ ใหม่ไม่ได้ แต่ BOQ เก่ายังอ้างได้ · เปิดกลับได้ภายหลัง`,
      variant: "danger", confirmText: "ปิดใช้งาน",
    }))) return;
    try {
      await apiFetch(`/api/b2b/materials/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !m.is_active }) });
      await load();
      dialog.toast(m.is_active ? `ปิดใช้งาน ${m.code} แล้ว` : `เปิดใช้งาน ${m.code} แล้ว`);
    } catch (e) {
      void dialog.alert({ title: "เปลี่ยนสถานะไม่สำเร็จ", message: e instanceof Error && e.message ? e.message : "ลองใหม่อีกครั้ง", variant: "danger" });
    }
  };

  const title = item?.label ?? "วัสดุและราคา";
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

  // เลื่อนทั้งหน้าแบบหน้าอื่น (scrollbar ปกติของหน้า) — เดิม desktop ตารางเลื่อนในกล่องของตัวเอง แถวโผล่ถูกตัดใต้ toolbar ผู้ใช้ไม่เอา (16 ต.ค. 69)
  // desktop: toolbar ค้างใต้ Header (พื้นขาวทึบ + ระยะห่างล่างอยู่ในตัว ไม่มีช่องให้แถวโผล่) · หัวหมวด + หัวคอลัมน์ค้างใต้ toolbar
  //   กล่องตารางไม่เป็นกล่องเลื่อน (md:overflow-visible) ไม่งั้น sticky ไม่อิงหน้า · mobile: toolbar เลื่อนไปกับหน้า ตารางเลื่อนซ้ายขวาในกล่อง
  return (
    <div ref={rootRef}>
      {/* จำนวน = แถวที่เห็นตามตัวกรอง (แบบหน้ารายการ BOQ) — ยอดรอราคา/ต้องตรวจ อยู่ที่ chip แล้ว */}
      <Header title={title} subtitle={`COMMERCIAL (B2B) · ${filtered.length} รายการ`} />

      <div ref={barRef} className="px-3 pt-3 md:px-6 md:pt-6 md:pb-4 space-y-4 md:sticky md:z-20 bg-white" style={{ top: hdrH }}>
        {loadError && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{loadError}</div>}

        {/* Toolbar */}
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา รหัส / รายการ / ยี่ห้อ / รุ่น…"
            className="h-8 px-4 rounded-lg border border-gray-200 text-sm flex-1 min-w-[200px] focus:outline-none focus:border-primary" />
          <Dropdown className="w-full md:w-72" searchable value={catFilter} onChange={(v) => setCatFilter(v || "all")}
            options={[{ value: "all", label: "ทุกหมวด" }, ...categories.map((c) => ({ value: String(c.id), label: `${c.id}. ${c.name}${c.is_addon ? " (ส่วนเพิ่มเติม)" : ""}` }))]} />
          <div className="flex items-center gap-1.5 flex-wrap">
            {chip("all", "ทั้งหมด", materials.length)}
            {chip("pending", "รอราคา", pendingCount, pendingCount > 0 ? "text-red-600" : "")}
            {reviewCount > 0 && chip("review", "ต้องตรวจ", reviewCount, "text-amber-700")}
            {chip("inactive", "ปิดใช้งาน", inactiveCount)}
          </div>
          {canEditItem && (
            <button type="button" onClick={() => setEditing({ material: null })}
              className="h-8 px-5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors">+ เพิ่มรายการ</button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto md:overflow-visible px-3 pt-4 pb-3 md:px-6 md:pt-0 md:pb-6">
        {materials.length === 0 ? (
          <div className="rounded-xl bg-white border border-gray-300 px-5 py-10 text-center text-sm text-gray-400">
            ยังไม่มีรายการใน Master Data — ข้อมูลตั้งต้นจะนำเข้าจากไฟล์ Excel (sheet Unit price Material){canEditItem ? " หรือกด \"+ เพิ่มรายการ\"" : ""}
          </div>
        ) : sections.length === 0 ? (
          <div className="rounded-xl bg-white border border-gray-300 px-5 py-10 text-center text-sm text-gray-400">ไม่พบรายการตามเงื่อนไขที่เลือก</div>
        ) : (
          <div className="max-md:min-w-[1120px] space-y-4">
            {sections.map(({ cat, items }) => (
              // overflow-clip (ไม่ใช่ hidden) — ตัดมุมโค้งได้โดยไม่กลายเป็นกล่องเลื่อน ไม่งั้น thead sticky ไม่ทำงาน
              <section key={cat.id} aria-label={`${cat.id}. ${cat.name}`} className="rounded-xl bg-white border border-gray-300 overflow-clip">
                {/* table-fixed + colgroup ความกว้างตายตัว — ทุกหมวดเป็นตารางแยก คอลัมน์ต้องตรงกันทั้งหน้า
                    (ต้องใช้ colgroup: แถวแรกของ thead เป็นหัวหมวด colSpan เต็มแถว table-fixed จะอ่านความกว้างจากแถวนั้นไม่ได้) */}
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col className="w-[72px]" /><col /><col className="w-[120px]" /><col className="w-[200px]" />
                    <col className="w-[80px]" /><col className="w-[200px]" /><col className="w-[110px]" /><col className="w-[180px]" />
                  </colgroup>
                  {/* หัวหมวด + หัวคอลัมน์ค้างด้วยกันตอนเลื่อน (desktop) — เส้นใต้หัวหมวดใช้ inset shadow เพราะ border ของแถว sticky หายใน border-collapse */}
                  <thead className="md:sticky md:z-10" style={{ top: hdrH + barH }}>
                    <tr className="bg-white">
                      <th colSpan={8} className="px-4 py-3 text-left font-normal shadow-[inset_0_-1px_0_var(--color-gray-200)]">
                        <span className="inline-flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-bold text-gray-900">{cat.id}. {cat.name}</span>
                          {cat.is_addon && <span className="text-xxs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">ส่วนเพิ่มเติม</span>}
                          <span className="text-xs font-mono text-gray-400">({items.length})</span>
                        </span>
                      </th>
                    </tr>
                    <tr className="text-left text-xs text-gray-500 bg-gray-50">
                      <th className="px-3 py-2 font-semibold">รหัส</th>
                      <th className="px-3 py-2 font-semibold">รายการ</th>
                      <th className="px-3 py-2 font-semibold">ยี่ห้อ</th>
                      <th className="px-3 py-2 font-semibold">รุ่น / ขนาด</th>
                      <th className="px-3 py-2 font-semibold">หน่วย</th>
                      {/* pr = px-3 + หน่วยท้ายช่อง w-14 + gap + padding ในช่องกรอก → หัว "ราคา" ตรงกับขอบขวาของตัวเลข */}
                      <th className="pl-3 pr-[83px] py-2 font-semibold text-right">ราคา</th>
                      <th className="px-3 py-2 font-semibold">อัปเดตราคา</th>
                      <th className="px-3 py-2" />
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
                        // แถวที่ปิดใช้ จางทุกช่องยกเว้นช่องปุ่ม — ป้าย INACTIVE ต้องเห็นชัดว่ากดเปิดกลับได้
                        <tr key={m.id} className={`border-t border-gray-100 align-middle ${!m.is_active ? "[&>td:not(:last-child)]:opacity-50" : ""} ${dirty ? "bg-amber-50" : ""}`}>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{m.code}</td>
                          <td className="px-3 py-2 text-gray-900 break-words">
                            {m.name}
                            {m.note && (
                              <div title={m.note} className={`mt-0.5 text-xxs leading-snug line-clamp-2 ${m.note.includes("⚠") ? "text-amber-700" : "text-gray-400"}`}>{m.note}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{m.brand ?? ""}</td>
                          <td className="px-3 py-2 text-gray-600 break-words">{m.model ?? ""}{m.spec_watt && !wattInModel(m) ? <span className="text-gray-400"> · {m.spec_watt} W</span> : null}</td>
                          <td className="px-3 py-2 text-gray-600">{m.unit}</td>
                          <td className="px-3 py-1.5 text-right">
                            {/* ช่องตัวเลข w-28 + หน่วย w-14 เท่ากันทุกแถว (ทั้งแบบกรอกและแบบอ่าน) → ตัวเลขเรียงเป็นแนวเดียว */}
                            <div className="flex items-center justify-end gap-1.5">
                              {canEditPrice && m.is_active ? (
                                <input type="number" inputMode="decimal" min={0} step="any"
                                  value={draft ?? (m.unit_price ?? "")}
                                  onChange={(e) => setDrafts((x) => ({ ...x, [m.id]: e.target.value }))}
                                  placeholder="รอราคา"
                                  className={`w-28 h-8 px-2 rounded-lg border text-right font-mono tabular-nums text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 ${m.unit_price == null && !dirty ? "border-red-300 placeholder:text-red-400" : "border-gray-200"}`} />
                              ) : (
                                <span className="w-28 pr-[9px]">
                                  {m.unit_price == null
                                    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-semibold">รอราคา</span>
                                    : <span className="font-mono tabular-nums text-gray-900">{formatPrice(m.unit_price)}</span>}
                                </span>
                              )}
                              <span title={priceBasisLabel(m.price_basis)} className="w-14 text-left text-xxs text-gray-400 whitespace-nowrap">{priceSuffix(m.price_basis, m.unit)}</span>
                            </div>
                            {showBasisLabel(m) && <div className="text-xxs text-gray-400 mt-0.5">{priceBasisLabel(m.price_basis)}</div>}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {m.price_updated_at ? <>{formatThaiDate(m.price_updated_at)}<div className="text-gray-400 truncate max-w-[9rem]">{m.price_updated_by_name ?? ""}</div></> : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-2">
                              <button type="button" title="ประวัติราคา" onClick={() => setHistoryOf(m)} style={{ minHeight: 0 }}
                                className="shrink-0 w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500">
                                <ClockIcon className="w-4 h-4" strokeWidth={2} />
                              </button>
                              <button type="button" onClick={() => setEditing({ material: m })} style={{ minHeight: 0 }}
                                className="shrink-0 whitespace-nowrap text-sm text-primary font-semibold hover:underline">{canEditItem ? "แก้ไข" : "ดู"}</button>
                              {/* ป้ายสถานะ = สีบอกสถานะ (เขียว ACTIVE / เทา INACTIVE) · Solar B2B กดสลับได้ คนอื่นเห็นอย่างเดียว
                                  กว้างตายตัว + nowrap ให้ ACTIVE/INACTIVE ตรงแนวกันและไม่ตัดบรรทัด */}
                              {canEditItem ? (
                                <button type="button" onClick={() => void toggleActive(m)} style={{ minHeight: 0 }}
                                  title={m.is_active ? "กดเพื่อปิดใช้งาน" : "กดเพื่อเปิดใช้งาน"}
                                  className={`${statusPill(m.is_active)} ${m.is_active ? "hover:bg-emerald-100" : "hover:bg-gray-200"}`}>
                                  {m.is_active ? "ACTIVE" : "INACTIVE"}
                                </button>
                              ) : (
                                <span className={statusPill(m.is_active)}>{m.is_active ? "ACTIVE" : "INACTIVE"}</span>
                              )}
                            </div>
                          </td>
                        </tr>,
                      ];
                    })}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* แถบบันทึกราคาของ Purchase — โผล่เมื่อมีราคาที่แก้แต่ยังไม่บันทึก
          ค้างล่างจอ (sticky ไม่ต้องคำนวณความกว้าง sidebar) · mobile = ค้างเหนือแถบเมนูล่าง */}
      {canEditPrice && dirtyIds.length > 0 && (
        <div className="sticky bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur px-3 md:px-6 py-3">
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
