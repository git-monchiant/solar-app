"use client";

// ลูกค้า O&M — ตารางบน desktop / การ์ดบนมือถือ + drawer แก้ไข (mockup 20260901_01 เคาะ 1 ก.ย.)
// สิทธิ์ล้างไม่แสดงหน้านี้ — อยู่หน้าบ้าน/ระบบติดตั้ง (ผู้ใช้สั่งกันสับสน)
// ★ 28 ก.ย. 69 (แผน 20260928-04 ข้อ 2): โครงหน้ายกจาก /om/houses ทะเบียนคู่กันทั้งก้อน
//   ListPageHeader (ค้นหา + ตัวกรองเป็นแท็บ) · แถวเครื่องมือ · ตาราง/การ์ดกดทั้งแถว (ไม่มีปุ่มแก้ไข) · ท้ายตารางแบ่งหน้า
//   แท็บไม่มีตัวเลข — API คืนยอดเฉพาะแท็บที่เลือก ตัวเลขอยู่ที่ tabsLeft แทน (ไม่โชว์เลขที่กดแล้วไม่เจอ)
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import ModalBase from "@/components/ui/ModalBase";
import ListPageHeader from "@/components/layout/ListPageHeader";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import { useDialog } from "@/components/ui/Dialog";

interface Row {
  id: number; full_name: string; title: string | null; first_name: string | null; last_name: string | null;
  is_active: boolean; phone: string | null; phone_count: number; house_count: number;
  first_house: string | null; line_linked: number;
}
interface Detail {
  customer: { id: number; full_name: string; title: string | null; first_name: string; last_name: string | null; id_card: string | null; is_active: boolean };
  phones: { id: number; phone: string; is_primary: boolean }[];
  houses: { link_id: number; role: string; house_id: number; house_number: string | null; project_name: string | null }[];
  washes: number; active_bookings: number;
  history: { action: string; reason: string | null; from_json: string | null; to_json: string | null; created_at: string }[];
}
const ROLE: Record<string, string> = { owner: "เจ้าของ", resident: "ผู้อยู่อาศัย", contact: "ผู้ติดต่อ" };
const ACT: Record<string, string> = {
  create: "สร้าง", update: "แก้ไข", soft_delete: "ซ่อน", restore: "กู้คืน", hard_delete: "ลบถาวร",
  merge: "รวมคนซ้ำ", link_house: "ผูกบ้าน", unlink_house: "ถอดบ้าน", phone_add: "เพิ่มเบอร์", phone_del: "ลบเบอร์", lead_sync: "ดึงจากระบบขาย",
};
// ตัวกรองเดิม (ชิปกดสลับ) → แท็บแบบหน้าบ้าน · "all" = ไม่กรอง (API รับค่าว่าง)
const TABS = [
  { k: "all", t: "ทั้งหมด" },
  { k: "nophone", t: "ไม่มีเบอร์" }, { k: "bad", t: "ชื่อน่าสงสัย" },
  { k: "line", t: "ผูก LINE" }, { k: "multi", t: "หลายบ้าน" }, { k: "hidden", t: "ที่ซ่อนไว้" },
];

export default function OmCustomersPage() {
  const { item: activeItem } = useActiveMenuItem();   // หัวเรื่อง = ชื่อเมนู (กติกา ui-rules)
  const dialog = useDialog();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(30);
  const [sel, setSel] = useState<Detail | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  const load = useCallback(() => {
    const u = new URLSearchParams({ q, filter: filter === "all" ? "" : filter, page: String(page), size: String(size) });
    apiFetch(`/api/om/customers?${u}`)
      .then((d) => { setRows(d.customers ?? []); setTotal(d.total ?? 0); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [q, filter, page, size]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const show = async (id: number) => {
    setOpen(true); setSel(null); setErr("");
    // โหลดไม่ขึ้นต้องเด้ง toast ด้วย — แถบ error อยู่บนสุดของหน้า เลื่อนลงมาแล้วจะไม่เห็น
    try { setSel(await apiFetch(`/api/om/customers/${id}`)); }
    catch (e) { const m = e instanceof Error ? e.message : String(e); setErr(m); say(`เปิดข้อมูลลูกค้าไม่ได้: ${m}`); setOpen(false); }
  };
  const reload = async () => { load(); if (sel) show(sel.customer.id); };

  const call = async (method: string, path: string, body?: object, okMsg?: string) => {
    setBusy(true); setErr("");
    try {
      const d = await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined });
      if (okMsg) say(okMsg);
      return d;
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); return null; }
    finally { setBusy(false); }
  };

  const saveBasic = async () => {
    if (!sel) return;
    const c = sel.customer;
    const d = await call("PATCH", `/api/om/customers/${c.id}`, {
      title: c.title, first_name: c.first_name, last_name: c.last_name, id_card: c.id_card,
    }, "บันทึกแล้ว");
    if (d) reload();
  };
  const del = async () => {
    if (!sel) return;
    // ★ เดิมกดแล้วลบ/ซ่อนทันทีไม่ถามก่อน — ลบถาวรย้อนไม่ได้ ต้องยืนยันด้วย dialog กลาง (กติกา ui-rules)
    const name = sel.customer.full_name || "ลูกค้าคนนี้";
    const ok = await dialog.confirm(locked
      ? { title: "ซ่อนลูกค้า", message: `ซ่อน "${name}"?\n\nมีประวัติผูกอยู่ ระบบจะซ่อนแทนการลบ — กู้คืนได้จากแท็บ "ที่ซ่อนไว้"`,
          variant: "warning", confirmText: "ซ่อน" }
      : { title: "ลบลูกค้าถาวร", message: `ลบ "${name}" ถาวร?\n\nไม่มีประวัติผูก ลบแล้วกู้คืนไม่ได้`,
          variant: "danger", confirmText: "ลบถาวร" });
    if (!ok) return;
    const d = await call("DELETE", `/api/om/customers/${sel.customer.id}`);
    if (d) { say(d.mode === "hard" ? "ลบถาวรแล้ว (ไม่มีประวัติผูก)" : "ซ่อนแล้ว (มีประวัติผูก) — กู้คืนได้"); setOpen(false); load(); }
  };
  const restore = async () => {
    if (!sel) return;
    const d = await call("PATCH", `/api/om/customers/${sel.customer.id}`, { restore: true }, "กู้คืนแล้ว");
    if (d) reload();
  };

  const upd = (patch: Partial<Detail["customer"]>) =>
    setSel((s) => (s ? { ...s, customer: { ...s.customer, ...patch } } : s));

  const locked = sel ? sel.washes > 0 || sel.active_bookings > 0 : false;

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

      {/* ไม่มีแถวเครื่องมือแบบหน้าบ้าน — ที่นั่นมีไว้วาง dropdown โครงการ · ตรงนี้จะเหลือแค่เลขซ้ำกับ tabsLeft */}
      <div className="p-3 md:p-4 flex flex-col gap-3">
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

      {/* ★ 24 ก.ย. 69: เดิมเป็น drawer ขวา — ผู้ใช้สั่งให้เป็น modal กลางจอแบบเดียวกับการ์ดอื่น (ModalBase) */}
      {open && (
        <ModalBase
          size="xl"
          onClose={() => setOpen(false)}
          title={
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </span>
              <span className="truncate">{sel ? (sel.customer.full_name || "— ไม่มีชื่อ —") : "กำลังโหลด…"}</span>
              {sel && <span className="text-xxs font-bold px-2 rounded-full bg-gray-100 text-gray-500 shrink-0">id {sel.customer.id}</span>}
            </div>
          }
          footer={sel && (
            <div className="flex gap-2 flex-wrap">
              {sel.customer.is_active && (
                <button type="button" style={{ minHeight: 0 }} disabled={busy} onClick={del}
                  title={locked ? "มีประวัติผูก → ระบบจะซ่อนแทน" : "ไม่มีประวัติ → ลบจริง"}
                  className="py-3 px-4 rounded-xl border border-red-200 text-sm font-semibold text-red-600 bg-white disabled:opacity-50 cursor-pointer">
                  {locked ? "ซ่อนลูกค้า" : "ลบถาวร"}</button>
              )}
              <button type="button" style={{ minHeight: 0 }} onClick={() => setOpen(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white cursor-pointer">ปิด</button>
              <button type="button" style={{ minHeight: 0 }} disabled={busy} onClick={saveBasic}
                className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 active:bg-primary-dark transition-colors cursor-pointer">
                {busy ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</button>
            </div>
          )}
        >
            {!sel ? <Loading /> : (
              // แถวข้างในใช้ px-5 ของตัวเองอยู่แล้ว — หักระยะขอบของ body ModalBase ออก
              <div className="-mx-5 -my-4">
                {err && <div className="mx-5 mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{err}</div>}
                {!sel.customer.is_active && (
                  <div className="mx-5 mt-3 border-l-3 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-800 font-semibold rounded-r-lg">
                    ถูกซ่อนอยู่ — ไม่โผล่ในค้นหา/LIFF
                    <button type="button" style={{ minHeight: 0 }} onClick={restore}
                      className="ml-2 h-7 px-3 rounded-lg border border-amber-300 text-xs font-bold cursor-pointer">กู้คืน</button>
                  </div>
                )}
                <div className="grid gap-3 p-5 sm:grid-cols-2">
                  <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">คำนำหน้า</span>
                    <select value={sel.customer.title ?? ""} onChange={(e) => upd({ title: e.target.value || null })}
                      className="h-9 rounded-lg border border-gray-200 px-2 text-sm font-semibold outline-none focus:border-primary">
                      <option value="">ไม่ระบุ</option>{["นาย", "นาง", "นางสาว", "คุณ", "ดร."].map((t) => <option key={t}>{t}</option>)}
                    </select></label>
                  <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">เลขบัตร ปชช.</span>
                    <input value={sel.customer.id_card ?? ""} onChange={(e) => upd({ id_card: e.target.value })}
                      className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary" /></label>
                  <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">ชื่อ</span>
                    <input value={sel.customer.first_name ?? ""} onChange={(e) => upd({ first_name: e.target.value })}
                      className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary" /></label>
                  <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">นามสกุล</span>
                    <input value={sel.customer.last_name ?? ""} onChange={(e) => upd({ last_name: e.target.value })}
                      className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary" /></label>
                </div>

                <SecHead t={`เบอร์โทร (${sel.phones.length})`}
                  action={<AddPhone busy={busy} onAdd={async (p) => { if (await call("POST", `/api/om/customers/${sel.customer.id}/phones`, { phone: p }, "เพิ่มเบอร์แล้ว")) reload(); }} />} />
                {sel.phones.length === 0 && <div className="px-5 py-2 text-xs font-semibold text-amber-600">⚠ ไม่มีเบอร์ — ยืนยันตัวตน LINE ไม่ได้</div>}
                {sel.phones.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 text-sm">
                    <b>{p.phone}</b>
                    {p.is_primary ? <span className="text-xxs font-bold px-2 rounded-full bg-emerald-50 text-emerald-700">เบอร์หลัก</span>
                      : <button type="button" style={{ minHeight: 0 }} disabled={busy}
                          onClick={async () => { if (await call("PATCH", `/api/om/customers/${sel.customer.id}/phones`, { phone: p.phone }, "ตั้งเป็นเบอร์หลักแล้ว")) reload(); }}
                          className="h-7 px-2.5 rounded-lg border border-gray-200 text-xxs font-bold text-gray-600 cursor-pointer">ตั้งเป็นหลัก</button>}
                    <button type="button" style={{ minHeight: 0 }} disabled={busy}
                      onClick={async () => { if (await call("DELETE", `/api/om/customers/${sel.customer.id}/phones`, { phone: p.phone }, "ลบเบอร์แล้ว")) reload(); }}
                      className="ml-auto h-7 px-2.5 rounded-lg border border-red-200 text-xxs font-bold text-red-600 cursor-pointer">ลบ</button>
                  </div>
                ))}

                <SecHead t={`บ้านที่ผูก (${sel.houses.length})`} />
                {sel.houses.map((h) => (
                  <div key={h.link_id} className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 text-sm">
                    <div className="flex-1 min-w-0">
                      <b>{h.house_number || "—"}</b>
                      <div className="text-xxs font-medium text-gray-500 truncate">{h.project_name || "—"}</div>
                    </div>
                    <span className={`text-xxs font-bold px-2 rounded-full ${h.role === "owner" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                      {ROLE[h.role] ?? h.role}</span>
                    <button type="button" style={{ minHeight: 0 }} disabled={busy}
                      onClick={async () => { if (await call("DELETE", `/api/om/customers/${sel.customer.id}/houses`, { link_id: h.link_id }, "ถอดแล้ว (ประวัติยังอยู่)")) reload(); }}
                      className="h-7 px-2.5 rounded-lg border border-red-200 text-xxs font-bold text-red-600 cursor-pointer">ถอด</button>
                  </div>
                ))}

                <SecHead t="ประวัติการแก้ไข" />
                {sel.history.length === 0 && <div className="px-5 py-2 text-xs text-gray-400">ยังไม่มีการแก้ไข</div>}
                {sel.history.map((h, i) => (
                  <div key={i} className="flex gap-2.5 px-5 py-1.5 border-b border-gray-100 text-xxs text-gray-500">
                    <b className="text-gray-700 min-w-[74px]">{ACT[h.action] ?? h.action}</b>
                    <span className="flex-1">{h.reason || (h.to_json ? JSON.parse(h.to_json).full_name ?? "" : "")}</span>
                    <span>{h.created_at?.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            )}
        </ModalBase>
      )}

      {toast && (
        <div className="fixed left-1/2 bottom-7 -translate-x-1/2 z-[90] bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
          {toast}</div>
      )}
    </div>
  );
}

function SecHead({ t, action }: { t: string; action?: React.ReactNode }) {
  return (
    <div className="px-5 py-2 border-t border-gray-200 border-b border-b-gray-100 bg-gray-50 flex items-center gap-2">
      <b className="text-xs font-bold">{t}</b><span className="ml-auto">{action}</span>
    </div>
  );
}

function AddPhone({ onAdd, busy }: { onAdd: (p: string) => void; busy: boolean }) {
  const [v, setV] = useState("");
  return (
    <span className="flex gap-1.5">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="08xxxxxxxx"
        className="h-8 w-36 rounded-lg border border-gray-200 px-2 text-xs font-semibold outline-none focus:border-primary" />
      <button type="button" style={{ minHeight: 0 }} disabled={busy || !v}
        onClick={() => { onAdd(v); setV(""); }}
        className="h-8 px-3 rounded-lg bg-primary text-white text-xxs font-bold cursor-pointer disabled:opacity-40">เพิ่ม</button>
    </span>
  );
}
