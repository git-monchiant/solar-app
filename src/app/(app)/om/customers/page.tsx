"use client";

// ลูกค้า O&M — ตารางบน desktop / การ์ดบนมือถือ + drawer แก้ไข (mockup 20260901_01 เคาะ 1 ก.ย.)
// สิทธิ์ล้างไม่แสดงหน้านี้ — อยู่หน้าบ้าน/ระบบติดตั้ง (ผู้ใช้สั่งกันสับสน)
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";

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
const FILTERS = [
  { k: "nophone", t: "ไม่มีเบอร์" }, { k: "bad", t: "ชื่อน่าสงสัย" },
  { k: "line", t: "ผูก LINE" }, { k: "multi", t: "หลายบ้าน" }, { k: "hidden", t: "ที่ซ่อนไว้" },
];

export default function OmCustomersPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Detail | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  const load = useCallback(() => {
    const u = new URLSearchParams({ q, filter, page: String(page) });
    apiFetch(`/api/om/customers?${u}`)
      .then((d) => { setRows(d.customers ?? []); setTotal(d.total ?? 0); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [q, filter, page]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const show = async (id: number) => {
    setOpen(true); setSel(null);
    try { setSel(await apiFetch(`/api/om/customers/${id}`)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setOpen(false); }
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

  return (
    <div className="p-3 md:p-5 flex flex-col gap-3">
      {err && <div className="border border-red-200 bg-red-50 p-3 rounded-xl text-sm font-semibold text-red-700">{err}</div>}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {/* แถบค้นหา + กรอง */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2 flex-wrap">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="ค้นหา ชื่อ · เบอร์ · บ้านเลขที่ · โครงการ"
            className="h-9 w-full max-w-sm rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary" />
          {FILTERS.map((f) => (
            <button key={f.k} type="button" style={{ minHeight: 0 }}
              onClick={() => { setFilter(filter === f.k ? "" : f.k); setPage(1); }}
              className={`px-3 py-0.5 rounded-full border text-xs font-semibold cursor-pointer ${
                filter === f.k ? "bg-active-light border-active text-active" : "border-gray-200 text-gray-500"}`}>
              {f.t}
            </button>
          ))}
        </div>

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
                      <td className="px-4 py-2 border-b border-gray-100 text-right">
                        <button type="button" style={{ minHeight: 0 }}
                          onClick={(e) => { e.stopPropagation(); show(c.id); }}
                          className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer">แก้ไข</button>
                      </td>
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
                  <button type="button" style={{ minHeight: 0 }} onClick={(e) => { e.stopPropagation(); show(c.id); }}
                    className="h-10 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 shrink-0">แก้ไข</button>
                </div>
              ))}
            </div>

            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center gap-3 flex-wrap text-xs text-gray-500">
              <span>ทั้งหมด {total.toLocaleString()} คน · หน้า {page}</span>
              <span className="ml-auto flex gap-1">
                <button type="button" style={{ minHeight: 0 }} disabled={page <= 1} onClick={() => setPage(page - 1)}
                  className="w-9 h-9 rounded-lg border border-gray-200 bg-white cursor-pointer disabled:opacity-40">‹</button>
                <button type="button" style={{ minHeight: 0 }} disabled={page * 30 >= total} onClick={() => setPage(page + 1)}
                  className="w-9 h-9 rounded-lg border border-gray-200 bg-white cursor-pointer disabled:opacity-40">›</button>
              </span>
            </div>
          </>
        )}
      </div>

      {/* drawer แก้ไข — desktop ขวา / mobile bottom sheet */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/35" onClick={() => setOpen(false)} />
          <div className="fixed z-50 bg-white flex flex-col md:top-0 md:right-0 md:bottom-0 md:w-[500px]
                          max-md:inset-x-0 max-md:bottom-0 max-md:h-[88vh] max-md:rounded-t-2xl">
            <div className="px-5 py-3.5 border-b border-gray-200 flex items-center gap-2">
              <b className="text-base font-bold">แก้ไขลูกค้า{sel ? ` · id ${sel.customer.id}` : ""}</b>
              <button type="button" style={{ minHeight: 0 }} onClick={() => setOpen(false)}
                className="ml-auto text-lg text-gray-400 cursor-pointer">×</button>
            </div>

            {!sel ? <Loading /> : (
              <div className="flex-1 overflow-y-auto">
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

            {sel && (
              <div className="px-5 py-3 border-t border-gray-200 flex gap-2 flex-wrap">
                <button type="button" style={{ minHeight: 0 }} disabled={busy} onClick={saveBasic}
                  className="h-9 px-5 rounded-lg bg-primary text-white text-sm font-semibold cursor-pointer max-md:flex-1">บันทึกการแก้ไข</button>
                <span className="ml-auto" />
                {sel.customer.is_active && (
                  <button type="button" style={{ minHeight: 0 }} disabled={busy} onClick={del}
                    title={locked ? "มีประวัติผูก → ระบบจะซ่อนแทน" : "ไม่มีประวัติ → ลบจริง"}
                    className="h-9 px-4 rounded-lg border border-red-200 text-sm font-semibold text-red-600 cursor-pointer max-md:flex-1">
                    {locked ? "ซ่อนลูกค้า" : "ลบถาวร"}</button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {toast && (
        <div className="fixed left-1/2 bottom-7 -translate-x-1/2 z-[60] bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
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
