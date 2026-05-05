"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import ListPageHeader from "@/components/layout/ListPageHeader";
import { formatTHB } from "@/lib/utils/formatters";

interface Package {
  id: number;
  name: string;
  kwp: number;
  phase: number;
  has_battery: boolean;
  has_panel: boolean;
  has_inverter: boolean;
  is_upgrade: boolean;
  battery_kwh: number;
  battery_brand: string;
  solar_panels: number;
  panel_watt: number;
  inverter_kw: number;
  inverter_brand: string;
  price: number;
  monthly_installment: string;
  monthly_saving: number;
  warranty_years: number;
}

type TabKey = "solar" | "battery" | "upgrade";

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [tab, setTab] = useState<TabKey>("solar");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiFetch("/api/packages").then(setPackages).catch(console.error).finally(() => setLoading(false));
  }, []);

  const displayed = packages
    .filter((p) => {
      if (tab === "solar") return !p.has_battery && !p.is_upgrade;
      if (tab === "battery") return p.has_battery && !p.is_upgrade;
      if (tab === "upgrade") return p.is_upgrade;
      return true;
    })
    .filter((p) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        p.name?.toLowerCase().includes(q) ||
        p.inverter_brand?.toLowerCase().includes(q) ||
        p.battery_brand?.toLowerCase().includes(q) ||
        String(p.kwp).includes(q)
      );
    });
  const TABS = [
    { key: "solar" as TabKey, label: "Solar", count: packages.filter((p) => !p.has_battery && !p.is_upgrade).length },
    { key: "battery" as TabKey, label: "Battery", count: packages.filter((p) => p.has_battery && !p.is_upgrade).length },
    { key: "upgrade" as TabKey, label: "Scale Up", count: packages.filter((p) => p.is_upgrade).length },
  ];

  return (
    <div>
      <ListPageHeader
        title="Solar Rooftop Packages"
        subtitle="SENA SOLAR ENERGY"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหา kWp, brand, name..."
        tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: t.count }))}
        activeTab={tab}
        onTabChange={(k) => setTab(k as TabKey)}
      />

      <div className="p-3 md:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {displayed.map((pkg) => (
              <div key={pkg.id} className="rounded-xl bg-white border border-gray-300 overflow-hidden hover:border-primary/40 hover:shadow-sm transition-all">
                {/* Hero */}
                <div className="bg-gradient-to-br from-primary/5 to-primary/10 px-4 py-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-base font-bold text-primary">{pkg.name}</span>
                  {pkg.is_upgrade && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">SCALE UP</span>
                  )}
                  {pkg.phase > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white border border-primary/20 text-primary">
                      {pkg.phase === 0 ? "All" : `${pkg.phase}P`}
                    </span>
                  )}
                </div>

                {/* Price */}
                <div className="px-4 pt-3 pb-2 flex items-baseline justify-between gap-2 border-b border-gray-100">
                  <div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-gray-900 leading-tight">
                      {formatTHB(pkg.price)}
                      <span className="text-sm font-semibold text-gray-400 ml-1">THB</span>
                    </div>
                  </div>
                  {/* Icons */}
                  <span className="inline-flex items-center gap-0.5">
                    <svg className={`w-4 h-4 ${pkg.has_panel ? "text-amber-500" : "text-gray-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
                    <svg className={`w-4 h-4 ${pkg.has_inverter ? "text-violet-500" : "text-gray-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                    <svg className={`w-4 h-4 ${pkg.has_battery ? "text-green-500 fill-green-500" : "text-gray-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 10.5h.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H21M3.75 18h15A2.25 2.25 0 0021 15.75v-6a2.25 2.25 0 00-2.25-2.25h-15A2.25 2.25 0 001.5 9.75v6A2.25 2.25 0 003.75 18z" /></svg>
                  </span>
                </div>

                {/* Specs */}
                <div className="px-4 py-3 space-y-1.5">
                  {pkg.solar_panels > 0 && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Panels</span>
                      <span className="text-sm font-semibold text-gray-800">{pkg.solar_panels} × {pkg.panel_watt}W</span>
                    </div>
                  )}
                  {pkg.inverter_kw > 0 && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Inverter</span>
                      <span className="text-sm font-semibold text-gray-800 truncate">{pkg.inverter_brand} {pkg.inverter_kw}kW</span>
                    </div>
                  )}
                  {pkg.has_battery && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Battery</span>
                      <span className="text-sm font-semibold text-gray-800">{pkg.battery_kwh}kWh {pkg.battery_brand || ""}</span>
                    </div>
                  )}
                  {pkg.warranty_years > 0 && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Warranty</span>
                      <span className="text-sm font-semibold text-gray-800">{pkg.warranty_years} years</span>
                    </div>
                  )}
                  {pkg.is_upgrade && pkg.solar_panels === 0 && (
                    <div className="text-xs text-gray-500 pt-1 border-t border-gray-100">เพิ่มแบตอย่างเดียว</div>
                  )}
                  {pkg.is_upgrade && pkg.solar_panels > 0 && (
                    <div className="text-xs text-gray-500 pt-1 border-t border-gray-100">+แผง +Inverter +Battery</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
