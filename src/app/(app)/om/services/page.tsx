"use client";

// งานบริการ O&M — ไปป์ไลน์ 6 ขั้น (แผน 20260924-02 · ตัดรอปิด 28 ก.ย. 69) ติดตาม → [เสนอราคา → ชำระเงิน เฉพาะงานเสียเงิน] → นัดหมาย → เข้างาน → ปิดงาน
// mockup: 20260907_01 (โครงหน้า+ใบงาน) · 20260909_05 (แท็บติดตาม+บันทึกการโทร)
// ★ ผู้ใช้เคาะ 10 ก.ย. 69
//   - การ์ดในแท็บติดตาม "คำนวณสด" ไม่มีแถวงานรอไว้ · แถวงานเกิดตอนโทรแล้วได้ความเท่านั้น
//   - ไม่มีรอบโทร ไม่มีเจ้าของงาน ใครเปิดหน้านี้ก็โทรต่อได้ (ประวัติอยู่ในใบงาน)
//   - การ์ดไม่มีปุ่ม กดทั้งใบเข้าไปทำข้างใน เหมือน LeadCard ของฝั่งขาย
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import { useSearchParams } from "next/navigation";
import { useOpenOmService } from "@/lib/hooks/useOpenOmService";
import { SORTS, TABS, type Item } from "@/lib/om/service-view";
import { ORIGIN_OPTIONS, parseOrigin, type HouseOrigin } from "@/lib/om/house-origin";
import ListPageHeader from "@/components/layout/ListPageHeader";
import Dropdown from "@/components/ui/Dropdown";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import JobCard from "@/components/om/JobCard";

export default function OmServicesPage() {
  const { item: activeItem } = useActiveMenuItem();   // หัวเรื่อง = ชื่อเมนู (กติกา ui-rules)
  // เปิดรายละเอียดเป็น URL จริง — back/refresh/ส่งลิงก์ใช้ได้ (เฟส 3)
  // ★ จอกว้างเปิดแท็บใหม่ ?focus=1 เหมือนกดการ์ด lead ฝั่งขาย (useOpenLead) · มือถือเปิดแท็บเดิม
  const open = useOpenOmService();
  // ★ เฟส 6: รับ ?tab= / ?group= จาก URL — หน้าภาพรวมลิงก์เข้ามาที่แท็บ/โครงการที่กดบนตัวเลข
  //   อ่านเป็นค่าตั้งต้นเท่านั้น กดแท็บต่อในหน้านี้ไม่ต้องเขียน URL กลับ
  //   (ถ้าเขียนกลับ ปุ่ม back จะกลายเป็นย้อนแท็บทีละอัน แทนที่จะกลับหน้าเดิม)
  const sp = useSearchParams();
  const [tab, setTab] = useState<string>(() => sp.get("tab") || "follow");
  const [group, setGroup] = useState(() => sp.get("group") || "");
  // ที่มา (แผน 20261007-01) — ตัวกรองซ้อนบนแท็บแบบ "งานของฉัน" · เลขบนแท็บขยับตาม
  const [origin, setOrigin] = useState<HouseOrigin>("");
  // ★ 24 ต.ค. 69 (แผน 20261024-02): กรองจำนวนครั้งที่ล้างแล้ว — "" ทั้งหมด · 0 ยังไม่เคยล้าง · 1 · 2 · 3 = 3 ครั้งขึ้นไป
  const [wash, setWash] = useState("");
  const [washCounts, setWashCounts] = useState<Record<string, number>>({});
  const [sort, setSort] = useState("wash");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const sortDef = SORTS.find((s) => s.k === sort) ?? SORTS[0];
  const [q, setQ] = useState("");
  // ★ 23 ต.ค. 69 (แผน 20261023-04): พิมพ์ค้นหา = ค้นทุกแท็บ (เดิมค้นเฉพาะแท็บที่เปิด หาบ้านไม่เจอเพราะอยู่แท็บอื่น)
  //   ระหว่างค้นหาแถบแท็บชี้ "ทั้งหมด" · ล้างคำค้นกลับแท็บเดิม · กดแท็บอื่น = ล้างคำค้น
  const searching = !!q.trim();
  const effTab = searching ? "all" : tab;
  // แบ่งหน้า — ยกแถบแบ่งหน้าของหน้าบ้าน / ระบบติดตั้ง O&M (เดิมโหลด 40 ใบแรกของแท็บอย่างเดียว ไม่มีทางดูต่อ)
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(30);
  const [total, setTotal] = useState(0);
  // ★ 15 ต.ค. 69 ผู้ใช้สั่งเอาติ๊ก "งานของฉัน" ออก — กรองจากเจ้าของงาน ซึ่งเอาช่องตั้งเจ้าของงานออกไปแล้ว
  //   (API /api/om/follow ยังรับ mine=1 อยู่ ไม่มีหน้าไหนส่งมาแล้ว)
  const [items, setItems] = useState<Item[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [projects, setProjects] = useState<{ project_id: string; project_name: string; n: number }[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setItems(null);
    const p = new URLSearchParams({ tab: effTab, sort, dir, page: String(page), size: String(size) });
    if (group) p.set("group", group);
    if (q.trim()) p.set("q", q.trim());
    if (origin) p.set("origin", origin);
    if (wash) p.set("wash", wash);
    apiFetch(`/api/om/follow?${p}`)
      .then((d) => {
        setItems(d.items ?? []); setCounts(d.counts ?? {}); setTotal(Number(d.total ?? 0));
        setWashCounts(d.wash_counts ?? {});
        // ★ รายชื่อโครงการนับตามแท็บที่เปิด (แผน 20261015-05) — เลือกโครงการไว้แล้วสลับไปแท็บที่ไม่มีบ้านของโครงการนั้น
        //   ให้คงชื่อไว้ "· 0" ไม่หายไปเฉย ๆ (ช่องจะว่างทั้งที่ยังกรองอยู่)
        setProjects((prev) => {
          const next: typeof prev = d.projects ?? [];
          if (!group || next.some((x) => x.project_id === group)) return next;
          const old = prev.find((x) => x.project_id === group);
          return old ? [...next, { ...old, n: 0 }] : next;
        });
      })
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setItems([]); });
  }, [effTab, group, sort, dir, q, origin, wash, page, size]);
  useEffect(() => { const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t); }, [load, q]);

  const totalAll = Object.values(counts).reduce((s, n) => s + n, 0);
  const pages = Math.max(1, Math.ceil(total / size));
  // เลขหน้าแบบย่อ: 1 … 4 5 6 … 12 (null = จุดไข่ปลา) — ชุดเดียวกับหน้าบ้าน O&M
  const pageNums: (number | null)[] = (() => {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    const near = [page - 1, page, page + 1].filter((n) => n > 1 && n < pages);
    const out: (number | null)[] = [1];
    if (near[0] > 2) out.push(null);
    out.push(...near);
    if (near[near.length - 1] < pages - 1) out.push(null);
    out.push(pages);
    return out;
  })();
  // เปลี่ยนหน้า = เลื่อนกลับบนสุด (หน้าใน (app) เลื่อนใน <main> ไม่ใช่ window)
  const goPage = (n: number) => { setPage(n); document.querySelector("main")?.scrollTo({ top: 0 }); };

  return (
    <div>
      {/* หัวจอกลางชุดเดียวกับ Pipeline/Today/Seeker (เฟส 2 ของแผน 20260922-01)
          ★ กติกา ui-rules: หัวเรื่อง = ชื่อเมนูที่ active · ห้ามเขียนหัวจอเอง
          ★ ตัวกรอง/เรียง/มุมมอง ย้ายลงมาในตัวหน้า ไม่ใช้ tabsRight — ยกแนวจาก Pipeline
            (tabsRight ซ่อนบนจอแคบ ของพวกนี้ต้องใช้บนมือถือได้) */}
      <ListPageHeader
        title={activeItem?.label ?? "งานบริการ"}
        search={q}
        onSearchChange={(v) => { setQ(v); setPage(1); }}
        // ★ 24 ต.ค. 69 (แผน 20261024-01): ค้นได้เพิ่ม — ทุกชื่อ/ทุกเบอร์ของบ้าน · เลขใบงาน/เอกสาร · ขนาด kW (เกณฑ์อยู่ที่ /api/om/follow)
        searchPlaceholder="ค้นหาบ้านเลขที่ · ชื่อ · เบอร์ · เลขใบงาน/เอกสาร · ขนาด kW (เช่น 1.28kw)"
        // ★ แผน 20261023-04: แท็บแรก "ทั้งหมด" แทนตัวเลข "x รายการ" ที่กดไม่ได้ (แบบแท็บทั้งหมดของ Pipeline ฝั่งขาย)
        tabs={[{ key: "all", label: "ทั้งหมด", count: totalAll },
          ...TABS.map((t) => ({ key: t.k, label: t.t, count: counts[t.k] ?? 0 }))]}
        activeTab={effTab}
        onTabChange={(k) => { setTab(k); setQ(""); setPage(1); }}
      />

      <div className="p-3 md:p-4">
        {/* ★ 24 ก.ย. 69 จัดแถวเครื่องมือตามแนว Pipeline: ซ้าย = จำนวน+กรอง · ขวา = เรียง (งานของฉัน เอาออก 15 ต.ค. 69)
            ★ 25 ก.ย. 69 ผู้ใช้สั่งยกเลิกมุมมองแบบตาราง — เหลือแบบการ์ดอย่างเดียว
            ★ 1 ต.ค. 69 ผู้ใช้สั่งให้เรียงเหมือน Pipeline เป๊ะ: 2 ช่อง เรียงตามอะไร + ทิศทาง */}
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          {/* ★ 1 ต.ค. 69 ผู้ใช้ขอพิมพ์ค้นได้ + กว้างขึ้น — ขนาด/searchable ชุดเดียวกับช่องโครงการหน้ารายชื่อบ้าน O&M */}
          <Dropdown
            className="w-full md:w-72 font-normal"
            value={group}
            onChange={(v) => { setGroup(v); setPage(1); }}
            options={[{ value: "", label: `ทุกโครงการ (${projects.filter((p) => p.n > 0).length})` },
              ...projects.map((p) => ({ value: p.project_id, label: `${p.project_name} · ${p.n}` }))]}
            searchable
          />
          {/* ที่มา — ยกช่อง "ช่องทาง" ของ Pipeline (แผน 20261007-01) · เลือกซ้ำ = ล้างกลับทุกที่มา */}
          <Dropdown
            className="w-44 font-normal"
            value={origin}
            onChange={(v) => { setOrigin(parseOrigin(v)); setPage(1); }}
            options={ORIGIN_OPTIONS}
          />
          {/* ★ แผน 20261024-02: ล้างแล้วกี่ครั้ง — เลขข้างตัวเลือก = จำนวนบ้านในแท็บ/โครงการ/ที่มาที่เลือก (ไม่นับคำค้น) */}
          <Dropdown
            className="w-48 font-normal"
            value={wash}
            onChange={(v) => { setWash(v); setPage(1); }}
            options={[
              { value: "", label: "ทุกจำนวนครั้งที่ล้าง" },
              { value: "0", label: `ยังไม่เคยล้าง · ${washCounts["0"] ?? 0}` },
              { value: "1", label: `ล้างแล้ว 1 ครั้ง · ${washCounts["1"] ?? 0}` },
              { value: "2", label: `ล้างแล้ว 2 ครั้ง · ${washCounts["2"] ?? 0}` },
              { value: "3", label: `ล้างแล้ว 3 ครั้งขึ้นไป · ${washCounts["3"] ?? 0}` },
            ]}
          />
          <div className="ml-auto flex items-center gap-2">
            <Dropdown
              className="w-36"
              value={sort}
              onChange={(v) => {
                if (!v) return;
                setSort(v);
                setDir(SORTS.find((s) => s.k === v)?.def ?? "asc");
                setPage(1);
              }}
              options={SORTS.map((s) => ({ value: s.k, label: s.t }))}
            />
            <Dropdown
              className="w-32"
              value={dir}
              onChange={(v) => { if (v) { setDir(v as "asc" | "desc"); setPage(1); } }}
              options={[
                { value: "asc", label: sortDef.asc },
                { value: "desc", label: sortDef.desc },
              ]}
            />
          </div>
        </div>

        {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>}
        {items === null ? <Loading /> : items.length === 0 ? (
          <div className="text-center text-gray-400 py-16 text-sm">{searching ? "ไม่พบรายการที่ค้นหา" : "ไม่มีรายการในแท็บนี้"}</div>
        ) : (
          <>
            <div className="space-y-2">
              {items.map((r) => <JobCard key={r.house_id} r={r} onOpen={() => open(r.house_id)} />)}
            </div>
            {/* แถบแบ่งหน้า — ยกจากหน้าบ้าน / ระบบติดตั้ง O&M (houses/page.tsx) */}
            <div className="mt-3 px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 flex items-center gap-2 flex-wrap text-xs text-gray-500">
              <span className="font-semibold">
                {`${((page - 1) * size + 1).toLocaleString()}–${Math.min(page * size, total).toLocaleString()} จาก ${total.toLocaleString()} รายการ`}
              </span>
              {pages > 1 && <span>· หน้า <b className="text-gray-700">{page}</b> จาก {pages}</span>}
              <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}
                className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold outline-none focus:border-primary cursor-pointer">
                {[30, 50, 100].map((n) => <option key={n} value={n}>{n} ต่อหน้า</option>)}
              </select>
              {pages > 1 && (
                <span className="ml-auto flex gap-1 items-center">
                  <button type="button" style={{ minHeight: 0 }} disabled={page <= 1} onClick={() => goPage(page - 1)}
                    className="w-9 h-9 rounded-lg border border-gray-200 bg-white cursor-pointer disabled:opacity-40">‹</button>
                  {pageNums.map((n, i) => n === null
                    ? <span key={`gap${i}`} className="px-1 text-gray-400">…</span>
                    : <button key={n} type="button" style={{ minHeight: 0 }} onClick={() => goPage(n)}
                        className={`min-w-9 h-9 px-2 rounded-lg border text-xs font-bold cursor-pointer ${
                          n === page ? "bg-active-light border-active text-active" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                        {n}</button>)}
                  <button type="button" style={{ minHeight: 0 }} disabled={page >= pages} onClick={() => goPage(page + 1)}
                    className="w-9 h-9 rounded-lg border border-gray-200 bg-white cursor-pointer disabled:opacity-40">›</button>
                </span>
              )}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
