"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import ListPageHeader from "@/components/layout/ListPageHeader";
import { formatTHB } from "@/lib/utils/formatters";
import Loading from "@/components/ui/Loading";
import {
  omPlanLabel, omTierKey, omTierKw, omTierLabel,
  type OmPackage, type OmPackageNote, type OmPlanType,
} from "@/lib/om/packages";

// แคตตาล็อกแพ็คเกจบริการ O&M — เปลือกยกจาก /packages ทั้งก้อน (header · แท็บ · การ์ด)
// การ์ด 1 ใบ = 1 ขั้นขนาดระบบ ข้างในเป็นตัวเลือกราคา (รายครั้ง / สัญญา) แบบตารางค่าบริการ

type TabKey = "all" | OmPlanType;

export default function OmPackagesPage() {
  const [packages, setPackages] = useState<OmPackage[]>([]);
  const [notes, setNotes] = useState<OmPackageNote[]>([]);
  const [tab, setTab] = useState<TabKey>("all");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiFetch("/api/om/packages")
      .then((r: { packages: OmPackage[]; notes: OmPackageNote[] }) => { setPackages(r.packages); setNotes(r.notes); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const displayed = packages
    .filter((p) => tab === "all" || p.plan_type === tab)
    .filter((p) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return omTierLabel(p).toLowerCase().includes(q) || omPlanLabel(p).includes(q) || (p.scope ?? "").includes(q);
    });

  // จัดกลุ่มตามขั้นขนาดระบบ (API เรียง kW → รายครั้งก่อนสัญญาให้แล้ว)
  const tiers: OmPackage[][] = [];
  for (const p of displayed) {
    const last = tiers[tiers.length - 1];
    if (last && omTierKey(last[0]) === omTierKey(p)) last.push(p);
    else tiers.push([p]);
  }

  const TABS = [
    { key: "all" as TabKey, label: "ทั้งหมด", count: packages.length },
    { key: "per_visit" as TabKey, label: "รายครั้ง", count: packages.filter((p) => p.plan_type === "per_visit").length },
    { key: "contract" as TabKey, label: "สัญญา", count: packages.filter((p) => p.plan_type === "contract").length },
  ];

  return (
    <div>
      <ListPageHeader
        title="O&M Service Packages"
        subtitle="SENA SOLAR ENERGY"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหา kW, รายครั้ง, สัญญา..."
        tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: t.count }))}
        activeTab={tab}
        onTabChange={(k) => setTab(k as TabKey)}
      />

      <div className="p-3 md:p-6 space-y-4">
        {loading ? (
          <Loading />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {tiers.map((items) => {
                const head = items[0];
                return (
                  <div key={omTierKey(head)} className="rounded-xl bg-white border border-gray-300 overflow-hidden hover:border-primary/40 hover:shadow-sm transition-all">
                    {/* Hero */}
                    <div className="bg-gradient-to-br from-primary/5 to-primary/10 px-4 py-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-base font-bold text-primary">{omTierKw(head)}</span>
                      {head.max_panels != null && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white border border-primary/20 text-primary">
                          ≤ {head.max_panels} แผง
                        </span>
                      )}
                    </div>

                    {/* ตัวเลือกราคา */}
                    {items.map((p) => (
                      <div key={p.id} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${p.plan_type === "contract" ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-orange-50 text-orange-600 border border-orange-100"}`}>
                            {omPlanLabel(p)}
                          </span>
                          <div className="text-2xl font-bold font-mono tabular-nums text-gray-900 leading-tight">
                            {formatTHB(p.price)}
                            <span className="text-sm font-semibold text-gray-400 ml-1">THB</span>
                          </div>
                        </div>
                        {p.scope && (
                          <div className="mt-2 flex items-baseline justify-between gap-3">
                            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 shrink-0">Scope</span>
                            <span className="text-sm text-gray-700 text-right leading-relaxed">{p.scope.split("+").join(" + ")}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {tiers.length === 0 && (
              <div className="rounded-xl bg-white border border-gray-300 px-5 py-10 text-center text-sm text-gray-400">ไม่พบแพ็คเกจตามเงื่อนไขที่เลือก</div>
            )}

            {notes.length > 0 && (
              <div className="rounded-xl bg-white border border-gray-300 px-4 py-3 space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">หมายเหตุ</div>
                {notes.map((n, i) => (
                  <p key={n.id ?? i} className="text-sm text-gray-600 leading-relaxed">{n.body}</p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
