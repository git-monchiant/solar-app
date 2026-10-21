"use client";

// Today ของ O&M — งานวันนี้ของโมดูล O&M (แผน docs/plan/20260928-01 · ผู้ใช้เคาะ 28 ก.ย. 69)
// ★ อยู่ในการ์ด O&M เท่านั้น — ไม่แตะ /today ฝั่งขาย (แผน 20260922-01 ข้อ 4.1: งาน O&M อยู่ในการ์ดตัวเองก่อน)
// ★ โครงหน้ายกจาก /om/services ทั้งก้อน (ซึ่งยกจาก Pipeline/Today อีกที · กติกา ui-rules)
//   หัวเรื่อง = ชื่อเมนู · subtitle = วันที่แบบ Today ฝั่งขาย · การ์ด = JobCard ตัวเดียวกับหน้างานบริการ
// ★ เคยมีติ๊ก "งานของฉัน" (กรองจากเจ้าของงาน) — ผู้ใช้สั่งเอาออก 15 ต.ค. 69 พร้อมช่องตั้งเจ้าของงาน
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import { useOpenOmService } from "@/lib/hooks/useOpenOmService";
import { TODAY_TABS, type Item } from "@/lib/om/service-view";
import ListPageHeader from "@/components/layout/ListPageHeader";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import JobCard from "@/components/om/JobCard";

export default function OmTodayPage() {
  const { item: activeItem } = useActiveMenuItem();
  const open = useOpenOmService();
  const [tab, setTab] = useState<string>(TODAY_TABS[0].k);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setItems(null);
    const p = new URLSearchParams({ tab });
    if (q.trim()) p.set("q", q.trim());
    apiFetch(`/api/om/today?${p}`)
      .then((d) => { setItems(d.items ?? []); setCounts(d.counts ?? {}); })
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setItems([]); });
  }, [tab, q]);
  useEffect(() => { const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t); }, [load, q]);

  const cur = TODAY_TABS.find((t) => t.k === tab) ?? TODAY_TABS[0];
  const n = counts[tab] ?? 0;

  return (
    <div>
      <ListPageHeader
        title={activeItem?.label ?? "Today"}
        subtitle={`${new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} · O&M`}
        search={q}
        onSearchChange={setQ}
        searchPlaceholder="ค้นหาบ้านเลขที่ · ชื่อลูกค้า · เบอร์โทร"
        tabs={TODAY_TABS.map((t) => ({ key: t.k, label: t.t, count: counts[t.k] ?? 0 }))}
        activeTab={tab}
        onTabChange={setTab}
        tabsLeft={<span className="whitespace-nowrap">{n.toLocaleString("th-TH")} รายการ</span>}
      />

      <div className="p-3 md:p-4">
        {/* แถวเครื่องมือ — คำอธิบายแท็บ (งานของฉัน เอาออก 15 ต.ค. 69) */}
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          <p className="flex items-start gap-1.5 text-xxs text-gray-500 leading-relaxed min-w-0">
            <span className="shrink-0 w-3.5 h-3.5 mt-px rounded-full border border-gray-400 text-[9px] font-bold flex items-center justify-center">i</span>
            <span>{cur.hint}</span>
          </p>
        </div>

        {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>}
        {items === null ? <Loading /> : items.length === 0 ? (
          <div className="text-center text-gray-400 py-16 text-sm">{cur.empty}</div>
        ) : (
          <>
            <div className="space-y-2">
              {items.map((r) => <JobCard key={r.house_id} r={r} onOpen={() => open(r.house_id)} />)}
            </div>
            {items.length < n && (
              <p className="mt-3 text-center text-xs text-gray-400">
                แสดง {items.length.toLocaleString("th-TH")} จาก {n.toLocaleString("th-TH")} รายการ — ค้นหาด้วยบ้านเลขที่หรือชื่อเพื่อดูรายการที่เหลือ
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
