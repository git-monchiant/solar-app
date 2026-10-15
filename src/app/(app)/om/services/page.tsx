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
  const [sort, setSort] = useState("wash");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const sortDef = SORTS.find((s) => s.k === sort) ?? SORTS[0];
  const [q, setQ] = useState("");
  // ★ 15 ต.ค. 69 ผู้ใช้สั่งเอาติ๊ก "งานของฉัน" ออก — กรองจากเจ้าของงาน ซึ่งเอาช่องตั้งเจ้าของงานออกไปแล้ว
  //   (API /api/om/follow ยังรับ mine=1 อยู่ ไม่มีหน้าไหนส่งมาแล้ว)
  const [items, setItems] = useState<Item[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [projects, setProjects] = useState<{ project_id: string; project_name: string; n: number }[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setItems(null);
    const p = new URLSearchParams({ tab, sort, dir, size: "40" });
    if (group) p.set("group", group);
    if (q.trim()) p.set("q", q.trim());
    if (origin) p.set("origin", origin);
    apiFetch(`/api/om/follow?${p}`)
      .then((d) => {
        setItems(d.items ?? []); setCounts(d.counts ?? {});
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
  }, [tab, group, sort, dir, q, origin]);
  useEffect(() => { const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t); }, [load, q]);

  const totalAll = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <div>
      {/* หัวจอกลางชุดเดียวกับ Pipeline/Today/Seeker (เฟส 2 ของแผน 20260922-01)
          ★ กติกา ui-rules: หัวเรื่อง = ชื่อเมนูที่ active · ห้ามเขียนหัวจอเอง
          ★ ตัวกรอง/เรียง/มุมมอง ย้ายลงมาในตัวหน้า ไม่ใช้ tabsRight — ยกแนวจาก Pipeline
            (tabsRight ซ่อนบนจอแคบ ของพวกนี้ต้องใช้บนมือถือได้) */}
      <ListPageHeader
        title={activeItem?.label ?? "งานบริการ"}
        search={q}
        onSearchChange={setQ}
        searchPlaceholder="ค้นบ้านเลขที่ · ชื่อลูกค้า · เบอร์โทร"
        tabs={TABS.map((t) => ({ key: t.k, label: t.t, count: counts[t.k] ?? 0 }))}
        activeTab={tab}
        onTabChange={setTab}
        tabsLeft={<span className="whitespace-nowrap">{totalAll.toLocaleString("th-TH")} รายการ</span>}
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
            onChange={(v) => setGroup(v)}
            options={[{ value: "", label: `ทุกโครงการ (${projects.filter((p) => p.n > 0).length})` },
              ...projects.map((p) => ({ value: p.project_id, label: `${p.project_name} · ${p.n}` }))]}
            searchable
          />
          {/* ที่มา — ยกช่อง "ช่องทาง" ของ Pipeline (แผน 20261007-01) · เลือกซ้ำ = ล้างกลับทุกที่มา */}
          <Dropdown
            className="w-44 font-normal"
            value={origin}
            onChange={(v) => setOrigin(parseOrigin(v))}
            options={ORIGIN_OPTIONS}
          />
          <div className="ml-auto flex items-center gap-2">
            <Dropdown
              className="w-36"
              value={sort}
              onChange={(v) => {
                if (!v) return;
                setSort(v);
                setDir(SORTS.find((s) => s.k === v)?.def ?? "asc");
              }}
              options={SORTS.map((s) => ({ value: s.k, label: s.t }))}
            />
            <Dropdown
              className="w-32"
              value={dir}
              onChange={(v) => { if (v) setDir(v as "asc" | "desc"); }}
              options={[
                { value: "asc", label: sortDef.asc },
                { value: "desc", label: sortDef.desc },
              ]}
            />
          </div>
        </div>

        {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>}
        {items === null ? <Loading /> : items.length === 0 ? (
          <div className="text-center text-gray-400 py-16 text-sm">ไม่มีรายการในแท็บนี้</div>
        ) : (
          <div className="space-y-2">
            {items.map((r) => <JobCard key={r.house_id} r={r} onOpen={() => open(r.house_id)} />)}
          </div>
        )}
      </div>

    </div>
  );
}
