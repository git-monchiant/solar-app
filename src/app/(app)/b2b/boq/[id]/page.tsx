"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import Dropdown from "@/components/ui/Dropdown";
import { useDialog } from "@/components/ui/Dialog";
import { useUnsavedGuard } from "@/lib/hooks/useUnsavedGuard";
import { apiFetch, getUserContextHeaders } from "@/lib/api";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatTHB } from "@/lib/utils/formatters";
import { calcBoq, perWp, type AddonMode } from "@/lib/b2b/boq-calc";
import { ADDON_MIN_CATEGORY, B2B_BOQ_ROLES, B2B_BOQ_VIEW_ROLES, boqStageLocked, type BoqHeader, type BoqLine, type BoqRevision } from "@/lib/b2b/boq";
import { stageLabel } from "@/lib/b2b/project";
import type { B2bCategory, B2bMaterial } from "@/lib/b2b/materials";
import BoqCategorySection, { type CategoryFlags } from "@/components/b2b/boq/BoqCategorySection";
import BoqCategoryNav from "@/components/b2b/boq/BoqCategoryNav";
import BoqOverview, { type BoqAlert } from "@/components/b2b/boq/BoqOverview";
import MaterialPickerDialog from "@/components/b2b/boq/MaterialPickerDialog";
import MaterialEditModal from "@/components/b2b/MaterialEditModal";
import ImportFromBoqDialog, { type ImportResult } from "@/components/b2b/boq/ImportFromBoqDialog";
import OmPanel from "@/components/b2b/boq/OmPanel";
import { OM_CATEGORY, OM_DEFAULTS, OM_ROLES, omQty, type OmParams } from "@/lib/b2b/boq-om";

/** บาทเต็มจำนวน — formatTHB ค่าเริ่มต้นไม่ปัดเศษ (แสดงทศนิยมได้ถึง 3 ตำแหน่ง) */
const thb0 = (n: number) => formatTHB(Math.round(n));

// หน้าทำ BOQ — แบบ A+B (แผน docs/plan/20261016-04-b2b-boq-page-redesign.md · mockup docs/mockup/20261016-04-…)
//   แท็บ ภาพรวม (dashboard) · รายการ (เมนูหมวดซ้าย + การ์ดหมวด) — แถบแท็บค้างใต้ Header พร้อมยอดย่อ + ปุ่มบันทึก (desktop)
//   ไม่มีแท็บตั้งค่าใบ (ยุบ 16 ต.ค.): ชื่อตัวเลือก + Margin ในการ์ดรายละเอียด BOQ · รวม/ทางเลือกบนหัวการ์ดส่วนเพิ่มเติม · O&M ในการ์ดหมวด 13
//   ตัวเลขทั้งหมดคิดด้วย calcBoq ชุดเดียวกับ server · แก้ได้เฉพาะ Rev ล่าสุด · บันทึกทั้งใบทีเดียว (server ตรวจซ้ำ + เติมราคาจาก Master เอง)

type Loaded = { header: BoqHeader; lines: BoqLine[]; revisions: BoqRevision[]; categories: B2bCategory[] };
type HeadDraft = {
  option_label: string;
  project_name: string; customer_name: string; location: string; latitude: string; longitude: string;
  margin_pct: string; note: string; addon_modes: Record<number, AddonMode>;
  om_params: OmParams | null;
};
type Tab = "overview" | "items";
type LineFilter = "all" | "pend" | "chg" | "manual";

const toDraft = (h: BoqHeader): HeadDraft => ({
  option_label: h.option_label ?? "",
  project_name: h.project_name, customer_name: h.customer_name ?? "", location: h.location ?? "",
  latitude: h.latitude?.toString() ?? "", longitude: h.longitude?.toString() ?? "",
  margin_pct: String(h.margin_pct), note: h.note ?? "", addon_modes: { ...h.addon_modes },
  om_params: h.om_params ? { ...h.om_params } : null,
});
let seq = 0;
const newKey = () => `n${Date.now()}_${++seq}`;
/** ราคาใน Master ต่างจาก snapshot ของบรรทัด (บรรทัดที่มีราคาแล้ว) */
const isChanged = (l: BoqLine) => l.line_type === "material" && l.unit_cost != null && l.current_unit_price != null && l.current_unit_price !== l.unit_cost;
/** รอราคาแต่ Purchase ใส่ราคาใน Master แล้ว (หน้าเปิดค้างไว้ตอน Purchase บันทึก) */
const isArrived = (l: BoqLine) => l.line_type === "material" && l.unit_cost == null && l.current_unit_price != null;
/** BOQ บรรทัดไม่เกินนี้ — เปิดหน้ามากางทุกหมวด · ใบใหญ่กว่านี้กางเฉพาะหมวดที่ต้องจัดการ */
const OPEN_ALL_MAX_LINES = 40;

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
  // ── หน้าตาแบบ A+B ──
  const [tab, setTab] = useState<Tab>("overview");   // เปิดหน้ามาเจอภาพรวมทุก role (ผู้ใช้สั่ง 16 ต.ค. 69)
  const [openSet, setOpenSet] = useState<Set<number> | null>(null);  // null = กางตามค่าเริ่มต้น
  const [shownEmpty, setShownEmpty] = useState<Set<number>>(new Set());  // หมวดว่างที่กดเปิดจากเมนู
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LineFilter>("all");
  const [navActive, setNavActive] = useState<number | null>(null);
  const [goTarget, setGoTarget] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);   // ดึงหมวดจากใบอื่น (แผน 20261016-05)
  // Header + แถบแท็บค้างบนจอ — วัดสด (ตัดบรรทัดตามจอ) ใช้กับเมนูหมวด/การ์ดหมวด
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [hdrH, setHdrH] = useState(0);
  const [barH, setBarH] = useState(0);

  const apply = useCallback((r: Loaded) => {
    setData(r); setHead(toDraft(r.header)); setLines(r.lines); setDirty(false); setError("");
  }, []);

  useEffect(() => {
    if (!canUse) return;
    apiFetch(`/api/b2b/boqs/${id}`).then(apply).catch((e) => setLoadError(e instanceof Error ? e.message : "โหลดใบ BOQ ไม่สำเร็จ"));
  }, [id, canUse, apply]);

  const loaded = data != null;
  useEffect(() => {
    const hdr = rootRef.current?.firstElementChild as HTMLElement | null;   // Header = ลูกตัวแรกของหน้า (sticky top-0)
    const bar = barRef.current;
    if (!hdr || !bar) return;
    const ro = new ResizeObserver(() => { setHdrH(hdr.offsetHeight); setBarH(bar.offsetHeight); });
    ro.observe(hdr); ro.observe(bar);
    return () => ro.disconnect();
  }, [loaded]);

  // ไปที่หมวด (จากภาพรวม/เมนู/ต้องจัดการ) — รอแท็บรายการวาดเสร็จก่อนค่อยเลื่อน แล้วไฮไลต์การ์ดชั่วครู่
  useEffect(() => {
    if (goTarget == null) return;
    const t = requestAnimationFrame(() => {
      document.getElementById(`cat-${goTarget}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setFlash(goTarget);
      setGoTarget(null);
    });
    return () => cancelAnimationFrame(t);
  }, [goTarget]);
  useEffect(() => {
    if (flash == null) return;
    const t = setTimeout(() => setFlash(null), 1400);
    return () => clearTimeout(t);
  }, [flash]);

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
  const curTab = tab;
  const stickyTop = hdrH + barH;
  const touch = () => setDirty(true);
  const setH = (patch: Partial<HeadDraft>) => { setHead((x) => (x ? { ...x, ...patch } : x)); touch(); };
  const change = (key: string, patch: Partial<BoqLine>) => { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); touch(); };
  const remove = (key: string) => { setLines((ls) => ls.filter((l) => l.key !== key)); touch(); };
  const refresh = (key: string) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, unit_cost: l.current_unit_price ?? l.unit_cost, refresh_price: true } : l))); touch();
  };
  // ราคาใน Master เปลี่ยน + บรรทัดรอราคาที่ Purchase ใส่ราคาแล้ว (ปกติเติมให้เองตอน Purchase บันทึกราคา — กรณีเปิดหน้าค้างไว้)
  const changedKeys = lines.filter((l) => l.line_type === "material" && l.current_unit_price != null && l.current_unit_price !== l.unit_cost).map((l) => l.key);

  // ── สถานะต่อหมวด + สิ่งที่ต้องจัดการ ──
  const linesOf = (cid: number) => effLines.filter((l) => l.category_id === cid);
  const flagsOf = (cid: number): CategoryFlags => {
    const ls = linesOf(cid);
    return { pending: ls.filter((l) => l.unit_cost == null).length, changed: ls.filter((l) => isChanged(l) || isArrived(l)).length };
  };
  const alerts: BoqAlert[] = [];
  for (const c of categories) {
    const ls = linesOf(c.id);
    if (!ls.length) continue;
    const label = `${c.id}. ${c.name}`;
    const waiting = ls.filter((l) => l.line_type === "material" && l.unit_cost == null && l.current_unit_price == null).length;
    const noPrice = ls.filter((l) => l.line_type === "manual" && l.unit_cost == null).length;
    const arrived = ls.filter(isArrived).length;
    const changed = ls.filter(isChanged).length;
    const inactive = ls.filter((l) => l.current_active === false).length;
    if (waiting) alerts.push({ key: `w${c.id}`, cat: c.id, tone: "red", text: `รอราคา (Purchase) ${waiting} บรรทัด · ${label}` });
    if (noPrice) alerts.push({ key: `n${c.id}`, cat: c.id, tone: "red", text: `ยังไม่ใส่ราคาเอง ${noPrice} บรรทัด · ${label}` });
    if (arrived) alerts.push({ key: `a${c.id}`, cat: c.id, tone: "amber", text: `Purchase ใส่ราคาแล้ว ${arrived} บรรทัด — กดใช้ราคา · ${label}` });
    if (changed) alerts.push({ key: `c${c.id}`, cat: c.id, tone: "amber", text: `ราคาใน Master เปลี่ยน ${changed} บรรทัด · ${label}` });
    if (inactive) alerts.push({ key: `i${c.id}`, cat: c.id, tone: "gray", text: `ปิดใช้งานใน Master ${inactive} บรรทัด · ${label}` });
  }
  if (om && om.distance_km === 0 && effLines.some((l) => l.om_role)) {
    alerts.push({ key: "om-km", cat: OM_CATEGORY, tone: "blue", text: "O&M ยังไม่ใส่ระยะทางไป-กลับ — ค่าเดินทางเป็น 0" });
  }

  // ── แท็บรายการ: ค้นหา/ตัวกรอง · การ์ดที่แสดง · พับ/กาง ──
  const q = search.trim().toLowerCase();
  const filtering = filter !== "all" || q !== "";
  const visible = (l: BoqLine) => {
    if (filter === "pend" && l.unit_cost != null) return false;
    if (filter === "chg" && !(isChanged(l) || isArrived(l))) return false;
    if (filter === "manual" && l.line_type !== "manual") return false;
    if (q && ![l.name, l.brand, l.model, l.note, l.subgroup].some((x) => (x ?? "").toLowerCase().includes(q))) return false;
    return true;
  };
  const addonIds = [...new Set([
    ...Object.keys(head.addon_modes).map(Number),
    ...lines.filter((l) => l.category_id >= ADDON_MIN_CATEGORY).map((l) => l.category_id),
  ])].sort((a, b) => a - b);
  const addonChoices = categories.filter((c) => c.is_addon && !addonIds.includes(c.id));
  const std = categories.filter((c) => !c.is_addon);
  const addonCats = categories.filter((c) => c.is_addon && addonIds.includes(c.id));
  const stdFilled = std.filter((c) => linesOf(c.id).length > 0);
  const stdEmpty = std.filter((c) => linesOf(c.id).length === 0);
  // ใบเปล่า = แสดงทุกหมวดมาตรฐาน (แบบเดิม) · มีรายการแล้ว = เฉพาะหมวดที่มี + หมวดว่างที่กดเปิด · O&M มีช่องตั้งค่า = แสดงหมวด 13
  const noLines = effLines.length === 0;
  const cardCats = [
    ...std.filter((c) => linesOf(c.id).length > 0 || noLines || shownEmpty.has(c.id) || (c.id === OM_CATEGORY && om != null)),
    ...addonCats,
  ].filter((c) => !filtering || linesOf(c.id).some(visible));
  const defaultOpen = (cid: number) => {
    if (shownEmpty.has(cid)) return true;
    if (effLines.length <= OPEN_ALL_MAX_LINES) return linesOf(cid).length > 0;
    const f = flagsOf(cid);
    return f.pending + f.changed > 0;
  };
  const isOpen = (cid: number) => filtering || (openSet ? openSet.has(cid) : defaultOpen(cid));
  const currentOpen = () => openSet ?? new Set(cardCats.filter((c) => defaultOpen(c.id)).map((c) => c.id));
  const toggle = (cid: number) => setOpenSet(() => { const n = new Set(currentOpen()); if (n.has(cid)) n.delete(cid); else n.add(cid); return n; });
  const openCat = (cid: number) => setOpenSet(() => new Set(currentOpen()).add(cid));
  const goTo = (cid: number) => {
    if (filtering && !linesOf(cid).some(visible)) { setFilter("all"); setSearch(""); }
    if (stdEmpty.some((c) => c.id === cid)) setShownEmpty((s) => new Set(s).add(cid));
    openCat(cid);
    setNavActive(cid);
    setTab("items");
    setGoTarget(cid);
  };
  const shareOf = (c: B2bCategory) => {
    const r = calc.categories[c.id];
    if (!r || r.mode === "optional") return null;
    return calc.subtotal.cost > 0 ? (r.cost / calc.subtotal.cost) * 100 : 0;
  };
  const addAddon = (c: B2bCategory, go: boolean) => {
    setH({ addon_modes: { ...head.addon_modes, [c.id]: "included" } });
    if (go) goTo(c.id);
  };
  const removeAddon = (cid: number) => { const m = { ...head.addon_modes }; delete m[cid]; setH({ addon_modes: m }); };
  // ดึงหมวดจากใบอื่น — แทนที่ = ลบบรรทัดเดิมของหมวดนั้นก่อน · หมวดเสริมใส่โหมดเฉพาะที่ใบยังไม่มี · O&M ใช้ช่องตั้งค่าต้นทางเมื่อใบยังไม่มี
  const applyImport = (r: ImportResult) => {
    setLines((ls) => [...ls.filter((l) => !r.replaceCats.includes(l.category_id)), ...r.lines]);
    const modes = { ...head.addon_modes };
    for (const [k, v] of Object.entries(r.addonModes)) if (!(Number(k) in modes)) modes[Number(k)] = v;
    const useOm = !head.om_params && r.omParams != null;
    setH({ addon_modes: modes, ...(useOm ? { om_params: r.omParams } : {}) });
    const cats = [...new Set(r.lines.map((l) => l.category_id))];
    setOpenSet(() => { const n = new Set(currentOpen()); cats.forEach((c) => n.add(c)); return n; });
    setImportOpen(false);
    toast({
      message: `ดึง ${r.lines.length} บรรทัดจาก ${r.from} — ยังไม่บันทึก${r.skippedInactive ? ` · ข้ามรายการปิดใช้งาน ${r.skippedInactive}` : ""}${r.skippedDup ? ` · ข้าม O&M ที่ใบนี้มีแล้ว ${r.skippedDup}` : ""}${useOm && r.omReset ? " · ระยะทาง O&M ตั้งเป็น 0 ให้กรอกใหม่" : ""}`,
      variant: r.skippedInactive || (useOm && r.omReset) ? "warning" : "success",
    });
    if (cats.length) goTo(cats[0]);
  };

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
    openCat(c.id);
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
    openCat(c.id);
    touch();
  };
  const omPanel = (
    <OmPanel params={om} readOnly={readOnly} missing={OM_ROLES.filter((r) => !omHave.has(r)).length}
      onChange={(p) => setH({ om_params: p })} onAddSet={() => void addOmSet()} />
  );

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
  const cap = calc.capacity_wp;
  const sub = calc.subtotal;
  const statusText = readOnly ? `Rev ${h.revision} · อ่านอย่างเดียว` : dirty ? "ยังไม่บันทึก" : "บันทึกแล้ว";
  const showRevBtn = h.is_latest && canEdit && !stageLocked;

  // ปุ่ม Excel / ออก Rev / บันทึก — desktop อยู่แถบแท็บ · มือถืออยู่แถบล่าง
  const actionButtons = (
    <>
      <button type="button" onClick={() => void downloadExcel()} disabled={downloading}
        className="h-9 whitespace-nowrap rounded-lg border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
        {downloading ? "กำลังสร้างไฟล์…" : "Excel"}
      </button>
      {showRevBtn && (
        <button type="button" onClick={() => void newRevision()} disabled={revBusy || saving}
          className="h-9 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          <span className="max-lg:hidden">ออก </span>Revision ใหม่
        </button>
      )}
      {showRevBtn && !readOnly && (
        <button type="button" onClick={() => void save()} disabled={saving || !dirty}
          className="h-9 whitespace-nowrap rounded-lg bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-40">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
      )}
    </>
  );
  // สลับแท็บเอง = เริ่มดูแท็บใหม่จากบนสุด (เนื้อหาสองแท็บสูงไม่เท่ากัน — ค้างตำแหน่งเดิมแล้วตกกลางหน้า) · ไปหมวดจากภาพรวมใช้ goTo (เลื่อนไปการ์ดเอง)
  const switchTab = (t: Tab) => {
    if (t === curTab) return;
    setTab(t);
    requestAnimationFrame(() => rootRef.current?.closest("main")?.scrollTo({ top: 0 }));
  };
  // แท็บ — สไตล์เดียวกับแท็บหน้าโครงการ B2B · สูงเต็มแถบ (เส้นใต้แท็บชิดขอบล่างเสมอ)
  const tabBtn = (t: Tab, label: string, badge?: ReactNode) => (
    <button key={t} type="button" role="tab" aria-selected={curTab === t} onClick={() => switchTab(t)}
      className={`flex h-full items-center gap-1.5 px-3 md:px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${curTab === t ? "text-active border-active" : "text-gray-500 border-transparent hover:text-gray-700"}`}>
      {label}{badge}
    </button>
  );
  // ตัวกรองที่เป็น 0 (และไม่ได้เลือกอยู่) จางลง กดไม่ได้ — เห็นทันทีว่ามีอะไรต้องดู
  const chip = (k: LineFilter, label: string, n: number, tone = "") => {
    const on = filter === k;
    const none = !on && n === 0;
    return (
      <button key={k} type="button" onClick={() => setFilter(k)} disabled={none} style={{ minHeight: 0 }}
        className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${on ? "border-primary bg-primary text-white" : none ? "border-gray-100 bg-white text-gray-400" : `border-gray-200 bg-white hover:border-gray-300 ${tone || "text-gray-600"}`}`}>
        {label} <span className="ml-0.5 tabular-nums">{n}</span>
      </button>
    );
  };
  const nPend = effLines.filter((l) => l.unit_cost == null).length;
  const nChg = effLines.filter((l) => isChanged(l) || isArrived(l)).length;
  const nManual = effLines.filter((l) => l.line_type === "manual").length;

  return (
    <div ref={rootRef} className="min-h-full bg-gray-50">
      {/* หัวเรื่อง = ชื่อโครงการ (subtitle ของ Header เป็นตัวพิมพ์ใหญ่ทั้งหมด จะเปลี่ยนหน้าตาชื่อ) · เลขที่ไว้บรรทัดรอง · "Rev" คงตัวพิมพ์เดิม (ไม่เป็น REV) */}
      <Header title={head.project_name || "ใบ BOQ"} subtitle={<>{h.doc_no} · <span className="normal-case">Rev {h.revision}</span></>} backHref={backHref}
        rightContent={data.revisions.length > 1 ? (
          <Dropdown className="w-36" value={String(h.id)} onChange={(v) => { if (v && v !== String(h.id)) void guardedPush(`/b2b/boq/${v}`); }}
            options={data.revisions.map((r) => ({ value: String(r.id), label: `Rev ${r.revision}${r.is_latest ? " (ล่าสุด)" : ""}` }))} />
        ) : undefined} />

      {/* แถบแท็บ + ยอดย่อ + ปุ่ม — ค้างใต้ Header (A+B: เห็นยอดทุกแท็บ ไม่ต้องสลับไปภาพรวม) */}
      <div ref={barRef} className="sticky z-30 border-b border-gray-200 bg-white" style={{ top: hdrH }}>
        {/* สูงคงที่ 52px ทุกแท็บ — เดิมยอดย่อโผล่เฉพาะแท็บรายการ แถบสูง 50 ↔ 61px เนื้อหาทั้งหน้ากระโดดตอนสลับแท็บ */}
        <div className="flex h-[52px] items-center gap-3 md:pr-6">
          {/* overflow-y-hidden — กัน Windows ขึ้น scrollbar ตั้งเล็กๆ ข้างแท็บ */}
          <div className="flex h-full min-w-0 overflow-x-auto overflow-y-hidden md:px-2" role="tablist">
            {tabBtn("overview", "ภาพรวม", alerts.length > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xxs font-bold text-amber-800">{alerts.length}</span>)}
            {tabBtn("items", "รายการ", <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-100 px-1.5 text-xxs font-bold text-gray-500">{effLines.length}</span>)}
          </div>
          <div className="ml-auto flex items-center gap-3 max-md:hidden">
            {/* ยอดย่อ — แท็บภาพรวมมีการ์ดตัวเลขใหญ่อยู่แล้ว ไม่แสดงซ้ำ */}
            <dl className={`hidden overflow-hidden rounded-lg border border-gray-200 ${curTab === "overview" ? "" : "xl:flex"}`}>
              <div className="px-3 py-0.5 leading-tight"><dt className="text-xxs text-gray-500">ราคาขาย (ก่อน VAT)</dt><dd className="text-sm font-bold tabular-nums text-gray-900">{thb0(sub.sale)}</dd></div>
              <div className="border-l border-gray-200 px-3 py-0.5 leading-tight"><dt className="text-xxs text-gray-500">ราคาขาย/Wp</dt><dd className="text-sm font-bold tabular-nums text-gray-900">{cap > 0 ? perWp(sub.sale, cap).toFixed(2) : "—"}</dd></div>
              <div className="border-l border-gray-200 px-3 py-0.5 leading-tight"><dt className="text-xxs text-gray-500">กำไร · Margin {Number(head.margin_pct) || 0}%</dt><dd className="text-sm font-bold tabular-nums text-emerald-600">{thb0(sub.sale - sub.cost)}</dd></div>
            </dl>
            <span className={`whitespace-nowrap text-sm ${dirty && !readOnly ? "font-semibold text-amber-700" : "text-gray-500"}`}>{statusText}</span>
            {/* ดึงจากใบอื่น = คำสั่งระดับใบ อยู่กลุ่มเดียวกับ Excel / ออก Rev (เดิมอยู่แถวตัวกรอง หน้าตาคล้ายชิปกรอง) · มือถืออยู่แถวเครื่องมือของแท็บรายการ */}
            {!readOnly && (
              <button type="button" onClick={() => setImportOpen(true)}
                className="h-9 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-600 hover:bg-gray-50">ดึงจากใบอื่น</button>
            )}
            {actionButtons}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-3 md:p-6">
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
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

        {curTab === "overview" && (
          <BoqOverview h={h} calc={calc} categories={categories} lines={effLines} margin={head.margin_pct} onMargin={(v) => setH({ margin_pct: v })}
            optionLabel={head.option_label} onOptionLabel={(v) => setH({ option_label: v })}
            readOnly={readOnly} alerts={alerts} flags={flagsOf} onGo={goTo} revisions={data.revisions} onRev={(rid) => void guardedPush(`/b2b/boq/${rid}`)} om={om}
            addonIds={addonIds} addonModes={head.addon_modes} onMode={(cid, mode) => setH({ addon_modes: { ...head.addon_modes, [cid]: mode } })}
            changedCount={changedKeys.length} onApplyAll={() => changedKeys.forEach(refresh)} />
        )}

        {curTab === "items" && (
          <div className="md:grid md:grid-cols-[250px_minmax(0,1fr)] md:items-start md:gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
            <aside className="max-md:hidden md:sticky md:overflow-y-auto" style={{ top: stickyTop + 16, maxHeight: `calc(100vh - ${stickyTop + 40}px)` }}>
              <BoqCategoryNav filled={stdFilled} empty={stdEmpty} addons={addonCats} addonChoices={addonChoices} calc={calc} flags={flagsOf}
                active={navActive} readOnly={readOnly} onGo={goTo}
                onOpenEmpty={(c) => goTo(c.id)} onAddAddon={(c) => addAddon(c, true)} />
            </aside>
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาในใบนี้ — ชื่อ / ยี่ห้อ / รุ่น / หมายเหตุ…"
                  className="h-9 min-w-[200px] flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
                <div className="flex flex-wrap items-center gap-1.5">
                  {chip("all", "ทั้งหมด", effLines.length)}
                  {chip("pend", "รอราคา", nPend, nPend > 0 ? "text-red-600" : "")}
                  {chip("chg", "ราคาเปลี่ยน", nChg, nChg > 0 ? "text-amber-700" : "")}
                  {chip("manual", "ใส่ราคาเอง", nManual)}
                </div>
                <div className="flex items-center gap-2 max-md:w-full">
                  {cardCats.length > 0 && (
                    <>
                      <button type="button" onClick={() => setOpenSet(new Set(cardCats.map((c) => c.id)))} style={{ minHeight: 0 }} className="whitespace-nowrap text-xs font-semibold text-gray-500 hover:text-primary">กางทั้งหมด</button>
                      <span className="text-gray-300">·</span>
                      <button type="button" onClick={() => setOpenSet(new Set())} style={{ minHeight: 0 }} className="whitespace-nowrap text-xs font-semibold text-gray-500 hover:text-primary">พับทั้งหมด</button>
                    </>
                  )}
                  {!readOnly && changedKeys.length > 0 && (
                    <button type="button" onClick={() => changedKeys.forEach(refresh)} style={{ minHeight: 0 }}
                      className="ml-2 whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-200">ใช้ราคาใหม่ทั้งหมด ({changedKeys.length})</button>
                  )}
                  {!readOnly && (
                    <button type="button" onClick={() => setImportOpen(true)} style={{ minHeight: 0 }}
                      className="ml-auto h-8 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 md:hidden">ดึงจากใบอื่น</button>
                  )}
                </div>
                {/* มือถือ: เมนูหมวดซ้ายซ่อน → เลือกหมวดจาก dropdown */}
                <div className="w-full md:hidden">
                  <Dropdown searchable value="" placeholder="ไปที่หมวด…" onChange={(v) => v && goTo(Number(v))}
                    options={[...std, ...addonCats].map((c) => ({ value: String(c.id), label: `${c.id}. ${c.name}${linesOf(c.id).length ? ` (${linesOf(c.id).length})` : ""}` }))} />
                </div>
              </div>

              {cardCats.length === 0 && (
                <div className="rounded-xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-400">
                  {filtering ? "ไม่มีบรรทัดตามตัวกรอง/คำค้น" : "ยังไม่มีรายการ — เลือกหมวดจากเมนูซ้ายเพื่อเริ่มใส่รายการ"}
                </div>
              )}
              {cardCats.map((c) => (
                <BoqCategorySection key={c.id} category={c} lines={linesOf(c.id)} calc={calc} readOnly={readOnly}
                  optional={c.is_addon && head.addon_modes[c.id] === "optional"}
                  onAddonMode={c.is_addon ? (mode) => setH({ addon_modes: { ...head.addon_modes, [c.id]: mode } }) : undefined}
                  omParams={om}
                  extra={c.id === OM_CATEGORY ? omPanel : undefined}
                  open={isOpen(c.id)} onToggle={() => toggle(c.id)} share={shareOf(c)} flags={flagsOf(c.id)}
                  visible={filtering ? visible : undefined} highlight={flash === c.id} scrollMarginTop={stickyTop + 12}
                  onChange={change} onRemove={remove} onRefresh={refresh} onPick={() => void openPicker(c)} onAddManual={() => addManual(c)}
                  onRemoveAddon={c.is_addon ? () => removeAddon(c.id) : undefined} />
              ))}
            </div>
          </div>
        )}

      </div>

      {/* มือถือ: แถบท้าย บันทึก / ออก Revision (desktop อยู่แถบแท็บ) — bottom-0 ทุกจอ: main มี pb-20 เผื่อแถบล่างมือถือแล้ว sticky นับ padding นั้นด้วย */}
      <div className="sticky bottom-0 z-30 border-t border-gray-200 bg-white/95 px-3 py-3 backdrop-blur md:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm ${dirty && !readOnly ? "font-semibold text-amber-700" : "text-gray-500"}`}>{statusText}</span>
          <div className="ml-auto flex items-center gap-2">{actionButtons}</div>
        </div>
      </div>

      {importOpen && (
        <ImportFromBoqDialog boqId={h.id} projectId={h.project_id} categories={categories} current={effLines}
          onImport={applyImport} onClose={() => setImportOpen(false)} />
      )}
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
