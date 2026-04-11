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

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [tab, setTab] = useState<"solar" | "battery">("solar");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/packages").then(setPackages).catch(console.error).finally(() => setLoading(false));
  }, []);

  const displayed = packages.filter((p) => (tab === "solar" ? !p.has_battery : p.has_battery));
  const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);

  return (
    <div className="max-w-5xl mx-auto">
      <Header title="Solar Rooftop Packages" subtitle="SENA SOLAR ENERGY" />

      <div className="flex bg-white border-b border-gray-100 sticky top-0 z-[5]">
        {[
          { key: "solar" as const, label: "Solar Rooftop" },
          { key: "battery" as const, label: "With Battery" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.key ? "text-active border-active" : "text-gray-500 border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-3 md:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {displayed.map((pkg) => (
              <div key={pkg.id} className="rounded-xl bg-white border border-gray-200 overflow-hidden hover:border-primary/40 hover:shadow-sm transition-all">
                {/* Hero — primary accent strip with size + phase + battery pills */}
                <div className="bg-gradient-to-br from-primary/5 to-primary/10 px-4 py-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-base font-bold text-primary">{pkg.kwp} kWp</span>
                  {pkg.phase > 1 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white border border-primary/20 text-primary">
                      {pkg.phase} Phase
                    </span>
                  )}
                  {pkg.has_battery && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-600/20 text-amber-700">
                      + {pkg.battery_kwh}kWh Battery
                    </span>
                  )}
                </div>

                {/* Price hero */}
                <div className="px-4 pt-4 pb-3 flex items-baseline justify-between gap-2 border-b border-gray-100">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Price</div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-gray-900 leading-tight mt-0.5">
                      {formatPrice(pkg.price)}
                      <span className="text-sm font-semibold text-gray-400 ml-1">THB</span>
                    </div>
                  </div>
                  {pkg.monthly_installment && (
                    <div className="text-right">
                      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Installment</div>
                      <div className="text-sm font-bold font-mono tabular-nums text-gray-700 leading-tight mt-0.5">
                        {pkg.monthly_installment}
                        <span className="text-xs font-semibold text-gray-400 ml-0.5">/mo</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Specs rows */}
                <div className="px-4 py-3 space-y-1.5">
                  {pkg.solar_panels && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Panels</span>
                      <span className="text-sm font-semibold text-gray-800">{pkg.solar_panels} × {pkg.panel_watt}W</span>
                    </div>
                  )}
                  {pkg.inverter_kw && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Inverter</span>
                      <span className="text-sm font-semibold text-gray-800 truncate">{pkg.inverter_brand} {pkg.inverter_kw}kW</span>
                    </div>
                  )}
                  {pkg.has_battery && pkg.battery_brand && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Battery</span>
                      <span className="text-sm font-semibold text-gray-800">{pkg.battery_brand}</span>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Warranty</span>
                    <span className="text-sm font-semibold text-gray-800">{pkg.warranty_years} years</span>
                  </div>
                  {pkg.monthly_saving > 0 && (
                    <div className="flex items-baseline justify-between gap-2 pt-1.5 border-t border-dashed border-gray-100 mt-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Monthly Saving</span>
                      <span className="text-sm font-bold text-emerald-700 font-mono tabular-nums">~{formatPrice(pkg.monthly_saving)}/mo</span>
                    </div>
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
