"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import ListPageHeader from "@/components/layout/ListPageHeader";
import { formatTHB } from "@/lib/utils/formatters";
import Loading from "@/components/ui/Loading";
import { CheckIcon, ChevronRightIcon } from "@/components/ui/icons";
import {
  omPlanLabel, omScopeItems, omTierKey, omTierKw, omTierLabel,
  type OmPackage, type OmPlanType,
} from "@/lib/om/packages";

// แคตตาล็อกแพ็คเกจบริการ O&M — เปลือกยกจาก /packages ทั้งก้อน (header · แท็บ · การ์ด)
// การ์ด 1 ใบ = 1 ขั้นขนาดระบบ ข้างในเป็นตัวเลือกราคา (รายครั้ง / สัญญา) แบบตารางค่าบริการ

type TabKey = "all" | OmPlanType;

export default function OmPackagesPage() {
  const [packages, setPackages] = useState<OmPackage[]>([]);
  const [tab, setTab] = useState<TabKey>("all");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // ★ 15 ต.ค. 69 ผู้ใช้สั่งเพิ่มปุ่มย่อรายละเอียด แล้วสั่งต่อให้อยู่ใต้ราคาของแต่ละตัวเลือก (เดิมปุ่มเดียวมุมขวาบน)
  //   ย่อแล้วเหลือป้ายรายครั้ง/สัญญา + ราคา · ★ ผู้ใช้สั่งต่อ: ค่าเริ่มต้น = ย่อทุกตัวเลือก
  //   จำไว้ในเครื่องเป็นรายการ id แพ็กเกจที่ "กาง" แบบ "งานของฉัน" หน้างานบริการ (แพ็กเกจใหม่จึงย่อมาเสมอ)
  //   (เนื้อการ์ดขึ้นหลังโหลดเสร็จ ค่าแรกจึงไม่ชนกับหน้าที่ render จาก server)
  const [expanded, setExpanded] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const v = JSON.parse(localStorage.getItem("om.packages.expanded") ?? "[]");
      return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
    } catch { return []; }
  });
  // ต่อจากค่าล่าสุดเสมอ — กดหลายปุ่มติดกันเร็ว ๆ แล้วค่าไม่ทับกัน (เขียนซ้ำได้ ค่าเดิมเสมอ)
  const toggle = (id: number) => setExpanded((cur) => {
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    try { localStorage.setItem("om.packages.expanded", JSON.stringify(next)); } catch { /* โหมดส่วนตัว — ไม่จำก็ได้ */ }
    return next;
  });

  useEffect(() => {
    apiFetch("/api/om/packages")
      .then((r: { packages: OmPackage[] }) => setPackages(r.packages))
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
                        {p.scope && (() => {
                          const list = omScopeItems(p.scope);
                          const shut = !expanded.includes(p.id);
                          // ปุ่มลอยขวา (float) — บรรทัดแรกของรายการหลบให้ บรรทัดถัดไปเต็มความกว้าง · flow-root ให้กล่องสูงพอตอนย่อ
                          const btn = (
                            <button type="button" onClick={() => toggle(p.id)} style={{ minHeight: 0 }}
                              aria-expanded={!shut}
                              className="float-right ml-2 h-6 px-2 inline-flex items-center gap-1 rounded-md text-xs font-semibold text-gray-500 hover:text-primary hover:bg-gray-50 transition-colors cursor-pointer">
                              <ChevronRightIcon className={`w-3 h-3 ${shut ? "rotate-90" : "-rotate-90"}`} strokeWidth={2.5} />
                              {shut ? "แสดงรายละเอียด" : "ย่อ"}
                            </button>
                          );
                          return (
                            <div className="mt-2.5 flow-root">
                              {btn}
                              {shut ? (
                                <div className="h-6 flex items-center text-xs text-gray-400">ขอบเขตงาน {list.length} รายการ</div>
                              ) : (
                                <ul className="space-y-1.5">
                                  {list.map((s) => (
                                    <li key={s} className="flex items-start gap-2 text-sm leading-snug">
                                      <span className="mt-0.5 w-4 h-4 shrink-0 rounded-full flex items-center justify-center bg-emerald-50 text-emerald-600">
                                        <CheckIcon className="w-2.5 h-2.5" strokeWidth={3} />
                                      </span>
                                      <span className="text-gray-700">{s}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {tiers.length === 0 && (
              <div className="rounded-xl bg-white border border-gray-300 px-5 py-10 text-center text-sm text-gray-400">ไม่พบแพ็คเกจตามเงื่อนไขที่เลือก</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
