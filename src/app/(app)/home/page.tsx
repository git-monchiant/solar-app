"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import UserMenu from "@/components/layout/UserMenu";
import { apiFetch } from "@/lib/api";
import { useActiveRoles } from "@/lib/roles";
import {
  modulesForRoles, setActiveModule, countForModule, MODULE_GROUPS,
  type AppModule, type JourneySummaryRow,
} from "@/lib/modules";

// Hub — จุดเข้าโมดูล (design: docs/plan/20260813-02-module-base-navigation.md)
// เลือกการ์ด → จำโมดูลไว้ (BottomNav สลับเป็นเมนู journey ของโมดูลนั้น) → พาไปเมนูแรก
export default function HomePage() {
  const router = useRouter();
  const { activeRoles } = useActiveRoles();
  const [summary, setSummary] = useState<JourneySummaryRow[]>([]);

  useEffect(() => {
    apiFetch("/api/journey-summary").then((rows) => setSummary(rows as JourneySummaryRow[])).catch(console.error);
  }, []);

  const modules = modulesForRoles(activeRoles);

  const enter = (mod: AppModule) => {
    if (mod.soon || mod.menu.length === 0) return;
    const target = mod.defaultHref ?? mod.menu[0].href ?? mod.menu[0].children?.[0]?.href;
    if (!target) return;
    setActiveModule(mod.key);
    router.push(target);
  };

  return (
    <div>
      {/* hub ไม่มี left menu → ทางเข้าโปรไฟล์/ออกจากระบบอยู่ที่ UserMenu มุมขวาบน */}
      <Header title="SENA Solar" subtitle="“โซลาร์ที่ดีที่สุด คือ โซลาร์ที่เหมาะกับการใช้ชีวิตของคุณที่สุด”" logoSrc="/logos/logo-sena.png" rightContent={<UserMenu />} />
      <div className="p-4 md:px-6 md:py-8 max-w-7xl">
        {MODULE_GROUPS.map((g) => {
          const mods = modules.filter((m) => m.group === g.key);
          if (mods.length === 0) return null;
          return (
        <div key={g.key} className="mb-8">
        <div className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">{g.label}</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {mods.map((mod) => {
            const count = countForModule(mod, summary);
            return (
              <button
                key={mod.key}
                type="button"
                onClick={() => enter(mod)}
                className={`relative text-left bg-white border border-gray-200 rounded-2xl p-4 transition-all ${
                  mod.soon
                    ? "opacity-55 cursor-default"
                    : "hover:border-primary hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-0.5 cursor-pointer"
                }`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl mb-2.5 ${mod.tint}`}>
                  {mod.emoji}
                </div>
                {mod.soon ? (
                  <span className="absolute top-3.5 right-3.5 text-xxs font-bold tracking-widest uppercase text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">เร็วๆ นี้</span>
                ) : count != null && count > 0 ? (
                  <span className="absolute top-3.5 right-3.5 text-xs font-bold text-indigo-700 bg-indigo-50 rounded-full px-2.5 py-0.5">{count}</span>
                ) : null}
                <div className="text-lg font-bold text-gray-900">{mod.label}</div>
                <div className="text-sm text-gray-500 mt-0.5 leading-relaxed">{mod.desc}</div>
              </button>
            );
          })}
        </div>
        </div>
          );
        })}
      </div>
    </div>
  );
}
