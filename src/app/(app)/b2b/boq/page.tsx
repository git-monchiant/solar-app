"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Dropdown from "@/components/ui/Dropdown";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import { useDialog } from "@/components/ui/Dialog";
import { XIcon } from "@/components/ui/icons";
import BoqSourceField, { copiedMessage } from "@/components/b2b/boq/BoqSourceField";
import { apiFetch } from "@/lib/api";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatThaiDate, formatTHB } from "@/lib/utils/formatters";
import { B2B_BOQ_ROLES, B2B_BOQ_VIEW_ROLES } from "@/lib/b2b/boq";
import { perWp } from "@/lib/b2b/boq-calc";
import { B2B_STAGE, type B2bProjectRow } from "@/lib/b2b/project";

// รายการใบ BOQ (โมดูล Commercial B2B) — แผน docs/plan/20261005-01-b2b-boq-module.md เฟส 3
// ค่าเริ่มต้นแสดง Rev ล่าสุดของแต่ละเลขที่ · ยอดในตาราง = ค่าที่ server คำนวณเก็บไว้ตอนบันทึก (ก่อน VAT)

type Row = {
  id: number; doc_no: string; revision: number; is_latest: boolean;
  project_id: number | null; project_code: string | null; option_label: string | null;
  project_name: string; customer_name: string | null;
  location: string | null; capacity_wp: number | null; total_sale: number | null; vat_pct: number | null; pending_lines: number;
  updated_at: string; updated_by_name: string | null;
};

export default function B2bBoqListPage() {
  const router = useRouter();
  const { toast } = useDialog();
  const { item } = useActiveMenuItem();   // หัวเรื่อง = ชื่อเมนู (กติกา ui-rules)
  const { activeRoles } = useActiveRoles();
  const canUse = hasRole(activeRoles, ...B2B_BOQ_VIEW_ROLES);
  const canEdit = hasRole(activeRoles, ...B2B_BOQ_ROLES);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [all, setAll] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  // สร้าง BOQ ต้องเลือกโครงการ (แผน 20261015-07) — ชื่อโครงการ/ลูกค้า/ที่ตั้งดึงจากโครงการ
  // copy_from = เริ่มจากใบอื่น (แผน 20261016-02) — ว่าง = ใบเปล่า
  const [form, setForm] = useState({ project_id: "", option_label: "", margin_pct: "15", copy_from: "" });
  const [projects, setProjects] = useState<B2bProjectRow[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canUse) return;
    apiFetch(`/api/b2b/boqs${all ? "?all=1" : ""}`).then((r: Row[]) => setRows(r)).catch(() => setRows([]));
  }, [canUse, all]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || [r.doc_no, r.project_name, r.customer_name, r.location].some((x) => (x ?? "").toLowerCase().includes(q)));
  }, [rows, search]);

  // โหมดทุก Revision จัดกลุ่มตามลูกค้า — ชื่อเทียบแบบไม่สนตัวพิมพ์/ช่องว่างหัวท้าย (สะกดต่างกันยังแยกกลุ่ม)
  // ลำดับกลุ่ม = ลูกค้าที่มีใบบันทึกล่าสุดก่อน · ในกลุ่มคงลำดับจาก API (เลขที่เดียวกันติดกัน Rev ใหม่ → เก่า)
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; rows: Row[] }>();
    for (const r of shown) {
      const name = r.customer_name?.trim() ?? "";
      const key = name.toLowerCase();
      if (!map.has(key)) map.set(key, { name, rows: [] });
      map.get(key)!.rows.push(r);
    }
    return [...map.values()];
  }, [shown]);

  const title = item?.label ?? "รายการ BOQ";
  if (activeRoles.length > 0 && !canUse) {
    return (
      <div>
        <Header title={title} subtitle="COMMERCIAL (B2B)" />
        <main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">role ที่กำลังใช้งานไม่มีสิทธิ์เปิดหน้านี้</div></main>
      </div>
    );
  }
  if (!rows) return <Loading />;

  const openCreate = () => {
    setError(""); setCreating(true);
    if (!projects) apiFetch("/api/b2b/projects?stage=open").then(setProjects).catch(() => setProjects([]));
  };
  const create = async () => {
    setError(""); setSaving(true);
    try {
      const r = await apiFetch("/api/b2b/boqs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }) as { id: number; copied: { lines: number; inactive: number } | null };
      const msg = copiedMessage(r.copied);
      if (msg) toast({ message: msg, variant: r.copied?.inactive ? "warning" : "success" });
      router.push(`/b2b/boq/${r.id}`);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "สร้างใบ BOQ ไม่สำเร็จ");
      setSaving(false);
    }
  };
  const fieldCls = "w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10";
  // คอลัมน์ w-px + nowrap = กว้างเท่าเนื้อหา → ที่เหลือยกให้ โครงการ/ลูกค้า (ตัวเลขไม่ห่างกันจนตาต้องกวาดไกล)
  const fit = "w-px whitespace-nowrap";
  const numCls = "pl-6 pr-3 py-2 text-right tabular-nums whitespace-nowrap";
  // โหมดทุก Revision: "ใบ" = จำนวนเลขที่ ไม่ใช่จำนวนแถว
  const docCount = all ? new Set(shown.map((r) => r.doc_no)).size : shown.length;

  const rowEl = (r: Row) => (
    // Rev เก่า (โหมดทุก Revision) จางทั้งแถว — อยู่ใต้ Rev ล่าสุดของเลขที่เดียวกัน
    <tr key={r.id} onClick={() => router.push(`/b2b/boq/${r.id}`)} className={`cursor-pointer border-t border-gray-100 hover:bg-primary/5 ${r.is_latest ? "" : "[&>td]:opacity-50"}`}>
      {/* ตัวเลขทุกช่องขนาดเดียวกับเนื้อตาราง (text-sm) — ช่อง 2 บรรทัดใช้บรรทัดรองเล็ก แบบช่องโครงการ */}
      <td className="px-3 py-2 whitespace-nowrap">
        {r.doc_no}
        <span className="ml-1.5 text-gray-500">Rev {r.revision}{!r.is_latest && " (เก่า)"}</span>
      </td>
      <td className="px-3 py-2 font-semibold text-gray-900">
        {r.project_name}
        {r.option_label && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xxs font-semibold text-gray-600">{r.option_label}</span>}
        {r.pending_lines > 0 && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xxs font-semibold text-red-600">รอราคา {r.pending_lines}</span>}
        <div className="text-xs font-normal text-gray-400">
          {r.project_id
            ? <Link href={`/b2b/projects/${r.project_id}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">{r.project_code}</Link>
            : "ยังไม่ผูกโครงการ"}
          {r.location && ` · ${r.location}`}
        </div>
      </td>
      <td className="px-3 py-2 text-gray-600">{r.customer_name ?? ""}</td>
      {/* ใบที่ยังไม่มีรายการ (ยอด 0) ขึ้น "—" ทั้ง kWp / บาท/Wp / ราคา ให้เหมือนกัน */}
      <td className={numCls}>{r.capacity_wp ? formatTHB(r.capacity_wp / 1000, { decimals: 2 }) : "—"}</td>
      <td className={numCls}>{r.capacity_wp && r.total_sale ? perWp(r.total_sale, r.capacity_wp).toFixed(2) : "—"}</td>
      {/* medium (500) ไม่ใช่ semibold — ฟอนต์ไม่มี 600 จะกระโดดไปตัวหนา 700 ดูไม่เข้ากับตัวเลขข้างๆ */}
      {/* ตัวหลัก = ก่อน VAT (ฐานเดียวกับ บาท/Wp · ลูกค้า B2B เทียบราคาก่อน VAT) · บรรทัดรอง = รวม VAT ตาม % ของใบ
          (ไม่รวมส่วนเพิ่มเติมแบบทางเลือก เหมือน "รวมเงินสุทธิ" ในหน้าทำ BOQ) */}
      <td className={`${numCls} font-medium`}>
        {r.total_sale ? formatTHB(r.total_sale, { decimals: 2 }) : "—"}
        {r.total_sale ? <div className="text-xs font-normal text-gray-400">รวม VAT {formatTHB(r.total_sale * (1 + (r.vat_pct ?? 7) / 100), { decimals: 2 })}</div> : null}
      </td>
      <td className="pl-6 pr-3 py-2 text-gray-600 whitespace-nowrap">{formatThaiDate(r.updated_at, { time: true })}{r.updated_by_name ? <div className="text-xs text-gray-400">{r.updated_by_name}</div> : null}</td>
    </tr>
  );

  return (
    <div>
      <Header title={title} subtitle={`COMMERCIAL (B2B) · ${docCount} ใบ${all ? ` · ${shown.length} Revision` : ""}`} />
      <div className="p-3 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา เลขที่ / โครงการ / ลูกค้า / ที่ตั้ง…"
            className="h-8 px-4 rounded-lg border border-gray-200 text-sm flex-1 min-w-[200px] focus:outline-none focus:border-primary" />
          <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> แสดงทุก Revision
          </label>
          {canEdit && <button type="button" onClick={openCreate}
            className="h-8 px-5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors">+ สร้าง BOQ</button>}
        </div>

        {shown.length === 0 ? (
          <div className="rounded-xl bg-white border border-gray-300 px-5 py-10 text-center text-sm text-gray-400">
            {rows.length === 0 ? "ยังไม่มีใบ BOQ — กด \"+ สร้าง BOQ\" เพื่อเริ่ม" : "ไม่พบใบ BOQ ตามคำค้น"}
          </div>
        ) : (
          <div className="rounded-xl bg-white border border-gray-300 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500">
                  <th className={`px-3 py-2 font-semibold ${fit}`}>เลขที่</th>
                  <th className="px-3 py-2 font-semibold">โครงการ</th>
                  <th className="px-3 py-2 font-semibold w-[22%]">ลูกค้า</th>
                  <th className={`${numCls} font-semibold ${fit}`}>kWp</th>
                  <th className={`${numCls} font-semibold ${fit}`}>ขาย บาท/Wp</th>
                  <th className={`${numCls} font-semibold ${fit}`}>ราคาขาย (ก่อน VAT)</th>
                  <th className={`pl-6 pr-3 py-2 font-semibold ${fit}`}>บันทึกล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {all
                  ? groups.flatMap((g) => [
                      // หัวกลุ่มลูกค้า — แบบแถวกลุ่มย่อยในหน้าวัสดุและราคา
                      <tr key={`g-${g.name}`} className="border-t border-gray-200 bg-slate-50/70">
                        <td colSpan={7} className="px-3 py-1.5 text-xs font-bold text-gray-600">
                          {g.name || "ไม่ระบุลูกค้า"}
                          <span className="ml-2 font-normal text-gray-400">{new Set(g.rows.map((r) => r.doc_no)).size} ใบ · {g.rows.length} Revision</span>
                        </td>
                      </tr>,
                      ...g.rows.map(rowEl),
                    ])
                  : shown.map(rowEl)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-50 flex items-start justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/20 w-full max-w-lg my-8">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">สร้าง BOQ ใหม่</h2>
                <p className="text-xs text-gray-400 mt-0.5">BOQ เป็นตัวเลือกขนาดของโครงการ — ได้เลขที่อัตโนมัติ (Rev 0) แล้วไปเติมรายการต่อ</p>
              </div>
              <button type="button" onClick={() => setCreating(false)} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center">
                <XIcon className="w-5 h-5 text-gray-500" strokeWidth={2} />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">โครงการ <span className="text-red-500">*</span></label>
                <Dropdown searchable value={form.project_id} onChange={(v) => setForm({ ...form, project_id: v })}
                  placeholder={projects ? (projects.length ? "เลือกโครงการ" : "ยังไม่มีโครงการที่เปิดอยู่") : "กำลังโหลด…"}
                  options={(projects ?? []).filter((x) => x.stage <= B2B_STAGE.confirm).map((x) => ({ value: String(x.id), label: `${x.code} · ${x.name} · ${x.customer_name}` }))} />
                <p className="mt-1 text-xs text-gray-400">ยังไม่มีโครงการ? <Link href="/b2b/projects?stage=sales" className="text-primary hover:underline">สร้างโครงการก่อน</Link></p></div>
              <BoqSourceField projectId={form.project_id ? Number(form.project_id) : null} value={form.copy_from} labelCls="block text-xs font-semibold text-gray-500 mb-1"
                onChange={(v, row) => setForm((f) => ({ ...f, copy_from: v, ...(row?.margin_pct != null ? { margin_pct: String(row.margin_pct) } : {}) }))} />
              <div><label className="block text-xs font-semibold text-gray-500 mb-1">ชื่อตัวเลือก</label>
                <input className={fieldCls} value={form.option_label} onChange={(e) => setForm({ ...form, option_label: e.target.value })} placeholder="เช่น 998.64 kWp · Jinko 730" /></div>
              <div className="max-w-[12rem]"><label className="block text-xs font-semibold text-gray-500 mb-1">Margin (% ของราคาขาย)</label>
                <input type="number" step="0.01" min={0} max={99} className={`${fieldCls} text-right`} value={form.margin_pct} onChange={(e) => setForm({ ...form, margin_pct: e.target.value })} /></div>
              {error && <div className="text-sm text-red-600">{error}</div>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button type="button" onClick={() => setCreating(false)} className="h-9 px-4 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">ยกเลิก</button>
              <button type="button" onClick={() => void create()} disabled={saving}
                className="h-9 px-5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50">{saving ? "กำลังสร้าง…" : "สร้าง"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
