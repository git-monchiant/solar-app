"use client";
import { XIcon } from "@/components/ui/icons";
import Dropdown from "@/components/ui/Dropdown";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { formatTHB as fmt, formatThaiDate as fmtDate } from "@/lib/utils/formatters";
import { hasRole, useActiveRoles } from "@/lib/roles";

interface Package {
  id: number;
  name: string;
  kwp: number;
  phase: number;
  has_battery: boolean;
  has_panel: boolean;
  has_inverter: boolean;
  is_upgrade: boolean;
  is_other: boolean;
  battery_kwh: number | null;
  battery_brand: string | null;
  battery_model: string | null;
  inverter_kw: number | null;
  inverter_brand: string | null;
  inverter_model: string | null;
  installed_kwp: number | null;
  panel_count: number | null;
  panel_watt: number | null;
  panel_brand: string | null;
  price: number;
  monthly_installment: string | null;
  monthly_saving: number | null;
  warranty_years: number;
  is_active: boolean;
  start_date: string | null;
  expire_date: string | null;
  remark?: string | null;
}
type PackageItem = { item_name: string; quantity: number; unit: string | null };
type PricePeriod = {
  id?: number | null;
  price: number;
  monthly_installment: string | null;
  monthly_saving: number | null;
  start_date: string | null;
  expire_date: string | null;
  is_active: boolean;
  locked?: boolean;
  /** Lead ที่ยังใช้ราคาของช่วงนี้ได้ แม้ช่วงจะผ่านมาแล้ว เช่น "123,333,444" */
  allowed_lead_ids?: string | null;
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => ymd(new Date());
/** แสดงวันที่ให้เหมือนช่อง date ของเบราว์เซอร์ (DD/MM/YYYY ค.ศ.) ไม่ใช่ "1 ส.ค. 2569" */
const fmtPicker = (v: string | null | undefined) => {
  const day = (v || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
};
/** วันหมดอายุตั้งต้น = สิ้นเดือนของวันที่เริ่ม (ตามรูปแบบที่ใช้จริง 01/08–31/08) ไม่เดาปีเอง */
const endOfMonth = (from: string) => { const d = new Date(`${from}T00:00:00`); return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
/** ช่วงใหม่เริ่มต่อจากวันสิ้นสุดที่ไกลที่สุดของช่วงเดิม (+1 วัน) — ไม่ให้ช่วงคาบเกี่ยวกัน */
const nextStartAfter = (list: PricePeriod[]) => {
  const lastExpire = list.map(p => p.expire_date?.slice(0, 10)).filter(Boolean).sort().pop();
  if (!lastExpire) return todayStr();
  const d = new Date(`${lastExpire}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const next = ymd(d);
  return next < todayStr() ? todayStr() : next;   // ห้ามย้อนหลัง ถ้าช่วงเดิมหมดอายุไปแล้วให้เริ่มวันนี้
};
/** เรียงตามวันที่เริ่มใช้ (เก่า → ใหม่) — เรียงตอนโหลด/เพิ่มแถว ไม่เรียงระหว่างพิมพ์ ไม่งั้นแถวจะกระโดด */
const sortByStart = (list: PricePeriod[]) =>
  [...list].sort((a, b) => (a.start_date || "").localeCompare(b.start_date || "") || (a.id ?? 0) - (b.id ?? 0));
const blankPeriod = (active: boolean, start = todayStr()): PricePeriod => ({
  id: null, price: 0, monthly_installment: null, monthly_saving: null,
  start_date: start, expire_date: endOfMonth(start), is_active: active, allowed_lead_ids: null,
});
/** ล็อก = แก้/ลบไม่ได้ — ช่วงที่ Active หรือช่วงที่เริ่มไปแล้ว (เดือนที่ผ่านมา)
    เหลือแก้ได้เฉพาะช่วงในอนาคตที่ยังไม่ถึงวันเริ่ม */
const periodLocked = (p: PricePeriod) => {
  if (!p.id) return false;                                  // แถวใหม่ที่ยังไม่บันทึก แก้ได้เสมอ
  if (p.is_active) return true;
  const start = (p.start_date || "").slice(0, 10);
  return !!start && start <= todayStr();
};

/** ตัดขีด/บุลเล็ตนำหน้าออก — ในใบเสนอราคา PDF จะเติม "- " ให้เองอยู่แล้ว
    (ตรงกับ stripLeadMark ใน QuotationBuilder) */
const stripLeadMark = (name: string) => String(name || "").replace(/^\s*[-–—•]\s*/, "");

const empty: Omit<Package, "id"> = {
  name: "", kwp: 0, phase: 1, has_battery: false, has_panel: true, has_inverter: true, is_upgrade: false, is_other: false,
  battery_kwh: null, battery_brand: null,
  battery_model: null, inverter_kw: null, inverter_brand: null, inverter_model: null,
  installed_kwp: null, panel_count: null, panel_watt: null, panel_brand: null,
  price: 0, monthly_installment: null,
  monthly_saving: null, warranty_years: 10, is_active: true,
  start_date: new Date().toISOString().slice(0, 10),
  expire_date: `${new Date().getFullYear() + 99}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
};

export default function ManagePackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Package | (Omit<Package, "id"> & { id?: undefined }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [packageItems, setPackageItems] = useState<PackageItem[]>([]);
  const [periods, setPeriods] = useState<PricePeriod[]>([]);
  const [leadConfigKey, setLeadConfigKey] = useState<string | null>(null);
  const { activeRoles } = useActiveRoles();
  const isAdmin = hasRole(activeRoles, "admin");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [filterPhase, setFilterPhase] = useState<"all" | "0" | "1" | "3">("all");
  const [filterBat, setFilterBat] = useState<"all" | "yes" | "no">("all");
  const [filterUpgrade, setFilterUpgrade] = useState<"all" | "yes" | "no" | "other">("all");

  const load = () => {
    apiFetch("/api/packages?all=1").then(setPackages).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    if (!editing) setSaveError("");
  }, [editing]);
  // key = "new" หรือ id — ผูก effect กับ "โมดัลที่เปิดอยู่" ไม่ใช่ object ของ editing
  // ถ้า dep เป็น editing ตรงๆ จะ refetch ทุกครั้งที่พิมพ์ แล้วทับสิ่งที่ผู้ใช้แก้ไว้
  const editingKey = editing ? String(editing.id ?? "new") : null;
  useEffect(() => {
    if (!editingKey) { setPeriods([]); return; }
    if (editingKey === "new") { setPeriods([blankPeriod(true)]); return; }
    apiFetch(`/api/packages/${editingKey}/periods`)
      .then((rows: PricePeriod[]) => setPeriods(rows.length ? sortByStart(rows) : [blankPeriod(true)]))
      .catch(() => setPeriods([blankPeriod(true)]));
  }, [editingKey]);

  useEffect(() => {
    if (!editing?.id) { setPackageItems([]); return; }
    apiFetch(`/api/packages/${editing.id}/items`)
      .then((rows: PackageItem[]) => setPackageItems(rows.map(r => ({ ...r, item_name: stripLeadMark(r.item_name) }))))
      .catch(() => setPackageItems([]));
  }, [editing?.id]);

  const filtered = packages.filter(p => {
    if (filter === "active" && !p.is_active) return false;
    if (filter === "inactive" && p.is_active) return false;
    if (filterPhase !== "all" && p.phase !== parseInt(filterPhase)) return false;
    if (filterBat === "yes" && !p.has_battery) return false;
    if (filterBat === "no" && p.has_battery) return false;
    if (filterUpgrade === "yes" && !p.is_upgrade) return false;
    if (filterUpgrade === "no" && p.is_upgrade) return false;
    if (filterUpgrade === "other" && !p.is_other) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!p.name?.toLowerCase().includes(q) && !String(p.kwp).includes(q) && !p.inverter_brand?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const isExpired = (p: Package) => {
    if (!p.expire_date) return false;
    return new Date(String(p.expire_date).slice(0, 10)) < new Date(new Date().toISOString().slice(0, 10));
  };

  const isNotStarted = (p: Package) => {
    if (!p.start_date) return false;
    return new Date(String(p.start_date).slice(0, 10)) > new Date(new Date().toISOString().slice(0, 10));
  };

  const packageGroups = [
    {
      key: "on-grid",
      title: "ติดตั้งใหม่",
      subtitle: "ไม่มีแบตเตอรี่ (On-Grid)",
      match: (p: Package) => !p.has_battery && !p.is_upgrade && !p.is_other,
    },
    {
      key: "hybrid",
      title: "ติดตั้งใหม่",
      subtitle: "+ แบตเตอรี่ (Hybrid)",
      match: (p: Package) => p.has_battery && !p.is_upgrade && !p.is_other,
    },
    {
      key: "scale-up",
      title: "Scale Up",
      subtitle: "เพิ่มอุปกรณ์จากระบบเดิม",
      match: (p: Package) => p.is_upgrade && !p.is_other,
    },
    {
      key: "other",
      title: "อื่นๆ",
      subtitle: "Package ประเภทอื่นๆ",
      match: (p: Package) => p.is_other,
    },
  ];

  // เรียงตามชื่อภายในแต่ละกลุ่ม — numeric:true ทำให้ "3 kWp" มาก่อน "10 kWp"
  // (ถ้าเทียบเป็นข้อความล้วน "10" จะมาก่อน "3") ท้ายสุด tie-break ด้วย id
  const comparePackages = (a: Package, b: Package) =>
    (a.name || "").localeCompare(b.name || "", "th", { numeric: true, sensitivity: "base" }) || a.id - b.id;

  const displayedPackages = filter === "inactive" ? filtered : filtered.filter(p => p.is_active);

  const grouped = packageGroups
    .map(group => ({
      ...group,
      items: displayedPackages
        .filter(group.match)
        .sort(comparePackages),
    }))
    .filter(group => group.items.length > 0);

  const formatPhase = (phase: number) => phase === 0 ? "All Phase" : `${phase}P`;

  const inverterLabel = (pkg: Package) => [
    pkg.inverter_brand,
    pkg.inverter_kw != null ? `${pkg.inverter_kw}kW` : null,
    pkg.inverter_model,
  ].filter(Boolean).join(" · ");

  const batteryLabel = (pkg: Package) => [
    pkg.battery_brand,
    pkg.battery_kwh != null ? `${pkg.battery_kwh}kWh` : null,
    pkg.battery_model,
  ].filter(Boolean).join(" · ");

  const panelLabel = (pkg: Package) => [
    pkg.panel_brand,
    pkg.panel_count != null
      ? pkg.panel_watt != null
        ? `${pkg.panel_count}×${pkg.panel_watt}W`
        : `${pkg.panel_count} แผง`
      : null,
  ].filter(Boolean).join(" · ");

  const packageRemark = (pkg: Package) => {
    const remark = pkg.remark?.trim();
    if (remark) return remark;
    if (isExpired(pkg)) return "หมดอายุ";
    if (isNotStarted(pkg)) return "ยังไม่เริ่ม";
    if (pkg.is_other) return "Package อื่นๆ";
    if (pkg.is_upgrade) return pkg.has_panel ? "เพิ่มแผง / แบตเตอรี่" : "เพิ่มแบตเตอรี่";
    return "อันราคาเดิม";
  };

  const save = async () => {
    if (!editing || !editing.name.trim()) return;
    setSaveError("");
    setSaving(true);
    try {
      // ราคา/ผ่อน/ประหยัด/ช่วงวันที่ บน packages = ค่าจากช่วงราคาที่ตั้งเป็น "ใช้งาน"
      // ราคาบน packages = ช่วงที่ Active (ถ้ายังไม่มี ใช้ช่วงแรกไปก่อน เดี๋ยว sync ตามวันที่จะแก้ให้เอง)
      const activePeriod = periods.find(p => p.is_active) || periods[0];
      if (periods.some(p => !p.id && (p.start_date || "").slice(0, 10) < todayStr())) {
        setSaveError("สร้างช่วงราคาย้อนหลังไม่ได้ — วันที่เริ่มใช้ต้องเป็นวันนี้หรือหลังจากนั้น");
        setSaving(false);
        return;
      }
      if (periods.some(p => !(Number(p.price) > 0))) {
        setSaveError("กรุณาระบุราคาขายให้ครบทุกช่วง");
        setSaving(false);
        return;
      }
      const badRange = periods.find(p => p.start_date && p.expire_date && p.expire_date.slice(0, 10) < p.start_date.slice(0, 10));
      if (badRange) {
        setSaveError("วันหมดอายุต้องไม่ก่อนวันที่เริ่มใช้");
        setSaving(false);
        return;
      }
      const payload = {
        ...editing,
        price: Number(activePeriod?.price) || 0,
        monthly_installment: activePeriod?.monthly_installment ?? null,
        monthly_saving: activePeriod?.monthly_saving ?? null,
        start_date: activePeriod?.start_date || editing.start_date,
        expire_date: activePeriod?.expire_date || editing.expire_date,
      };
      let packageId: number;
      if (editing.id) {
        await apiFetch(`/api/packages/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        packageId = editing.id;
      } else {
        const created = await apiFetch("/api/packages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        packageId = created.id;
      }
      const savedPeriods: PricePeriod[] = await apiFetch(`/api/packages/${packageId}/periods`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(periods) });
      if (Array.isArray(savedPeriods)) setPeriods(sortByStart(savedPeriods));
      const cleanItems = packageItems.map(it => ({ ...it, item_name: stripLeadMark(it.item_name) }));
      await apiFetch(`/api/packages/${packageId}/items`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cleanItems) });
      setEditing(null);
      load();
    } catch (e) {
      console.error(e);
      setSaveError(e instanceof Error && e.message ? e.message : "บันทึก Package ไม่สำเร็จ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแลระบบ");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (pkg: Package) => {
    await apiFetch(`/api/packages/${pkg.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !pkg.is_active }) });
    load();
  };

  // Shared field styling for the edit modal — one source of truth so every
  // input in the form lines up instead of drifting per-section.
  // แยกขนาดตัวอักษรออกจาก base เพราะ Tailwind เรียง utility ตาม scale ไม่ใช่ตามลำดับใน className
  // ถ้ารวม text-sm ไว้ใน base แล้วต่อท้ายด้วย text-xs จะไม่มีผล (text-sm ชนะเสมอ)
  const fieldBase = "w-full h-9 px-3 rounded-lg border border-gray-200 bg-white outline-none transition-colors hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10";
  const fieldCls = `${fieldBase} text-sm`;
  const labelCls = "block text-xs font-semibold text-gray-500 mb-1";

  if (loading) return <div className="flex items-center justify-center h-full py-20"><div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div>
      <Header title="จัดการ Packages" subtitle="PACKAGE MANAGEMENT" />

      <div className="p-4 md:p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..." className="h-8 px-4 rounded-lg border border-gray-200 text-sm flex-1 min-w-[200px] focus:outline-none focus:border-primary" />
          <Dropdown className="w-36" value={filter} onChange={v => { if (v) setFilter(v as typeof filter); }} options={[
            { value: "all", label: "ทั้งหมด" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]} />
          <Dropdown className="w-36" value={filterPhase} onChange={v => { if (v) setFilterPhase(v as typeof filterPhase); }} options={[
            { value: "all", label: "All Phase" },
            { value: "1", label: "1 Phase" },
            { value: "3", label: "3 Phase" },
          ]} />
          <Dropdown className="w-40" value={filterBat} onChange={v => { if (v) setFilterBat(v as typeof filterBat); }} options={[
            { value: "all", label: "Battery ทั้งหมด" },
            { value: "yes", label: "มี Battery" },
            { value: "no", label: "ไม่มี Battery" },
          ]} />
          <Dropdown className="w-40" value={filterUpgrade} onChange={v => { if (v) setFilterUpgrade(v as typeof filterUpgrade); }} options={[
            { value: "all", label: "ทุกประเภท" },
            { value: "yes", label: "Scale Up" },
            { value: "no", label: "ไม่ใช่ Scale Up" },
            { value: "other", label: "อื่นๆ" },
          ]} />
          {isAdmin && (
            <button type="button" onClick={() => { setSaveError(""); setEditing({ ...empty }); }} className="h-8 px-5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors">+ เพิ่ม Package</button>
          )}
        </div>

        {/* Price list */}
        <div className="hidden">
          <div className="px-5 py-3 border-b border-gray-200 bg-primary/5 text-center">
            <h2 className="text-lg font-bold text-gray-900">Package Solar มาตรฐาน</h2>
          </div>

          {grouped.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">ไม่พบ Package ตามเงื่อนไขที่เลือก</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                    <th className="w-[150px] px-4 py-3 text-left border-b border-gray-200">Group</th>
                    <th className="px-4 py-3 text-left border-b border-gray-200">Package</th>
                    <th className="w-[190px] px-4 py-3 text-right border-b border-gray-200">Base Price รวม Vat</th>
                    <th className="w-[210px] px-4 py-3 text-left border-b border-gray-200">Remark</th>
                    <th className="w-[150px] px-4 py-3 text-right border-b border-gray-200">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(group => group.items.map((pkg, index) => (
                    <tr key={pkg.id} className={`border-b border-gray-100 transition-colors hover:bg-primary/5 ${!pkg.is_active ? "opacity-50" : ""}`}>
                      {index === 0 && (
                        <td rowSpan={group.items.length} className="px-4 py-4 align-middle border-r border-gray-100 bg-gray-50/70">
                          <div className="font-bold text-gray-900">{group.title}</div>
                          <div className="mt-1 text-xs font-semibold text-gray-400 leading-snug">{group.subtitle}</div>
                        </td>
                      )}
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-gray-900">{pkg.name}</span>
                          {pkg.is_upgrade && <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-600 shrink-0">SCALE UP</span>}
                          {pkg.is_other && <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">อื่นๆ</span>}
                          <span className="text-xs font-mono text-gray-500 shrink-0">{pkg.kwp} kWp ยท {formatPhase(pkg.phase)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {pkg.has_panel && <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-600 font-semibold">Panel {panelLabel(pkg)}</span>}
                          {pkg.has_inverter && inverterLabel(pkg) && <span className="text-xs px-2 py-0.5 rounded bg-violet-50 text-violet-600 font-semibold">Inv {inverterLabel(pkg)}</span>}
                          {pkg.has_battery && batteryLabel(pkg) && <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-600 font-semibold">Bat {batteryLabel(pkg)}</span>}
                        </div>
                        <div className="mt-2 text-xs text-gray-400">
                          {fmtDate(pkg.start_date)} - {fmtDate(pkg.expire_date)}
                          {isNotStarted(pkg) && <span className="ml-2 text-blue-600 font-semibold">ยังไม่เริ่ม</span>}
                          {isExpired(pkg) && <span className="ml-2 text-red-600 font-semibold">หมดอายุ</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <span className="text-lg font-bold font-mono tabular-nums text-gray-900">{fmt(pkg.price)}</span>
                        <span className="ml-1 text-xs font-semibold text-gray-400">THB</span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="text-sm font-semibold text-gray-600">{packageRemark(pkg)}</span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col items-end gap-2">
                          <button type="button" onClick={() => toggleActive(pkg)} disabled={!isAdmin} className={`text-xs font-bold uppercase px-3 py-1.5 rounded-full ${!isAdmin ? "cursor-default " : ""}${pkg.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                            {pkg.is_active ? "ACTIVE" : "INACTIVE"}
                          </button>
                          <button type="button" onClick={() => setEditing({ ...pkg })} className="text-sm text-primary font-semibold hover:underline">เนเธเนเนเธ</button>
                        </div>
                      </td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Cards */}
        <div className="space-y-5">
          {grouped.length === 0 ? (
            <div className="rounded-xl bg-white border border-gray-300 px-5 py-10 text-center text-sm text-gray-400">ไม่พบ Package ตามเงื่อนไขที่เลือก</div>
          ) : grouped.map(group => (
            <section key={group.key} className="space-y-3">
              <div className="flex items-baseline gap-2 px-1">
                <h2 className="text-sm font-bold text-gray-900">{group.title}</h2>
                <span className="text-xs font-semibold text-gray-400">{group.subtitle}</span>
                <span className="text-xs font-mono text-gray-400">({group.items.length})</span>
              </div>
              {group.items.map(pkg => (
            <div key={pkg.id} className={`rounded-xl bg-white border border-gray-300 overflow-hidden transition-all ${!pkg.is_active ? "opacity-50" : ""}`}>
              <div className="px-5 py-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Row 1: Name + badges */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold text-lg text-gray-900 truncate">{pkg.name}</span>
                    {pkg.is_upgrade && <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-600 shrink-0">SCALE UP</span>}
                    {pkg.is_other && <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">อื่นๆ</span>}
                    <span className="text-sm font-mono text-gray-500 shrink-0">{pkg.kwp} kWp · {pkg.phase === 0 ? "All Phase" : `${pkg.phase}P`}</span>
                    {pkg.installed_kwp != null && pkg.installed_kwp !== pkg.kwp && <span className="text-xs font-semibold text-sky-600 shrink-0">ติดตั้งจริง {pkg.installed_kwp} kWp</span>}
                  </div>

                  {/* Row 2: Price + Components */}
                  <div className="flex items-center gap-4 mb-2">
                    <span className="text-xl font-bold font-mono tabular-nums text-gray-900">{fmt(pkg.price)} <span className="text-sm text-gray-400">THB</span></span>
                    <div className="flex items-center gap-1.5">
                      {pkg.has_panel && <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-600 font-semibold">Panel {panelLabel(pkg)}</span>}
                      {pkg.has_inverter && inverterLabel(pkg) && <span className="text-xs px-2 py-0.5 rounded bg-violet-50 text-violet-600 font-semibold">Inv {inverterLabel(pkg)}</span>}
                      {pkg.has_battery && batteryLabel(pkg) && <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-600 font-semibold">Bat {batteryLabel(pkg)}</span>}
                    </div>
                  </div>

                  {/* Row 3: Dates */}
                  <div className="text-sm text-gray-400">
                    {fmtDate(pkg.start_date)} — {fmtDate(pkg.expire_date)}
                    {isNotStarted(pkg) && <span className="ml-2 text-blue-600 font-semibold">ยังไม่เริ่ม</span>}
                    {isExpired(pkg) && <span className="ml-2 text-red-600 font-semibold">หมดอายุ</span>}
                  </div>
                </div>

                {/* Right: status + edit */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button type="button" onClick={() => toggleActive(pkg)} disabled={!isAdmin} className={`text-xs font-bold uppercase px-3 py-1.5 rounded-full ${!isAdmin ? "cursor-default " : ""}${pkg.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {pkg.is_active ? "ACTIVE" : "INACTIVE"}
                  </button>
                  {isAdmin && (
                    <button type="button" onClick={() => setEditing({ ...pkg })} className="text-sm text-primary font-semibold hover:underline">แก้ไข</button>
                  )}
                </div>
              </div>
            </div>
              ))}
            </section>
          ))}
        </div>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-50 flex items-start justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/20 w-full max-w-6xl my-2">
            <div className="bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 truncate">{editing.id ? "แก้ไข Package" : "เพิ่ม Package ใหม่"}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{editing.id ? `รหัส #${editing.id} · ${editing.name || "ไม่มีชื่อ"}` : "กรอกรายละเอียดแพ็กเกจใหม่"}</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="w-9 h-9 shrink-0 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
                <XIcon className="w-5 h-5 text-gray-500" strokeWidth={2} />
              </button>
            </div>

            <div className="p-4 md:p-6 space-y-4 bg-slate-50/50">
              {/* ── ข้อมูลหลัก ─────────────────────────────── */}
              <section className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-bold text-gray-800 mb-3">ข้อมูลหลัก</div>
                <div className="grid gap-3 md:grid-cols-12">
                  <div className="md:col-span-6">
                    <label className={labelCls}>ชื่อ Package <span className="text-red-500">*</span></label>
                    <input type="text" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="เช่น 5 kWp Hybrid" className={fieldCls} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>ขนาด (kWp)</label>
                    <input type="number" step="0.1" value={editing.kwp || ""} onChange={e => setEditing({ ...editing, kwp: parseFloat(e.target.value) || 0 })} placeholder="0" className={`text-right ${fieldCls}`} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>Phase</label>
                    <Dropdown heightClassName="h-9" value={String(editing.phase)} onChange={v => setEditing({ ...editing, phase: parseInt(v) || 0 })} options={[
                      { value: "0", label: "All Phase" },
                      { value: "1", label: "1 Phase" },
                      { value: "3", label: "3 Phase" },
                    ]} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>รับประกัน (ปี)</label>
                    <input type="number" value={editing.warranty_years || ""} onChange={e => setEditing({ ...editing, warranty_years: parseInt(e.target.value) || 0 })} placeholder="0" className={`text-right ${fieldCls}`} />
                  </div>
                  <div className="md:col-span-12">
                    <label className={labelCls}>ประเภท</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: "has_panel", label: "Panel", activeClass: "bg-amber-50 text-amber-700 border-amber-300" },
                        { key: "has_inverter", label: "Inverter", activeClass: "bg-violet-50 text-violet-700 border-violet-300" },
                        { key: "has_battery", label: "Battery", activeClass: "bg-green-50 text-green-700 border-green-300" },
                        { key: "is_upgrade", label: "Scale Up", activeClass: "bg-blue-50 text-blue-700 border-blue-300" },
                        { key: "is_other", label: "อื่นๆ", activeClass: "bg-primary/10 text-primary border-primary/40" },
                      ].map(f => (
                        <button key={f.key} type="button" onClick={() => setEditing({ ...editing, [f.key]: !(editing as Record<string, unknown>)[f.key] })}
                          className={`h-9 px-3.5 rounded-lg text-xs font-semibold border transition-all ${(editing as Record<string, unknown>)[f.key] ? f.activeClass : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"}`}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* ── สเปกอุปกรณ์ · Inverter / Battery / Panel ───────── */}
              <div className="grid gap-3 md:grid-cols-3">
                <section className="rounded-xl border border-violet-200 bg-white p-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-violet-500" />
                    <div className="text-xs font-bold text-violet-700">Inverter</div>
                  </div>
                  <div>
                    <label className={labelCls}>ขนาด (kW)</label>
                    <input type="number" step="0.1" value={editing.inverter_kw ?? ""} onChange={e => setEditing({ ...editing, inverter_kw: e.target.value ? parseFloat(e.target.value) : null })} placeholder="-" className={fieldCls} />
                  </div>
                  <div>
                    <label className={labelCls}>ยี่ห้อ</label>
                    <input type="text" value={editing.inverter_brand ?? ""} onChange={e => setEditing({ ...editing, inverter_brand: e.target.value || null })} placeholder="เช่น HUAWEI" className={fieldCls} />
                  </div>
                  <div>
                    <label className={labelCls}>รุ่น</label>
                    <input type="text" value={editing.inverter_model ?? ""} onChange={e => setEditing({ ...editing, inverter_model: e.target.value || null })} placeholder="เช่น SUN2000-5KTL" className={fieldCls} />
                  </div>
                </section>
                <section className="rounded-xl border border-green-200 bg-white p-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <div className="text-xs font-bold text-green-700">Battery</div>
                  </div>
                  <div>
                    <label className={labelCls}>ความจุ (kWh)</label>
                    <input type="number" step="0.1" value={editing.battery_kwh ?? ""} onChange={e => setEditing({ ...editing, battery_kwh: e.target.value ? parseFloat(e.target.value) : null })} placeholder="-" className={fieldCls} />
                  </div>
                  <div>
                    <label className={labelCls}>ยี่ห้อ</label>
                    <input type="text" value={editing.battery_brand ?? ""} onChange={e => setEditing({ ...editing, battery_brand: e.target.value || null })} placeholder="-" className={fieldCls} />
                  </div>
                  <div>
                    <label className={labelCls}>รุ่น</label>
                    <input type="text" value={editing.battery_model ?? ""} onChange={e => setEditing({ ...editing, battery_model: e.target.value || null })} placeholder="-" className={fieldCls} />
                  </div>
                </section>
                <section className="rounded-xl border border-amber-200 bg-white p-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <div className="text-xs font-bold text-amber-700">แผงโซลาร์ (Panel)</div>
                  </div>
                  <div>
                    <label className={labelCls}>ขนาดติดตั้งจริง (kWp)</label>
                    <input type="number" step="0.01" value={editing.installed_kwp ?? ""} onChange={e => setEditing({ ...editing, installed_kwp: e.target.value ? parseFloat(e.target.value) : null })} placeholder="-" className={fieldCls} />
                  </div>
                  <div>
                    <label className={labelCls}>ยี่ห้อ</label>
                    <input type="text" value={editing.panel_brand ?? ""} onChange={e => setEditing({ ...editing, panel_brand: e.target.value || null })} placeholder="เช่น JINKO" className={fieldCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>จำนวนแผง</label>
                      <input type="number" value={editing.panel_count ?? ""} onChange={e => setEditing({ ...editing, panel_count: e.target.value ? parseInt(e.target.value) : null })} placeholder="-" className={`text-right ${fieldCls}`} />
                    </div>
                    <div>
                      <label className={labelCls}>วัตต์/แผง</label>
                      <input type="number" value={editing.panel_watt ?? ""} onChange={e => setEditing({ ...editing, panel_watt: e.target.value ? parseInt(e.target.value) : null })} placeholder="-" className={`text-right ${fieldCls}`} />
                    </div>
                  </div>
                </section>
              </div>

              {/* ── ราคาขาย & ช่วงเวลาใช้งาน — หลายช่วงราคา ใช้ครั้งละ 1 ช่วง ── */}
              <section className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="text-xs font-bold text-gray-800"
                      title="ระบบสลับ Active ตามวันที่ · ช่วงที่ Active และช่วงที่ผ่านมาแล้วแก้ไขไม่ได้">
                      ราคาขาย &amp; ช่วงเวลาใช้งาน
                    </div>
                  </div>
                  <button type="button" onClick={() => setPeriods(v => sortByStart([...v, blankPeriod(v.length === 0, nextStartAfter(v))]))}
                    className="h-8 px-3 shrink-0 rounded-lg border border-primary/30 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors">
                    + เพิ่มช่วงราคา
                  </button>
                </div>

                {/* หัวตาราง — ใช้ flex ครอบ grid เพื่อให้ปุ่มลบอยู่นอกคอลัมน์ ทุกช่องเลยกว้างเท่ากันทุกแถว */}
                <div className="hidden md:flex items-center gap-2 px-1.5 pb-1 text-xxs font-semibold text-gray-400">
                  <div className="grid flex-1 grid-cols-12 gap-2">
                    <span className="col-span-2">สถานะ</span>
                    <span className="col-span-2">วันเริ่มใช้</span>
                    <span className="col-span-2">วันหมดอายุ</span>
                    <span className="col-span-2 text-right">ราคาขาย (รวม VAT)</span>
                    <span className="col-span-2">ผ่อน/เดือน</span>
                    <span className="col-span-2 text-right">ประหยัด/เดือน</span>
                  </div>
                  <span className="w-9 shrink-0" aria-hidden="true" />
                </div>

                <div className="space-y-1.5">{periods.map((p, index) => {
                  const locked = periodLocked(p);
                  const upcoming = !p.is_active && (p.start_date || "").slice(0, 10) > todayStr();
                  const set = (patch: Partial<PricePeriod>) => setPeriods(v => v.map((x, i) => i === index ? { ...x, ...patch } : x));
                  const readOnlyCell = "flex items-center h-9 px-3 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-500";
                  const rowKey = String(p.id ?? `new-${index}`);
                  return (
                    <div key={rowKey} className="space-y-1">
                    <div
                      className={`flex items-center gap-2 rounded-lg border p-1.5 ${
                        p.is_active ? "border-green-200 bg-green-50/40" : upcoming ? "border-amber-100" : "border-transparent"}`}>
                      <div className="grid flex-1 grid-cols-12 gap-2 items-center">
                        {/* สถานะอย่างเดียว ไม่ใช่ปุ่ม — ระบบสลับ Active ให้เองตามวันที่ */}
                        <div className="col-span-12 md:col-span-2">
                          {p.is_active ? (
                            <span className="inline-flex h-6 w-full max-w-[124px] items-center justify-center rounded-full border border-green-300 bg-green-100 text-xxs font-bold text-green-700"
                              title="ช่วงราคาที่ใช้อยู่วันนี้">Active</span>
                          ) : upcoming ? (
                            <span className="inline-flex h-6 w-full max-w-[124px] items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-xxs font-bold text-amber-600 whitespace-nowrap"
                              title={`ระบบจะเปลี่ยนมาใช้ช่วงนี้เองวันที่ ${fmtPicker(p.start_date)}`}>Active อัตโนมัติ</span>
                          ) : (
                            <span className="inline-flex h-6 w-full max-w-[124px] items-center justify-center rounded-full border border-transparent text-xxs font-semibold text-gray-300"
                              title="ช่วงของเดือนที่ผ่านมาแล้ว">Inactive</span>
                          )}
                        </div>

                        {locked ? (
                          <>
                            <div className={`col-span-6 md:col-span-2 ${readOnlyCell}`}>{fmtPicker(p.start_date) || "-"}</div>
                            <div className={`col-span-6 md:col-span-2 ${readOnlyCell}`}>{fmtPicker(p.expire_date) || "-"}</div>
                          </>
                        ) : (
                          <>
                            {/* เลือกวันเริ่ม → เติมวันหมดอายุเป็นสิ้นเดือนของเดือนนั้นให้อัตโนมัติ */}
                            <input type="date" value={p.start_date?.slice(0, 10) || ""}
                              onChange={e => set(e.target.value
                                ? { start_date: e.target.value, expire_date: endOfMonth(e.target.value) }
                                : { start_date: null })}
                              min={todayStr()} title="เลือกย้อนหลังไม่ได้ — เริ่มได้ตั้งแต่วันนี้เป็นต้นไป"
                              className={`col-span-6 md:col-span-2 ${fieldCls}`} />
                            <input type="date" value={p.expire_date?.slice(0, 10) || ""} onChange={e => set({ expire_date: e.target.value || null })}
                              min={(p.start_date || "").slice(0, 10) > todayStr() ? (p.start_date || "").slice(0, 10) : todayStr()}
                              title="วันหมดอายุต้องไม่ย้อนหลัง และไม่ก่อนวันที่เริ่มใช้"
                              className={`col-span-6 md:col-span-2 ${fieldCls}`} />
                          </>
                        )}

                        {locked ? (
                          <div className={`col-span-12 md:col-span-2 justify-end gap-1.5 ${readOnlyCell}`} title="ช่วงนี้แก้ราคาไม่ได้">
                            <span aria-hidden="true" className="text-gray-400">🔒</span>
                            <span className="font-mono font-bold tabular-nums text-gray-800">{fmt(p.price)}</span>
                          </div>
                        ) : (
                          <input type="number" value={p.price || ""} onChange={e => set({ price: parseFloat(e.target.value) || 0 })}
                            placeholder="ระบุราคา" required title="ต้องระบุราคาขาย"
                            className={`col-span-12 md:col-span-2 text-right font-semibold ${fieldBase} text-sm ${
                              Number(p.price) > 0 ? "" : "border-red-300 bg-red-50/40"}`} />
                        )}

                        {locked ? (
                          <div className={`col-span-6 md:col-span-2 ${readOnlyCell}`}>{p.monthly_installment || "-"}</div>
                        ) : (
                          <input type="text" value={p.monthly_installment ?? ""} onChange={e => set({ monthly_installment: e.target.value || null })}
                            placeholder="เช่น 3,500" className={`col-span-6 md:col-span-2 ${fieldCls}`} />
                        )}

                        {locked ? (
                          <div className={`col-span-6 md:col-span-2 justify-end font-mono tabular-nums ${readOnlyCell}`}>
                            {p.monthly_saving != null ? fmt(p.monthly_saving) : "-"}
                          </div>
                        ) : (
                          <input type="number" value={p.monthly_saving ?? ""} onChange={e => set({ monthly_saving: e.target.value ? parseFloat(e.target.value) : null })}
                            placeholder="0" className={`col-span-6 md:col-span-2 text-right ${fieldCls}`} />
                        )}
                      </div>

                      {locked && !p.is_active && isAdmin ? (
                        <button type="button"
                          onClick={() => setLeadConfigKey(rowKey === leadConfigKey ? null : rowKey)}
                          aria-label="กำหนด Lead ที่ใช้ราคานี้ได้"
                          title="กำหนด Lead ที่ยังใช้ราคานี้ได้"
                          className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-lg transition-colors ${
                            p.allowed_lead_ids ? "text-primary bg-primary/10" : "text-gray-300 hover:bg-gray-100 hover:text-gray-600"}`}>⚙</button>
                      ) : (
                        <button type="button" disabled={locked || periods.length === 1}
                          onClick={() => setPeriods(v => v.filter((_, i) => i !== index))}
                          aria-label="ลบช่วงราคา"
                          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-300 transition-colors">×</button>
                      )}
                    </div>

                    {leadConfigKey === rowKey && (
                      <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 pl-3">
                        <span className="shrink-0 text-xxs font-semibold text-gray-500"
                          title="มีผลกับทุก Package ที่มีช่วงราคาเริ่มวันเดียวกัน">
                          ระบุ Lead Id ที่สามารถใช้ชุดราคาย้อนหลังได้
                        </span>
                        <input
                          autoFocus
                          value={p.allowed_lead_ids ?? ""}
                          onChange={e => set({ allowed_lead_ids: e.target.value })}
                          placeholder="เช่น 123,333,444"
                          className={`flex-1 ${fieldBase} text-xs`} />
                      </div>
                    )}
                  </div>
                  );
                })}</div>
              </section>

              {/* ── อุปกรณ์หลักใน Package (เต็มความกว้าง) ───────── */}
              <section className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-xs font-bold text-gray-800">อุปกรณ์หลักใน Package</div>

                    </div>
                    <button type="button" onClick={() => setPackageItems(v => [...v, { item_name: "", quantity: 1, unit: "ชุด" }])}
                      className="h-8 px-3 shrink-0 rounded-lg border border-primary/30 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors">
                      + เพิ่มอุปกรณ์
                    </button>
                  </div>
                  {packageItems.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">ยังไม่มีรายการอุปกรณ์</div>
                  ) : (
                    <>
                      <div className="hidden md:grid grid-cols-12 gap-2 px-1 pb-1 text-xxs font-semibold text-gray-400">
                        <span className="col-span-9">ชื่ออุปกรณ์/บริการ</span>
                        <span className="col-span-1 text-center">จำนวน</span>
                        <span className="col-span-1">หน่วย</span>
                      </div>
                      <div className="space-y-1">{packageItems.map((item, index) => {
                        const isHead = index === 0;
                        return (
                          <div key={index}>
                            <div className={`grid grid-cols-12 items-center gap-2 ${isHead ? "rounded-lg bg-primary/5 p-1.5 -mx-1.5" : ""}`}>
                              <div className={`col-span-9 flex min-w-0 items-center gap-2 ${isHead ? "" : "pl-7"}`}>
                                {isHead ? (
                                  <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-xxs font-bold text-white">หัวข้อ</span>
                                ) : (
                                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                                )}
                                <input
                                  value={item.item_name}
                                  onChange={e => setPackageItems(v => v.map((x, i) => i === index ? { ...x, item_name: stripLeadMark(e.target.value) } : x))}
                                  placeholder={isHead ? "ชื่อที่แสดงบนเอกสาร" : "รายละเอียดใต้หัวข้อ"}
                                  className={`min-w-0 flex-1 ${fieldBase} ${isHead ? "text-sm font-bold text-gray-900" : "text-xs text-gray-600"}`}
                                />
                              </div>
                              <input type="number" min="1" value={item.quantity || ""} onChange={e => setPackageItems(v => v.map((x, i) => i === index ? { ...x, quantity: Number(e.target.value) } : x))} className={`col-span-1 text-center ${fieldBase} ${isHead ? "text-sm" : "text-xs"}`} />
                              <input value={item.unit ?? ""} onChange={e => setPackageItems(v => v.map((x, i) => i === index ? { ...x, unit: e.target.value || null } : x))} placeholder="หน่วย" className={`col-span-1 ${fieldBase} ${isHead ? "text-sm" : "text-xs"}`} />
                              <button type="button" onClick={() => setPackageItems(v => v.filter((_, i) => i !== index))} aria-label="ลบรายการ"
                                className="col-span-1 h-9 flex items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-600 transition-colors">×</button>
                            </div>
                            {isHead && packageItems.length > 1 && (
                              <div className="mt-2 mb-1 pl-7 text-xxs font-semibold text-gray-400">รายละเอียดใต้หัวข้อ</div>
                            )}
                          </div>
                        );
                      })}</div>
                    </>
                  )}
              </section>
            </div>

            {/* Actions — active toggle + save/cancel */}
            <div className="bg-white px-6 py-3 border-t border-gray-100 flex items-center gap-3 rounded-b-2xl">
              <div className="flex items-center gap-2.5">
                <div role="button" onClick={() => setEditing({ ...editing, is_active: !editing.is_active })}
                  className={`relative cursor-pointer rounded-full transition-colors ${editing.is_active ? "bg-emerald-500" : "bg-gray-300"}`}
                  style={{ width: "44px", height: "24px", minWidth: "44px", minHeight: "24px" }}>
                  <div className="absolute rounded-full bg-white shadow-sm transition-all"
                    style={{ width: "18px", height: "18px", top: "3px", left: editing.is_active ? "23px" : "3px" }} />
                </div>
                <span className={`text-sm font-semibold ${editing.is_active ? "text-emerald-700" : "text-gray-500"}`}>{editing.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>
              </div>
              {saveError && <p role="alert" className="text-xs font-medium text-red-600">{saveError}</p>}
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={() => setEditing(null)} className="h-9 px-5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">ยกเลิก</button>
                <button type="button" onClick={save} disabled={saving || !editing.name.trim()} className="h-9 px-6 rounded-lg bg-primary text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                  {saving ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
