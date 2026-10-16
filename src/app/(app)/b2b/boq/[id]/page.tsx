"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import Dropdown from "@/components/ui/Dropdown";
import { useDialog } from "@/components/ui/Dialog";
import { useUnsavedGuard } from "@/lib/hooks/useUnsavedGuard";
import { apiFetch, getUserContextHeaders } from "@/lib/api";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatNumber, formatThaiDate, formatTHB } from "@/lib/utils/formatters";
import { calcBoq, perWp, type AddonMode } from "@/lib/b2b/boq-calc";
import { ADDON_MIN_CATEGORY, B2B_BOQ_ROLES, B2B_BOQ_VIEW_ROLES, boqStageLocked, type BoqHeader, type BoqLine, type BoqRevision } from "@/lib/b2b/boq";
import { stageLabel } from "@/lib/b2b/project";
import type { B2bCategory, B2bMaterial } from "@/lib/b2b/materials";
import BoqSummary from "@/components/b2b/boq/BoqSummary";
import BoqCategorySection from "@/components/b2b/boq/BoqCategorySection";
import MaterialPickerDialog from "@/components/b2b/boq/MaterialPickerDialog";
import MaterialEditModal from "@/components/b2b/MaterialEditModal";
import OmPanel from "@/components/b2b/boq/OmPanel";
import { OM_CATEGORY, OM_DEFAULTS, OM_ROLES, omQty, type OmParams } from "@/lib/b2b/boq-om";

// หน้าทำ BOQ — เรียงตาม sheet "EPCL - BOQS": หัวใบ → สรุป 25 หมวด → รายละเอียดทีละหมวด
// แผน docs/plan/20261005-01-b2b-boq-module.md เฟส 3 · ตัวเลขทั้งหมดคิดด้วย calcBoq ชุดเดียวกับ server
// แก้ได้เฉพาะ Rev ล่าสุด · บันทึกทั้งใบทีเดียว (server ตรวจซ้ำ + เติมราคาจาก Master เอง)

type Loaded = { header: BoqHeader; lines: BoqLine[]; revisions: BoqRevision[]; categories: B2bCategory[] };
type HeadDraft = {
  option_label: string;
  project_name: string; customer_name: string; location: string; latitude: string; longitude: string;
  margin_pct: string; note: string; addon_modes: Record<number, AddonMode>;
  om_params: OmParams | null;
};

const toDraft = (h: BoqHeader): HeadDraft => ({
  option_label: h.option_label ?? "",
  project_name: h.project_name, customer_name: h.customer_name ?? "", location: h.location ?? "",
  latitude: h.latitude?.toString() ?? "", longitude: h.longitude?.toString() ?? "",
  margin_pct: String(h.margin_pct), note: h.note ?? "", addon_modes: { ...h.addon_modes },
  om_params: h.om_params ? { ...h.om_params } : null,
});
let seq = 0;
const newKey = () => `n${Date.now()}_${++seq}`;

export default function BoqEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { confirm, toast } = useDialog();
  const { activeRoles } = useActiveRoles();
  const canUse = hasRole(activeRoles, ...B2B_BOQ_VIEW_ROLES);
  // ผู้ตรวจสอบใบเสนอราคาเปิดดู BOQ ได้ (แผน 20261015-07) — แก้ได้เฉพาะ Solar B2B + admin
  const canEdit = hasRole(activeRoles, ...B2B_BOQ_ROLES);

  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState("");
  const [head, setHead] = useState<HeadDraft | null>(null);
  const [lines, setLines] = useState<BoqLine[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [materials, setMaterials] = useState<B2bMaterial[] | null>(null);
  const [picker, setPicker] = useState<B2bCategory | null>(null);
  const [addingMaster, setAddingMaster] = useState<B2bCategory | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [revBusy, setRevBusy] = useState(false);

  const apply = useCallback((r: Loaded) => {
    setData(r); setHead(toDraft(r.header)); setLines(r.lines); setDirty(false); setError("");
  }, []);

  useEffect(() => {
    if (!canUse) return;
    apiFetch(`/api/b2b/boqs/${id}`).then(apply).catch((e) => setLoadError(e instanceof Error ? e.message : "โหลดใบ BOQ ไม่สำเร็จ"));
  }, [id, canUse, apply]);

  // ออกจากหน้าโดยยังไม่บันทึก — เตือนก่อน (ปิดแท็บ · ลิงก์/เมนูในแอป · เปลี่ยน Rev)
  const askLeave = useCallback(() => confirm({
    title: "ออกจากหน้านี้?", message: "มีการแก้ไขที่ยังไม่บันทึก — ออกแล้วงานที่แก้จะหาย", confirmText: "ออกโดยไม่บันทึก", variant: "danger",
  }), [confirm]);
  const guardedPush = useUnsavedGuard(dirty, askLeave);

  const loadMaterials = useCallback(async () => {
    const r = await apiFetch("/api/b2b/materials") as { materials: B2bMaterial[] };
    setMaterials(r.materials);
    return r.materials;
  }, []);

  const categories = useMemo(() => data?.categories ?? [], [data]);
  // บรรทัดสูตร O&M — จำนวนคิดจากช่องตั้งค่าของใบ (แผน 20261016-03) · ใช้ทั้งคำนวณ แสดง และส่งบันทึก (server คิดซ้ำ)
  const om = head?.om_params ?? null;
  const effLines = useMemo(() => (om ? lines.map((l) => (l.om_role ? { ...l, qty: omQty(l.om_role, om).qty } : l)) : lines), [lines, om]);
  const calc = useMemo(() => calcBoq({
    lines: effLines.map((l) => ({ key: l.key, category_id: l.category_id, price_basis: l.price_basis, unit_cost: l.unit_cost, qty: l.qty, spec_watt: l.spec_watt })),
    categories, margin_pct: Number(head?.margin_pct) || 0, vat_pct: data?.header.vat_pct ?? 7, addon_modes: head?.addon_modes ?? {},
  }), [effLines, categories, head, data]);

  if (activeRoles.length > 0 && !canUse) {
    return (
      <div>
        <Header title="ใบ BOQ" subtitle="COMMERCIAL (B2B)" />
        <main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">role ที่กำลังใช้งานไม่มีสิทธิ์เปิดหน้านี้</div></main>
      </div>
    );
  }
  if (loadError) return <div><Header title="ใบ BOQ" backHref="/b2b/projects" /><main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{loadError}</div></main></div>;
  if (!data || !head) return <Loading />;

  const h = data.header;
  // ผ่านขั้นราคายืนยันแล้ว (ได้งาน/ปิด/แพ้/ยกเลิก) แก้/ออก Rev ไม่ได้ — API ตรวจซ้ำ
  const stageLocked = boqStageLocked(h.project_stage);
  const readOnly = !h.is_latest || !canEdit || !!h.locked_by_quote || stageLocked;
  // ใบในโครงการ (แผน 20261015-07): ชื่อโครงการ/ลูกค้า/ที่ตั้ง/พิกัดมาจากโครงการ — แก้ในหน้าโครงการ (server ไม่รับค่าจากหน้านี้)
  const linked = h.project_id != null;
  const backHref = linked ? `/b2b/projects/${h.project_id}` : "/b2b/boq";
  const touch = () => setDirty(true);
  const setH = (patch: Partial<HeadDraft>) => { setHead((x) => (x ? { ...x, ...patch } : x)); touch(); };
  const change = (key: string, patch: Partial<BoqLine>) => { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); touch(); };
  const remove = (key: string) => { setLines((ls) => ls.filter((l) => l.key !== key)); touch(); };
  const refresh = (key: string) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, unit_cost: l.current_unit_price ?? l.unit_cost, refresh_price: true } : l))); touch();
  };
  // ราคาใน Master เปลี่ยน + บรรทัดรอราคาที่ Purchase ใส่ราคาแล้ว (ปกติเติมให้เองตอน Purchase บันทึกราคา — กรณีเปิดหน้าค้างไว้)
  const changedKeys = lines.filter((l) => l.line_type === "material" && l.current_unit_price != null && l.current_unit_price !== l.unit_cost).map((l) => l.key);

  const openPicker = async (c: B2bCategory) => {
    if (!materials) await loadMaterials().catch(() => setError("โหลดรายการ Master ไม่สำเร็จ"));
    setPicker(c);
  };
  const addFromMaster = (c: B2bCategory, items: B2bMaterial[]) => {
    setLines((ls) => [...ls, ...items.map((m): BoqLine => ({
      key: newKey(), category_id: c.id, line_type: "material", material_id: m.id, subgroup: m.subgroup, name: m.name, brand: m.brand,
      model: m.model, unit: m.unit, spec_watt: m.spec_watt, price_basis: m.price_basis, unit_cost: m.unit_price, qty: 1, note: null,
      current_unit_price: m.unit_price, current_active: m.is_active, om_role: m.om_role,
    }))]);
    // เลือกบรรทัดสูตร O&M เข้าใบที่ยังไม่มีช่องตั้งค่า → เปิดช่องตั้งค่าด้วยค่าตั้งต้นของไฟล์ต้นแบบ
    if (!head.om_params && items.some((m) => m.om_role)) setH({ om_params: { ...OM_DEFAULTS } });
    setPicker(null); touch();
  };
  // ใส่บรรทัดสูตร O&M ที่ใบยังไม่มี (ทั้งชุด 10 บรรทัด) — ลำดับตาม Master
  const omHave = new Set(lines.map((l) => l.om_role).filter(Boolean));
  const addOmSet = async () => {
    const cat = categories.find((c) => c.id === OM_CATEGORY);
    const mats = materials ?? await loadMaterials().catch(() => null);
    if (!cat || !mats) { setError("โหลดรายการ Master ไม่สำเร็จ"); return; }
    const add = mats.filter((m) => m.is_active && m.om_role && !omHave.has(m.om_role)).sort((a, b) => a.sort_order - b.sort_order);
    if (add.length === 0) { setError("ไม่พบรายการสูตร O&M ใน Master"); return; }
    addFromMaster(cat, add);
  };
  const addManual = (c: B2bCategory) => {
    setLines((ls) => [...ls, { key: newKey(), category_id: c.id, line_type: "manual", material_id: null, subgroup: null, name: "", brand: null,
      model: null, unit: "Set.", spec_watt: null, price_basis: "unit", unit_cost: null, qty: 1, note: null }]);
    touch();
  };

  const addonIds = [...new Set([
    ...Object.keys(head.addon_modes).map(Number),
    ...lines.filter((l) => l.category_id >= ADDON_MIN_CATEGORY).map((l) => l.category_id),
  ])].sort((a, b) => a - b);
  const addonChoices = categories.filter((c) => c.is_addon && !addonIds.includes(c.id));

  // ข้อมูลที่ส่งบันทึก — idMap = แปลง id บรรทัดของ Rev เดิมเป็นของ Rev ใหม่ (ย้ายงานที่แก้ค้างไป Rev ใหม่)
  const payload = (idMap?: Record<string, number>, expected?: string) => JSON.stringify({
    header: { ...head, latitude: head.latitude || null, longitude: head.longitude || null },
    lines: effLines.map((l) => ({
      id: l.id != null && idMap ? idMap[String(l.id)] : l.id, line_type: l.line_type, category_id: l.category_id, material_id: l.material_id, qty: l.qty, note: l.note,
      refresh_price: l.refresh_price === true, name: l.name, brand: l.brand, model: l.model, unit: l.unit, unit_cost: l.unit_cost, price_basis: l.price_basis,
    })),
    expected_updated_at: expected,
  });

  const save = async () => {
    setError(""); setSaving(true);
    try {
      const r = await apiFetch(`/api/b2b/boqs/${h.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: payload(undefined, h.updated_at) });
      apply(r);
      toast({ message: "บันทึกใบ BOQ แล้ว", variant: "success" });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "บันทึกไม่สำเร็จ");
      // ถูกล็อกระหว่างแก้ (ใบเสนอราคาที่อ้าง Rev นี้ส่งอนุมัติ / โครงการได้งาน / มีคนออก Rev ใหม่) — โหลดหัวใบใหม่ให้เห็นสถานะจริง
      // งานที่แก้ยังอยู่ในหน้า → กด "Revision ใหม่" ย้ายไป Rev ใหม่ได้
      apiFetch(`/api/b2b/boqs/${h.id}`).then((r: Loaded) => setData(r)).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  // มีงานที่ยังไม่บันทึก (หรือถูกล็อกระหว่างแก้) → ออก Rev ใหม่แล้วบันทึกงานที่แก้ลง Rev ใหม่ในคราวเดียว
  const newRevision = async () => {
    const carry = dirty;
    const ok = await confirm({
      title: `ออก Revision ${h.revision + 1}`, confirmText: "ออก Revision ใหม่",
      message: carry
        ? `คัดลอกใบนี้เป็น Rev ${h.revision + 1} แล้วย้ายงานที่ยังไม่บันทึกไปบันทึกใน Rev ใหม่ — Rev ${h.revision} คงตัวเลขเดิม (อ่านอย่างเดียว)`
        : `คัดลอกใบนี้ทั้งใบเป็น Rev ${h.revision + 1} — Rev ${h.revision} จะกลายเป็นอ่านอย่างเดียว`,
    });
    if (!ok) return;
    setError(""); setRevBusy(true);
    try {
      const r = await apiFetch(`/api/b2b/boqs/${h.id}/revision`, { method: "POST" }) as { id: number; line_map: Record<string, number> };
      if (carry) {
        try {
          await apiFetch(`/api/b2b/boqs/${r.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: payload(r.line_map) });
        } catch (e) {
          toast({ message: `ออก Rev ใหม่แล้ว แต่บันทึกงานที่แก้ลง Rev ใหม่ไม่สำเร็จ — ${e instanceof Error ? e.message : ""}`, variant: "danger" });
        }
      }
      setDirty(false);
      router.push(`/b2b/boq/${r.id}`);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "ออก Revision ใหม่ไม่สำเร็จ");
      setRevBusy(false);
    }
  };

  // ไฟล์ Excel สร้างจากข้อมูลที่บันทึกแล้ว — มีแก้ค้างให้บันทึกก่อน (ยกวิธีดาวน์โหลดจากหน้า Export)
  const downloadExcel = async () => {
    if (dirty) { setError("บันทึกการแก้ไขก่อน — ไฟล์ Excel สร้างจากข้อมูลที่บันทึกแล้ว"); return; }
    setError(""); setDownloading(true);
    try {
      const res = await fetch(`/api/b2b/boqs/${h.id}/excel`, { headers: { ...getUserContextHeaders() } });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `HTTP ${res.status}`);
      const cd = res.headers.get("Content-Disposition") ?? "";
      const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(cd)?.[1] ?? `${h.doc_no}_Rev${h.revision}.xlsx`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setDownloading(false);
    }
  };

  const latest = data.revisions.find((r) => r.is_latest);
  const fieldCls = "w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-gray-50 disabled:text-gray-600";
  const labelCls = "block text-xs font-semibold text-gray-500 mb-1";
  // ตัวเลขหลักของใบ — ยอดรวม VAT / บาท/Wp ทั้งใบอยู่ท้ายตารางสรุป (ใต้ 18 หมวด) ต้องเลื่อนลงไปดู เลยยกมาไว้หัวกล่อง
  const cap = calc.capacity_wp;
  const perWpText = (n: number) => (cap > 0 ? perWp(n, cap).toFixed(2) : "—");
  const kpis = [
    { label: "ราคาขายก่อน VAT", value: formatTHB(calc.subtotal.sale, { decimals: 2 }) },
    { label: `รวม VAT ${h.vat_pct}%`, value: formatTHB(calc.grand.sale, { decimals: 2 }) },
    { label: "ขาย บาท/Wp", value: perWpText(calc.subtotal.sale) },
    { label: "ต้นทุน บาท/Wp", value: perWpText(calc.subtotal.cost) },
    { label: `กำไร (Margin ${Number(head.margin_pct) || 0}%)`, value: formatTHB(calc.subtotal.sale - calc.subtotal.cost, { decimals: 2 }) },
  ];

  return (
    <div>
      {/* หัวเรื่อง = ชื่อโครงการ (subtitle ของ Header เป็นตัวพิมพ์ใหญ่ทั้งหมด จะเปลี่ยนหน้าตาชื่อ) · เลขที่ไว้บรรทัดรอง */}
      <Header title={head.project_name || "ใบ BOQ"} subtitle={`${h.doc_no} · Rev ${h.revision}`} backHref={backHref}
        rightContent={data.revisions.length > 1 ? (
          <Dropdown className="w-36" value={String(h.id)} onChange={(v) => { if (v && v !== String(h.id)) void guardedPush(`/b2b/boq/${v}`); }}
            options={data.revisions.map((r) => ({ value: String(r.id), label: `Rev ${r.revision}${r.is_latest ? " (ล่าสุด)" : ""}` }))} />
        ) : undefined} />

      <div className="p-3 md:p-6 space-y-4">
        {h.is_latest && stageLocked && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            โครงการอยู่ขั้น &quot;{stageLabel(h.project_stage!)}&quot; แล้ว — BOQ แก้/ออก Revision ไม่ได้ (BOQ ที่ได้งานเป็นงบโครงการ)
          </div>
        )}
        {h.is_latest && !stageLocked && h.locked_by_quote && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            Rev {h.revision} ใช้ในใบเสนอราคา {h.locked_by_quote} ที่ส่งอนุมัติแล้ว — แก้ไม่ได้ · ออก Revision ใหม่เพื่อแก้ตัวเลข
          </div>
        )}
        {!h.is_latest && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            กำลังดู Rev {h.revision} — อ่านอย่างเดียว แก้ได้เฉพาะ Revision ล่าสุด
            {latest && <button type="button" onClick={() => router.push(`/b2b/boq/${latest.id}`)} className="ml-2 font-semibold underline" style={{ minHeight: 0 }}>ไป Rev {latest.revision}</button>}
          </div>
        )}

        {/* หัวใบ (แถว 1–8 ของ sheet) */}
        <section className="rounded-xl border border-gray-300 bg-white p-4">
          {linked && (
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
              <span>โครงการ <Link href={backHref} className="font-semibold text-primary hover:underline">{h.project_code} · {head.project_name}</Link></span>
              <span className="text-xs text-gray-400">ชื่อโครงการ · ลูกค้า · ที่ตั้ง แก้ในหน้าโครงการ</span>
            </div>
          )}
          <fieldset disabled={readOnly} className="grid gap-3 md:grid-cols-12">
            {linked && (
              <div className="md:col-span-12"><label className={labelCls}>ชื่อตัวเลือก (ขนาด / รุ่นแผง)</label>
                <input className={fieldCls} value={head.option_label} onChange={(e) => setH({ option_label: e.target.value })} placeholder="เช่น 998.64 kWp · Jinko 730" /></div>
            )}
            <div className="md:col-span-5"><label className={labelCls}>Project <span className="text-red-500">*</span></label>
              <input className={fieldCls} disabled={linked} value={head.project_name} onChange={(e) => setH({ project_name: e.target.value })} /></div>
            <div className="md:col-span-4"><label className={labelCls}>Customer</label>
              <input className={fieldCls} disabled={linked} value={head.customer_name} onChange={(e) => setH({ customer_name: e.target.value })} /></div>
            <div className="md:col-span-3"><label className={labelCls}>Margin (% ของราคาขาย)</label>
              <input type="number" step="0.01" min={0} max={99} className={`${fieldCls} text-right`} value={head.margin_pct} onChange={(e) => setH({ margin_pct: e.target.value })} /></div>
            <div className="md:col-span-6"><label className={labelCls}>Location</label>
              <input className={fieldCls} disabled={linked} value={head.location} onChange={(e) => setH({ location: e.target.value })} /></div>
            <div className="md:col-span-3"><label className={labelCls}>Latitude</label>
              <input className={fieldCls} disabled={linked} value={head.latitude} onChange={(e) => setH({ latitude: e.target.value })} placeholder="13.xxxxxx" /></div>
            <div className="md:col-span-3"><label className={labelCls}>Longitude</label>
              <input className={fieldCls} disabled={linked} value={head.longitude} onChange={(e) => setH({ longitude: e.target.value })} placeholder="100.xxxxxx" /></div>
          </fieldset>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
            <span>Capacity: <span className="font-bold text-gray-900 tabular-nums">{formatNumber(calc.capacity_wp)}</span> Wp ({(calc.capacity_wp / 1000).toFixed(2)} kWp)</span>
            <span>VAT {h.vat_pct}%</span>
            <span>สร้าง {formatThaiDate(h.created_at)}{h.created_by_name ? ` · ${h.created_by_name}` : ""}</span>
            <span>บันทึกล่าสุด {formatThaiDate(h.updated_at, { time: true })}{h.updated_by_name ? ` · ${h.updated_by_name}` : ""}</span>
          </div>
        </section>

        {/* สรุป (แถว 10–40) */}
        <section className="rounded-xl border border-gray-300 bg-white overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-bold text-gray-900">สรุป</h2>
            {calc.pending_lines > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">รอราคา {calc.pending_lines} บรรทัด — ยอดยังไม่ครบ</span>}
            {changedKeys.length > 0 && !readOnly && (
              <button type="button" onClick={() => changedKeys.forEach(refresh)} style={{ minHeight: 0 }}
                className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-200">ราคาใน Master เปลี่ยน/มาแล้ว {changedKeys.length} บรรทัด · ใช้ราคาใหม่ทั้งหมด</button>
            )}
          </div>
          {/* gap-px บนพื้นเทา = เส้นคั่นช่อง · มือถือ 2 คอลัมน์ ช่องแรก (ยอดหลัก) เต็มแถว */}
          <dl className="grid grid-cols-2 md:grid-cols-5 gap-px bg-gray-100 border-b border-gray-200">
            {kpis.map((k, i) => (
              <div key={k.label} className={`bg-white px-4 py-2.5 ${i === 0 ? "max-md:col-span-2" : ""}`}>
                <dt className="text-xs text-gray-500">{k.label}</dt>
                <dd className="text-base font-bold text-gray-900">{k.value}</dd>
              </div>
            ))}
          </dl>
          <BoqSummary categories={categories} calc={calc} addonIds={addonIds} addonModes={head.addon_modes} readOnly={readOnly} vatPct={h.vat_pct}
            onMode={(cid, mode) => setH({ addon_modes: { ...head.addon_modes, [cid]: mode } })}
            onJump={(cid) => document.getElementById(`cat-${cid}`)?.scrollIntoView({ behavior: "smooth", block: "start" })} />
        </section>

        {/* รายละเอียดทีละหมวด */}
        {categories.filter((c) => !c.is_addon || addonIds.includes(c.id)).map((c) => (
          <BoqCategorySection key={c.id} category={c} lines={effLines.filter((l) => l.category_id === c.id)} calc={calc} readOnly={readOnly}
            optional={c.is_addon && head.addon_modes[c.id] === "optional"}
            omParams={om}
            extra={c.id === OM_CATEGORY && (
              <OmPanel params={om} readOnly={readOnly} missing={OM_ROLES.filter((r) => !omHave.has(r)).length}
                onChange={(p) => setH({ om_params: p })} onAddSet={() => void addOmSet()} />
            )}
            onChange={change} onRemove={remove} onRefresh={refresh} onPick={() => void openPicker(c)} onAddManual={() => addManual(c)}
            onRemoveAddon={c.is_addon ? () => { const m = { ...head.addon_modes }; delete m[c.id]; setH({ addon_modes: m }); } : undefined} />
        ))}

        {!readOnly && addonChoices.length > 0 && (
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 px-4 py-3">
            <div className="mb-2 text-xs font-bold text-amber-800">+ เพิ่มส่วนเพิ่มเติม (Optional Add-on) — ใส่ราคาเองได้</div>
            <div className="flex flex-wrap gap-2">
              {addonChoices.map((c) => (
                <button key={c.id} type="button" onClick={() => setH({ addon_modes: { ...head.addon_modes, [c.id]: "included" } })} style={{ minHeight: 0 }}
                  className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100">{c.id}. {c.name}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* แถบท้าย — บันทึก / ออก Revision · sticky แบบหน้าวัสดุ (fixed + md:left-56 เยื้องตอนย่อเมนู และมือถือโดนแถบล่าง z-50 ทับ)
          bottom-0 ทุกจอ — main มี pb-20 เผื่อแถบล่างมือถือไว้แล้ว และ sticky นับ padding นั้นด้วย (bottom-20 = ลอยเหนือแถบล่าง 80px) */}
      <div className="sticky bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur px-3 md:px-6 py-3">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <span className={`text-sm ${dirty ? "font-semibold text-amber-700" : "text-gray-500"}`}>
            {readOnly ? `Rev ${h.revision} · อ่านอย่างเดียว` : dirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "บันทึกแล้ว"}
          </span>
          {error && <span className="text-sm text-red-600">{error}</span>}
          <div className="ml-auto flex items-center gap-2">
            {/* มือถือใช้คำสั้น — ชื่อเต็มยาวเกินจอ ตัวหนังสือขึ้นบรรทัดใหม่ล้นปุ่ม */}
            <button type="button" onClick={() => void downloadExcel()} disabled={downloading}
              className="h-9 whitespace-nowrap rounded-lg border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
              {downloading ? "กำลังสร้างไฟล์…" : <><span className="md:hidden">Excel</span><span className="max-md:hidden">ดาวน์โหลด Excel</span></>}
            </button>
            {h.is_latest && canEdit && !stageLocked && (
              <>
                <button type="button" onClick={() => void newRevision()} disabled={revBusy || saving}
                  className="h-9 whitespace-nowrap rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  <span className="max-md:hidden">ออก </span>Revision ใหม่
                </button>
                {!readOnly && <button type="button" onClick={() => void save()} disabled={saving || !dirty}
                  className="h-9 whitespace-nowrap rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-40">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>}
              </>
            )}
          </div>
        </div>
      </div>

      {picker && materials && (
        <MaterialPickerDialog category={picker} categories={categories} materials={materials}
          onPick={(items) => addFromMaster(picker, items)}
          onAddNew={() => { setAddingMaster(picker); setPicker(null); }}
          onClose={() => setPicker(null)} />
      )}
      {addingMaster && materials && (
        <MaterialEditModal initial={null} defaultCategory={addingMaster.id} categories={categories} materials={materials} viewOnly={false}
          onClose={() => { const c = addingMaster; setAddingMaster(null); setPicker(c); }}
          onSaved={() => { const c = addingMaster; setAddingMaster(null); void loadMaterials().then(() => setPicker(c)); }} />
      )}
    </div>
  );
}
