"use client";
import { XIcon } from "@/components/ui/icons";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { formatTHB as fmt, formatThaiDate as fmtDate } from "@/lib/utils/formatters";

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
  useEffect(() => {
    if (!editing?.id) { setPackageItems([]); return; }
    apiFetch(`/api/packages/${editing.id}/items`).then(setPackageItems).catch(() => setPackageItems([]));
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

  const packageDisplayOrder = new Map([
    1, 2, 3, 25,
    17, 4, 5, 6, 7, 26,
    18, 19, 20, 21, 24, 22, 27, 23, 28, 29, 30, 31,
  ].map((id, index) => [id, index]));

  const comparePackages = (a: Package, b: Package) => {
    const orderA = packageDisplayOrder.get(a.id) ?? 9999;
    const orderB = packageDisplayOrder.get(b.id) ?? 9999;
    return orderA - orderB || a.kwp - b.kwp || a.phase - b.phase || a.price - b.price || a.id - b.id;
  };

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
      let packageId: number;
      if (editing.id) {
        await apiFetch(`/api/packages/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
        packageId = editing.id;
      } else {
        const created = await apiFetch("/api/packages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
        packageId = created.id;
      }
      await apiFetch(`/api/packages/${packageId}/items`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(packageItems) });
      setEditing(null);
      load();
    } catch (e) {
      console.error(e);
      setSaveError("บันทึก Package ไม่สำเร็จ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแลระบบ");
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
  const fieldCls = "w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm outline-none transition-colors hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10";
  const labelCls = "block text-xs font-semibold text-gray-500 mb-1";

  if (loading) return <div className="flex items-center justify-center h-full py-20"><div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div>
      <Header title="จัดการ Packages" subtitle="PACKAGE MANAGEMENT" />

      <div className="p-4 md:p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..." className="h-8 px-4 rounded-lg border border-gray-200 text-sm flex-1 min-w-[200px] focus:outline-none focus:border-primary" />
          <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} className="h-8 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary">
            <option value="all">ทั้งหมด</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={filterPhase} onChange={e => setFilterPhase(e.target.value as typeof filterPhase)} className="h-8 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary">
            <option value="all">All Phase</option>
            <option value="1">1 Phase</option>
            <option value="3">3 Phase</option>
          </select>
          <select value={filterBat} onChange={e => setFilterBat(e.target.value as typeof filterBat)} className="h-8 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary">
            <option value="all">Battery ทั้งหมด</option>
            <option value="yes">มี Battery</option>
            <option value="no">ไม่มี Battery</option>
          </select>
          <select value={filterUpgrade} onChange={e => setFilterUpgrade(e.target.value as typeof filterUpgrade)} className="h-8 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary">
            <option value="all">ทุกประเภท</option>
            <option value="yes">Scale Up</option>
            <option value="no">ไม่ใช่ Scale Up</option>
            <option value="other">อื่นๆ</option>
          </select>
          <button type="button" onClick={() => { setSaveError(""); setEditing({ ...empty }); }} className="h-8 px-5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors">+ เพิ่ม Package</button>
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
                          <button type="button" onClick={() => toggleActive(pkg)} className={`text-xs font-bold uppercase px-3 py-1.5 rounded-full ${pkg.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
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
                  <button type="button" onClick={() => toggleActive(pkg)} className={`text-xs font-bold uppercase px-3 py-1.5 rounded-full ${pkg.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {pkg.is_active ? "ACTIVE" : "INACTIVE"}
                  </button>
                  <button type="button" onClick={() => setEditing({ ...pkg })} className="text-sm text-primary font-semibold hover:underline">แก้ไข</button>
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
              <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
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
                    <select value={editing.phase} onChange={e => setEditing({ ...editing, phase: parseInt(e.target.value) })} className={fieldCls}>
                      <option value={0}>All Phase</option>
                      <option value={1}>1 Phase</option>
                      <option value={3}>3 Phase</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>รับประกัน (ปี)</label>
                    <input type="number" value={editing.warranty_years || ""} onChange={e => setEditing({ ...editing, warranty_years: parseInt(e.target.value) || 0 })} placeholder="0" className={`text-right ${fieldCls}`} />
                  </div>
                  <div className="md:col-span-4">
                    <label className={labelCls}>ราคา (บาท, รวม VAT)</label>
                    <input type="number" value={editing.price || ""} onChange={e => setEditing({ ...editing, price: parseFloat(e.target.value) || 0 })} placeholder="0" className={`text-right font-semibold ${fieldCls}`} />
                  </div>
                  <div className="md:col-span-8">
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
                <section className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm space-y-2.5">
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
                <section className="rounded-xl border border-green-200 bg-white p-4 shadow-sm space-y-2.5">
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
                <section className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm space-y-2.5">
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

              {/* ── การขาย & ช่วงเวลา (เต็มความกว้าง) ───────────── */}
              <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-bold text-gray-800 mb-3">การขาย &amp; ช่วงเวลาใช้งาน</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className={labelCls}>ผ่อน/เดือน</label>
                      <input type="text" value={editing.monthly_installment ?? ""} onChange={e => setEditing({ ...editing, monthly_installment: e.target.value || null })} placeholder="เช่น 3,500" className={fieldCls} />
                    </div>
                    <div>
                      <label className={labelCls}>ประหยัด/เดือน (บาท)</label>
                      <input type="number" value={editing.monthly_saving ?? ""} onChange={e => setEditing({ ...editing, monthly_saving: e.target.value ? parseFloat(e.target.value) : null })} placeholder="0" className={`text-right ${fieldCls}`} />
                    </div>
                    <div>
                      <label className={labelCls}>วันเริ่มใช้</label>
                      <input type="date" value={editing.start_date?.slice(0, 10) || ""} onChange={e => setEditing({ ...editing, start_date: e.target.value })} className={fieldCls} />
                    </div>
                    <div>
                      <label className={labelCls}>วันหมดอายุ</label>
                      <input type="date" value={editing.expire_date?.slice(0, 10) || ""} onChange={e => setEditing({ ...editing, expire_date: e.target.value })} className={fieldCls} />
                    </div>
                  </div>
              </section>

              {/* ── อุปกรณ์หลักใน Package (เต็มความกว้าง) ───────── */}
              <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-xs font-bold text-gray-800">อุปกรณ์หลักใน Package</div>
                      <div className="text-xxs text-gray-400 mt-0.5">ล็อกและ Snapshot ลงใบเสนอราคา</div>
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
                      <div className="space-y-2">{packageItems.map((item, index) => (
                        <div key={index} className="grid grid-cols-12 items-center gap-2">
                          <input value={item.item_name} onChange={e => setPackageItems(v => v.map((x, i) => i === index ? { ...x, item_name: e.target.value } : x))} placeholder="ชื่ออุปกรณ์/บริการ" className={`col-span-9 ${fieldCls}`} />
                          <input type="number" min="1" value={item.quantity || ""} onChange={e => setPackageItems(v => v.map((x, i) => i === index ? { ...x, quantity: Number(e.target.value) } : x))} className={`col-span-1 text-center ${fieldCls}`} />
                          <input value={item.unit ?? ""} onChange={e => setPackageItems(v => v.map((x, i) => i === index ? { ...x, unit: e.target.value || null } : x))} placeholder="หน่วย" className={`col-span-1 ${fieldCls}`} />
                          <button type="button" onClick={() => setPackageItems(v => v.filter((_, i) => i !== index))} aria-label="ลบรายการ"
                            className="col-span-1 h-9 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">×</button>
                        </div>
                      ))}</div>
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
