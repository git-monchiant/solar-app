"use client";

import { apiFetch } from "@/lib/api";

import { useEffect, useState } from "react";
import Image from "next/image";
import Header from "@/components/Header";

interface Package {
  id: number; name: string; kwp: number; phase: number; has_battery: boolean;
  battery_kwh: number; battery_brand: string; solar_panels: number; panel_watt: number;
  inverter_kw: number; inverter_brand: string; price: number;
  monthly_installment: string; monthly_saving: number; warranty_years: number;
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [tab, setTab] = useState<"solar" | "battery">("solar");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/packages").then(setPackages).catch(console.error).finally(() => setLoading(false));
  }, []);

  const displayed = packages.filter((p) => tab === "solar" ? !p.has_battery : p.has_battery);
  const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);

  return (
    <div className="max-w-5xl mx-auto">
      <Header title="Solar Rooftop Packages" subtitle="SENA SOLAR ENERGY" />

      <div className="flex bg-white shadow-sm sticky top-[60px] z-10">
        {[
          { key: "solar" as const, label: "Solar Rooftop" },
          { key: "battery" as const, label: "With Battery" },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-3.5 text-sm font-semibold transition-all ${tab === t.key ? "text-primary border-b-2 border-primary" : "text-gray border-b-2 border-transparent"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 md:p-6">
        {loading ? (
          <div className="flex flex-col items-center py-16">
            <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {displayed.map((pkg) => (
              <div key={pkg.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                <div className="relative bg-gradient-to-br from-primary/5 via-white to-secondary/5 px-5 py-5">
                  <div className="absolute right-3 top-3 opacity-[0.07]">
                    <Image src="/logo-sena.png" alt="" width={60} height={60} />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-primary">{pkg.kwp}</span>
                    <span className="text-lg font-semibold text-primary/70">kWp</span>
                    {pkg.phase > 1 && <span className="text-sm bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{pkg.phase} Phase</span>}
                  </div>
                  {pkg.has_battery && (
                    <div className="mt-2 inline-flex items-center gap-1.5 bg-secondary/10 text-secondary text-sm font-semibold px-3 py-1 rounded-full">
                      + Battery {pkg.battery_brand} {pkg.battery_kwh} kWh
                    </div>
                  )}
                </div>
                <div className="px-5 py-4 space-y-2.5 border-t border-gray-50">
                  {pkg.solar_panels && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray">Solar Panels</span>
                      <span className="font-semibold">{pkg.solar_panels} panels ({pkg.panel_watt}W)</span>
                    </div>
                  )}
                  {pkg.inverter_kw && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray">Inverter</span>
                      <span className="font-semibold">{pkg.inverter_brand} {pkg.inverter_kw} kW</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray">Warranty</span>
                    <span className="font-semibold">{pkg.warranty_years} years</span>
                  </div>
                  {pkg.monthly_saving > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray">Monthly Saving</span>
                      <span className="font-semibold text-green-600">~{formatPrice(pkg.monthly_saving)} THB</span>
                    </div>
                  )}
                </div>
                <div className="px-5 py-5 bg-gradient-to-r from-primary/5 to-transparent border-t border-gray-50">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-gray font-medium">Price (incl. VAT)</div>
                      <div className="text-2xl font-bold text-primary mt-0.5">{formatPrice(pkg.price)} <span className="text-sm font-semibold">THB</span></div>
                    </div>
                    {pkg.monthly_installment && (
                      <div className="text-right">
                        <div className="text-xs text-gray">Installment</div>
                        <div className="text-sm font-bold text-secondary">{pkg.monthly_installment} THB/mo</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
