"use client";

// Today ของ O&M — งานวันนี้ของโมดูล O&M (แผน docs/plan/20260928-01 · ผู้ใช้เคาะ 28 ก.ย. 69)
// ★ อยู่ในการ์ด O&M เท่านั้น — ไม่แตะ /today ฝั่งขาย (แผน 20260922-01 ข้อ 4.1: งาน O&M อยู่ในการ์ดตัวเองก่อน)
// ★ โครงหน้ายกจาก /om/services ทั้งก้อน (ซึ่งยกจาก Pipeline/Today อีกที · กติกา ui-rules)
//   หัวเรื่อง = ชื่อเมนู · subtitle = วันที่แบบ Today ฝั่งขาย · การ์ด = JobCard ตัวเดียวกับหน้างานบริการ
// ★ ติ๊ก "งานของฉัน" แบบ Today ฝั่งขาย: ค่าเริ่มต้นไม่ติ๊ก (เห็นงานทุกคน) · กรองที่ server ตัวเลขแท็บขยับตาม
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import { useOpenOmService } from "@/lib/hooks/useOpenOmService";
import { TODAY_TABS, type Item } from "@/lib/om/service-view";
import ListPageHeader from "@/components/layout/ListPageHeader";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import JobCard from "@/components/om/JobCard";
import { CheckIcon } from "@/components/ui/icons";

export default function OmTodayPage() {
  const { item: activeItem } = useActiveMenuItem();
  const open = useOpenOmService();
  const [tab, setTab] = useState<string>(TODAY_TABS[0].k);
  const [q, setQ] = useState("");
  const [mineOnly, setMineOnly] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("om.today.mineOnly") === "1"; } catch { return false; }
  });
  const [items, setItems] = useState<Item[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setItems(null);
    const p = new URLSearchParams({ tab });
    if (q.trim()) p.set("q", q.trim());
    if (mineOnly) p.set("mine", "1");
    apiFetch(`/api/om/today?${p}`)
      .then((d) => { setItems(d.items ?? []); setCounts(d.counts ?? {}); })
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setItems([]); });
  }, [tab, q, mineOnly]);
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
        searchPlaceholder="ค้นบ้านเลขที่ · ชื่อลูกค้า · เบอร์โทร"
        tabs={TODAY_TABS.map((t) => ({ key: t.k, label: t.t, count: counts[t.k] ?? 0 }))}
        activeTab={tab}
        onTabChange={setTab}
        tabsLeft={<span className="whitespace-nowrap">{n.toLocaleString("th-TH")} รายการ</span>}
      />

      <div className="p-3 md:p-4">
        {/* แถวเครื่องมือ — ซ้าย = คำอธิบายแท็บ · ขวา = งานของฉัน (ตำแหน่งเดียวกับ Today ฝั่งขาย) */}
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          <p className="flex items-start gap-1.5 text-xxs text-gray-500 leading-relaxed min-w-0">
            <span className="shrink-0 w-3.5 h-3.5 mt-px rounded-full border border-gray-400 text-[9px] font-bold flex items-center justify-center">i</span>
            <span>{cur.hint}</span>
          </p>
          <button
            type="button"
            style={{ minHeight: 0 }}
            onClick={() => {
              const next = !mineOnly;
              setMineOnly(next);
              try { localStorage.setItem("om.today.mineOnly", next ? "1" : "0"); } catch {}
            }}
            className="ml-auto h-7 inline-flex items-center gap-1.5 px-1 text-xxs font-medium text-gray-700 cursor-pointer whitespace-nowrap"
          >
            <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${mineOnly ? "border-gray-800 bg-gray-800" : "border-gray-300"}`}>
              {mineOnly && <CheckIcon className="w-2 h-2 text-white" strokeWidth={4} />}
            </span>
            งานของฉัน
          </button>
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
                แสดง {items.length.toLocaleString("th-TH")} จาก {n.toLocaleString("th-TH")} รายการ — ค้นด้วยบ้านเลขที่/ชื่อเพื่อหาที่เหลือ
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
