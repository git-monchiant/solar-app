"use client";

// ลูกค้า O&M — ตารางบน desktop / การ์ดบนมือถือ + drawer แก้ไข (mockup 20260901_01 เคาะ 1 ก.ย.)
// สิทธิ์ล้างไม่แสดงหน้านี้ — อยู่หน้าบ้าน/ระบบติดตั้ง (ผู้ใช้สั่งกันสับสน)
// ★ 28 ก.ย. 69 (แผน 20260928-04 ข้อ 2): โครงหน้ายกจาก /om/houses ทะเบียนคู่กันทั้งก้อน
//   ListPageHeader (ค้นหา + ตัวกรองเป็นแท็บ) · แถวเครื่องมือ · ตาราง/การ์ดกดทั้งแถว (ไม่มีปุ่มแก้ไข) · ท้ายตารางแบ่งหน้า
//   แท็บไม่มีตัวเลข — API คืนยอดเฉพาะแท็บที่เลือก ตัวเลขอยู่ที่ tabsLeft แทน (ไม่โชว์เลขที่กดแล้วไม่เจอ)
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import ListPageHeader from "@/components/layout/ListPageHeader";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import OmCustomerModal from "@/components/om/OmCustomerModal";
import Dropdown from "@/components/ui/Dropdown";
import { ORIGIN_OPTIONS, parseOrigin, type HouseOrigin } from "@/lib/om/house-origin";

interface Row {
  id: number; full_name: string; title: string | null; first_name: string | null; last_name: string | null;
  is_active: boolean; phone: string | null; phone_count: number; house_count: number;
  first_house: string | null; line_linked: number;
}
// ตัวกรองเดิม (ชิปกดสลับ) → แท็บแบบหน้าบ้าน · "all" = ไม่กรอง (API รับค่าว่าง)
const TABS = [
  { k: "all", t: "ทั้งหมด" },
  { k: "nophone", t: "ไม่มีเบอร์" }, { k: "bad", t: "ชื่อน่าสงสัย" },
  { k: "line", t: "ผูก LINE" }, { k: "multi", t: "หลายบ้าน" }, { k: "hidden", t: "ที่ซ่อนไว้" },
];

export default function OmCustomersPage() {
  const { item: activeItem } = useActiveMenuItem();   // หัวเรื่อง = ชื่อเมนู (กติกา ui-rules)
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [origin, setOrigin] = useState<HouseOrigin>("");   // ที่มา — นับจากบ้านที่ผูกอยู่ (แผน 20261007-01)
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(30);
  // ลูกค้าที่เปิดดูอยู่ — modal แยกเป็น component กลาง (หน้ารายละเอียดงานบริการใช้ตัวเดียวกัน)
  const [selId, setSelId] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  const load = useCallback(() => {
    const u = new URLSearchParams({ q, filter: filter === "all" ? "" : filter, page: String(page), size: String(size) });
    if (origin) u.set("origin", origin);
    apiFetch(`/api/om/customers?${u}`)
      .then((d) => { setRows(d.customers ?? []); setTotal(d.total ?? 0); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [q, filter, page, size, origin]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const show = (id: number) => setSelId(id);

  // แบ่งหน้าแบบหน้าบ้าน — เลขหน้า + … เมื่อหน้าเยอะ
  const pages = Math.max(1, Math.ceil(total / size));
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

  return (
    <div>
      {/* หัวจอกลางชุดเดียวกับหน้าบ้าน/งานบริการ — หัวเรื่อง = ชื่อเมนูที่ active · ตัวกรองเดิมเป็นแท็บ */}
      <ListPageHeader
        title={activeItem?.label ?? "ลูกค้า"}
        subtitle="O&M · ทะเบียนลูกค้า · สิทธิ์ล้างดูที่หน้าบ้าน / ระบบติดตั้ง"
        search={q}
        onSearchChange={(v) => { setQ(v); setPage(1); }}
        searchPlaceholder="ค้นชื่อ · เบอร์ · บ้านเลขที่ · โครงการ"
        tabs={TABS.map((t) => ({ key: t.k, label: t.t }))}
        activeTab={filter}
        onTabChange={(k) => { setFilter(k); setPage(1); }}
        tabsLeft={rows ? <span className="whitespace-nowrap">{total.toLocaleString("th-TH")} คน</span> : undefined}
      />

      <div className="p-3 md:p-4 flex flex-col gap-3">
        {/* แถวเครื่องมือแบบหน้าบ้าน — ★ 7 ต.ค. 69 เพิ่มเพื่อวาง dropdown "ที่มา" (แผน 20261007-01)
            ไม่ใส่จำนวนซ้ำ — จำนวนคนอยู่ที่ tabsLeft แล้ว */}
        <div className="flex flex-wrap items-center gap-2 px-1">
          <Dropdown
            className="w-44 font-normal"
            value={origin}
            onChange={(v) => { setOrigin(parseOrigin(v)); setPage(1); }}
            options={ORIGIN_OPTIONS}
          />
        </div>

        {err && <div className="border border-red-200 bg-red-50 p-3 rounded-xl text-sm font-semibold text-red-700">{err}</div>}

        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {rows === null ? <Loading /> : (
          <>
            {/* ตาราง (desktop) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse">
                <thead><tr className="bg-gray-50 text-left">
                  {["ชื่อ", "เบอร์โทร", "บ้านที่ผูก", "สถานะ", ""].map((h) => (
                    <th key={h} className="px-4 py-2 text-xs font-bold text-gray-500 border-b border-gray-200 whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} onClick={() => show(c.id)}
                      className={`cursor-pointer hover:bg-teal-50/40 ${c.is_active ? "" : "opacity-55"}`}>
                      <td className="px-4 py-2 border-b border-gray-100">
                        <span className="text-sm font-bold">{c.full_name || "— ไม่มีชื่อ —"}</span>
                      </td>
                      <td className="px-4 py-2 border-b border-gray-100 text-sm">
                        {c.phone ? <>
                          <b>{c.phone}</b>{c.phone_count > 1 && <span className="ml-1 text-xxs font-bold px-2 rounded-full bg-gray-100 text-gray-500">+{c.phone_count - 1}</span>}
                        </> : <span className="text-amber-600 font-bold text-xs">ไม่มีเบอร์</span>}
                      </td>
                      <td className="px-4 py-2 border-b border-gray-100 text-sm">
                        {c.house_count > 1 ? <b>{c.house_count} หลัง</b> : (c.first_house || "—")}
                      </td>
                      <td className="px-4 py-2 border-b border-gray-100">
                        {!c.is_active && <span className="text-xxs font-bold px-2 rounded-full bg-gray-100 text-gray-500 mr-1">ซ่อนอยู่</span>}
                        {c.line_linked ? <span className="text-xxs font-bold px-2 rounded-full bg-teal-50 text-teal-700">LINE</span> : null}
                      </td>
                      {/* ปุ่ม "แก้ไข" → ลูกศร แบบหน้าบ้าน (25 ก.ย. 69) — กดทั้งแถวเปิดอยู่แล้ว */}
                      <td className="px-3 py-2 border-b border-gray-100 text-right text-lg leading-none text-gray-300 w-8">›</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* การ์ด (mobile) */}
            <div className="md:hidden">
              {rows.map((c) => (
                <div key={c.id} onClick={() => show(c.id)}
                  className={`flex gap-3 px-4 py-3 border-t border-gray-100 items-start cursor-pointer active:bg-teal-50/40 ${c.is_active ? "" : "opacity-55"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">{c.full_name || "— ไม่มีชื่อ —"}</div>
                    <div className="text-xs font-medium text-gray-500">
                      {c.phone || "⚠ ไม่มีเบอร์"} · {c.house_count > 1 ? `${c.house_count} หลัง` : (c.first_house || "—")}
                    </div>
                    <div className="mt-0.5 flex gap-1 flex-wrap">
                      {c.line_linked ? <span className="text-xxs font-bold px-2 rounded-full bg-teal-50 text-teal-700">LINE</span> : null}
                      {!c.is_active && <span className="text-xxs font-bold px-2 rounded-full bg-gray-100 text-gray-500">ซ่อนอยู่</span>}
                    </div>
                  </div>
                  <span className="self-center text-xl leading-none text-gray-300 shrink-0">›</span>
                </div>
              ))}
            </div>

            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center gap-2 flex-wrap text-xs text-gray-500">
              <span className="font-semibold">
                {total === 0 ? "ไม่มีรายการ"
                  : `${((page - 1) * size + 1).toLocaleString()}–${Math.min(page * size, total).toLocaleString()} จาก ${total.toLocaleString()} คน`}
              </span>
              {pages > 1 && <span>· หน้า <b className="text-gray-700">{page}</b> จาก {pages}</span>}
              <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}
                className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold outline-none focus:border-primary cursor-pointer">
                {[30, 50, 100].map((n) => <option key={n} value={n}>{n} ต่อหน้า</option>)}
              </select>

              {pages > 1 && (
                <span className="ml-auto flex gap-1 items-center">
                  <button type="button" style={{ minHeight: 0 }} disabled={page <= 1} onClick={() => setPage(page - 1)}
                    className="w-9 h-9 rounded-lg border border-gray-200 bg-white cursor-pointer disabled:opacity-40">‹</button>
                  {pageNums.map((n, i) => n === null
                    ? <span key={`gap${i}`} className="px-1 text-gray-400">…</span>
                    : <button key={n} type="button" style={{ minHeight: 0 }} onClick={() => setPage(n)}
                        className={`min-w-9 h-9 px-2 rounded-lg border text-xs font-bold cursor-pointer ${
                          n === page ? "bg-active-light border-active text-active" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                        {n}</button>)}
                  <button type="button" style={{ minHeight: 0 }} disabled={page >= pages} onClick={() => setPage(page + 1)}
                    className="w-9 h-9 rounded-lg border border-gray-200 bg-white cursor-pointer disabled:opacity-40">›</button>
                </span>
              )}
            </div>
          </>
        )}
        </div>
      </div>

      {selId !== null && (
        <OmCustomerModal customerId={selId} onClose={() => setSelId(null)} onChanged={load} onToast={say} />
      )}

      {toast && (
        <div className="fixed left-1/2 bottom-7 -translate-x-1/2 z-[90] bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
          {toast}</div>
      )}
    </div>
  );
}
