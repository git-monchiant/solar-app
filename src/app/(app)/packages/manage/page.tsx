"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Header from "@/components/Header";

interface Package {
  id: number;
  name: string;
  kwp: number;
  phase: number;
  has_battery: boolean;
  has_panel: boolean;
  has_inverter: boolean;
  is_upgrade: boolean;
  battery_kwh: number | null;
  battery_brand: string | null;
  solar_panels: number | null;
  panel_watt: number | null;
  inverter_kw: number | null;
  inverter_brand: string | null;
  price: number;
  monthly_installment: string | null;
  monthly_saving: number | null;
  warranty_years: number;
  is_active: boolean;
  start_date: string | null;
  expire_date: string | null;
}

const empty: Omit<Package, "id"> = {
  name: "", kwp: 0, phase: 1, has_battery: false, has_panel: true, has_inverter: true, is_upgrade: false,
  battery_kwh: null, battery_brand: null, solar_panels: null, panel_watt: null,
  inverter_kw: null, inverter_brand: null, price: 0, monthly_installment: null,
  monthly_saving: null, warranty_years: 10, is_active: true,
  start_date: new Date().toISOString().slice(0, 10),
  expire_date: `${new Date().getFullYear() + 99}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
};

const fmt = (n: number) => new Intl.NumberFormat("th-TH").format(n);
const fmtDate = (d: string | null) => d ? new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function ManagePackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Package | (Omit<Package, "id"> & { id?: undefined }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [filterPhase, setFilterPhase] = useState<"all" | "0" | "1" | "3">("all");
  const [filterBat, setFilterBat] = useState<"all" | "yes" | "no">("all");
  const [filterUpgrade, setFilterUpgrade] = useState<"all" | "yes" | "no">("all");

  const load = () => {
    apiFetch("/api/packages?all=1").then(setPackages).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = packages.filter(p => {
    if (filter === "active" && !p.is_active) return false;
    if (filter === "inactive" && p.is_active) return false;
    if (filterPhase !== "all" && p.phase !== parseInt(filterPhase)) return false;
    if (filterBat === "yes" && !p.has_battery) return false;
    if (filterBat === "no" && p.has_battery) return false;
    if (filterUpgrade === "yes" && !p.is_upgrade) return false;
    if (filterUpgrade === "no" && p.is_upgrade) return false;
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

  const save = async () => {
    if (!editing || !editing.name.trim()) return;
    setSaving(true);
    try {
      if (editing.id) {
        await apiFetch(`/api/packages/${editing.id}`, { method: "PATCH", body: JSON.stringify(editing) });
      } else {
        await apiFetch("/api/packages", { method: "POST", body: JSON.stringify(editing) });
      }
      setEditing(null);
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (pkg: Package) => {
    await apiFetch(`/api/packages/${pkg.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !pkg.is_active }) });
    load();
  };

  if (loading) return <div className="flex items-center justify-center h-full py-20"><div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div>
      <Header title="จัดการ Packages" subtitle="PACKAGE MANAGEMENT" />

      <div className="p-4 md:p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา..." className="h-10 px-4 rounded-lg border border-gray-200 text-sm flex-1 min-w-[200px] focus:outline-none focus:border-primary" />
          <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary">
            <option value="all">ทั้งหมด</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={filterPhase} onChange={e => setFilterPhase(e.target.value as typeof filterPhase)} className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary">
            <option value="all">All Phase</option>
            <option value="1">1 Phase</option>
            <option value="3">3 Phase</option>
          </select>
          <select value={filterBat} onChange={e => setFilterBat(e.target.value as typeof filterBat)} className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary">
            <option value="all">Battery ทั้งหมด</option>
            <option value="yes">มี Battery</option>
            <option value="no">ไม่มี Battery</option>
          </select>
          <select value={filterUpgrade} onChange={e => setFilterUpgrade(e.target.value as typeof filterUpgrade)} className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary">
            <option value="all">ทุกประเภท</option>
            <option value="yes">Upgrade</option>
            <option value="no">ไม่ใช่ Upgrade</option>
          </select>
          <button type="button" onClick={() => setEditing({ ...empty })} className="h-10 px-5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors">+ เพิ่ม Package</button>
        </div>

        {/* Cards */}
        <div className="space-y-3">
          {filtered.map(pkg => (
            <div key={pkg.id} className={`rounded-xl bg-white border border-gray-300 overflow-hidden transition-all ${!pkg.is_active ? "opacity-50" : ""}`}>
              <div className="px-5 py-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Row 1: Name + badges */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold text-lg text-gray-900 truncate">{pkg.name}</span>
                    {pkg.is_upgrade && <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-600 uppercase shrink-0">Upgrade</span>}
                    <span className="text-sm font-mono text-gray-500 shrink-0">{pkg.kwp} kWp · {pkg.phase === 0 ? "All Phase" : `${pkg.phase}P`}</span>
                  </div>

                  {/* Row 2: Price + Components */}
                  <div className="flex items-center gap-4 mb-2">
                    <span className="text-xl font-bold font-mono tabular-nums text-gray-900">{fmt(pkg.price)} <span className="text-sm text-gray-400">THB</span></span>
                    <div className="flex items-center gap-1.5">
                      {pkg.has_panel && <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-600 font-semibold">Panel {pkg.solar_panels ? `${pkg.solar_panels}×${pkg.panel_watt}W` : ""}</span>}
                      {pkg.has_inverter && <span className="text-xs px-2 py-0.5 rounded bg-violet-50 text-violet-600 font-semibold">Inv {pkg.inverter_brand ? `${pkg.inverter_brand} ${pkg.inverter_kw}kW` : ""}</span>}
                      {pkg.has_battery && <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-600 font-semibold">Bat {pkg.battery_kwh ? `${pkg.battery_kwh}kWh ${pkg.battery_brand || ""}` : ""}</span>}
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
        </div>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-10 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 mb-10">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editing.id ? "แก้ไข Package" : "เพิ่ม Package ใหม่"}</h2>
              <button type="button" onClick={() => setEditing(null)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-5 space-y-3">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">ชื่อ Package</label>
                  <input type="text" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">kWp</label>
                  <input type="number" step="0.1" value={editing.kwp || ""} onChange={e => setEditing({ ...editing, kwp: parseFloat(e.target.value) || 0 })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Phase</label>
                  <select value={editing.phase} onChange={e => setEditing({ ...editing, phase: parseInt(e.target.value) })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-primary">
                    <option value={0}>All Phase</option>
                    <option value={1}>1 Phase</option>
                    <option value={3}>3 Phase</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">ราคา (THB)</label>
                  <input type="number" value={editing.price || ""} onChange={e => setEditing({ ...editing, price: parseFloat(e.target.value) || 0 })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Warranty (ปี)</label>
                  <input type="number" value={editing.warranty_years || ""} onChange={e => setEditing({ ...editing, warranty_years: parseInt(e.target.value) || 0 })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
                </div>
              </div>

              {/* Flags */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">ประเภท</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "has_panel", label: "Panel", color: "amber" },
                    { key: "has_inverter", label: "Inverter", color: "violet" },
                    { key: "has_battery", label: "Battery", color: "green" },
                    { key: "is_upgrade", label: "Upgrade", color: "blue" },
                  ].map(f => (
                    <button key={f.key} type="button" onClick={() => setEditing({ ...editing, [f.key]: !(editing as Record<string, unknown>)[f.key] })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${(editing as Record<string, unknown>)[f.key] ? `bg-${f.color}-50 text-${f.color}-700 border-${f.color}-200` : "bg-white text-gray-400 border-gray-200"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Panel & Inverter */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">จำนวนแผง</label>
                  <input type="number" value={editing.solar_panels ?? ""} onChange={e => setEditing({ ...editing, solar_panels: e.target.value ? parseInt(e.target.value) : null })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">วัตต์/แผง</label>
                  <input type="number" value={editing.panel_watt ?? ""} onChange={e => setEditing({ ...editing, panel_watt: e.target.value ? parseInt(e.target.value) : null })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Inverter kW</label>
                  <input type="number" step="0.1" value={editing.inverter_kw ?? ""} onChange={e => setEditing({ ...editing, inverter_kw: e.target.value ? parseFloat(e.target.value) : null })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Inverter Brand</label>
                  <input type="text" value={editing.inverter_brand ?? ""} onChange={e => setEditing({ ...editing, inverter_brand: e.target.value || null })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
                </div>
              </div>

              {/* Battery */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Battery kWh</label>
                  <input type="number" step="0.1" value={editing.battery_kwh ?? ""} onChange={e => setEditing({ ...editing, battery_kwh: e.target.value ? parseFloat(e.target.value) : null })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Battery Brand</label>
                  <input type="text" value={editing.battery_brand ?? ""} onChange={e => setEditing({ ...editing, battery_brand: e.target.value || null })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
                </div>
              </div>

              {/* Monthly */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">ผ่อน/เดือน</label>
                  <input type="text" value={editing.monthly_installment ?? ""} onChange={e => setEditing({ ...editing, monthly_installment: e.target.value || null })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">ประหยัด/เดือน</label>
                  <input type="number" value={editing.monthly_saving ?? ""} onChange={e => setEditing({ ...editing, monthly_saving: e.target.value ? parseFloat(e.target.value) : null })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">วันเริ่มใช้</label>
                  <input type="date" value={editing.start_date?.slice(0, 10) || ""} onChange={e => setEditing({ ...editing, start_date: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">วันหมดอายุ</label>
                  <input type="date" value={editing.expire_date?.slice(0, 10) || ""} onChange={e => setEditing({ ...editing, expire_date: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">{editing.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>
                <div role="button" onClick={() => setEditing({ ...editing, is_active: !editing.is_active })}
                  className={`relative cursor-pointer rounded-full transition-colors ${editing.is_active ? "bg-emerald-500" : "bg-gray-300"}`}
                  style={{ width: "44px", height: "24px", minWidth: "44px", minHeight: "24px" }}>
                  <div className="absolute rounded-full bg-white shadow-sm transition-all"
                    style={{ width: "18px", height: "18px", top: "3px", left: editing.is_active ? "23px" : "3px" }} />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-3">
              <button type="button" onClick={() => setEditing(null)} className="h-10 px-5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">ยกเลิก</button>
              <button type="button" onClick={save} disabled={saving || !editing.name.trim()} className="h-10 px-6 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 transition-colors">
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
