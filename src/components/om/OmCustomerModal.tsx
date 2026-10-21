"use client";

// modal ข้อมูลลูกค้า O&M 1 คน — ชื่อ · เบอร์ · บ้านที่ผูก · ประวัติแก้ไข
// ★ 2 ต.ค. 69 แยกออกจาก /om/customers ให้หน้ารายละเอียดงานบริการใช้ตัวเดียวกัน
//   (กด avatar หัวหน้างานแล้วเปิดข้อมูลลูกค้า แบบหน้า lead เปิด ProfileModal)
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import ModalBase from "@/components/ui/ModalBase";
import { useDialog } from "@/components/ui/Dialog";

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
  merge: "รวมรายชื่อซ้ำ", link_house: "เชื่อมโยงบ้าน", unlink_house: "ยกเลิกการเชื่อมโยงบ้าน", phone_add: "เพิ่มเบอร์", phone_del: "ลบเบอร์", lead_sync: "ดึงจากระบบขาย",
};

export default function OmCustomerModal({ customerId, canDelete = true, onClose, onChanged, onToast }: {
  customerId: number;
  /** ปุ่มซ่อน/ลบลูกค้า — งานทะเบียน ไม่ใช่งานหน้างานบริการ (เปิดจาก avatar ซ่อนปุ่ม กันกดพลาด · 2 ต.ค. 69) */
  canDelete?: boolean;
  onClose: () => void;
  /** หลังแก้ไข/ลบ/กู้คืนสำเร็จ — ให้หน้าที่เปิดโหลดข้อมูลของตัวเองใหม่ */
  onChanged?: () => void;
  /** ข้อความสั้นหลังทำรายการ (toast ของหน้าที่เปิด) */
  onToast?: (m: string) => void;
}) {
  const dialog = useDialog();
  const [sel, setSel] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const say = (m: string) => onToast?.(m);

  const load = async () => {
    // โหลดไม่ขึ้นต้องเด้ง toast แล้วปิด — แถบ error ใน modal ยังไม่ขึ้นตอนกำลังโหลด
    try { setSel(await apiFetch(`/api/om/customers/${customerId}`)); }
    catch (e) { const m = e instanceof Error ? e.message : String(e); say(`ไม่สามารถเปิดข้อมูลลูกค้าได้: ${m}`); onClose(); }
  };
  useEffect(() => { load(); }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = () => { onChanged?.(); load(); };

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
    const name = sel.customer.full_name || "ลูกค้ารายนี้";
    const ok = await dialog.confirm(locked
      ? { title: "ซ่อนลูกค้า", message: `ต้องการซ่อน "${name}" หรือไม่\n\nลูกค้ารายนี้มีประวัติการใช้บริการ ระบบจะซ่อนแทนการลบ — กู้คืนได้จากแท็บ "ที่ซ่อนไว้"`,
          variant: "warning", confirmText: "ซ่อน" }
      : { title: "ลบลูกค้าถาวร", message: `ต้องการลบ "${name}" ถาวรหรือไม่\n\nลูกค้ารายนี้ไม่มีประวัติการใช้บริการ ลบแล้วกู้คืนไม่ได้`,
          variant: "danger", confirmText: "ลบถาวร" });
    if (!ok) return;
    const d = await call("DELETE", `/api/om/customers/${sel.customer.id}`);
    if (d) { say(d.mode === "hard" ? "ลบถาวรแล้ว" : "ซ่อนแล้ว — กู้คืนได้จากแท็บ \"ที่ซ่อนไว้\""); onChanged?.(); onClose(); }
  };
  const restore = async () => {
    if (!sel) return;
    const d = await call("PATCH", `/api/om/customers/${sel.customer.id}`, { restore: true }, "กู้คืนแล้ว");
    if (d) reload();
  };

  const upd = (patch: Partial<Detail["customer"]>) =>
    setSel((s) => (s ? { ...s, customer: { ...s.customer, ...patch } } : s));

  const locked = sel ? sel.washes > 0 || sel.active_bookings > 0 : false;

  // ★ 24 ก.ย. 69: เดิมเป็น drawer ขวา — ผู้ใช้สั่งให้เป็น modal กลางจอแบบเดียวกับการ์ดอื่น (ModalBase)
  return (
    <ModalBase
      size="xl"
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </span>
          <span className="truncate">{sel ? (sel.customer.full_name || "— ไม่มีชื่อ —") : "กำลังโหลด…"}</span>
          {sel && <span className="text-xxs font-bold px-2 rounded-full bg-gray-100 text-gray-500 shrink-0">รหัส {sel.customer.id}</span>}
        </div>
      }
      footer={sel && (
        <div className="flex gap-2 flex-wrap">
          {canDelete && sel.customer.is_active && (
            <button type="button" style={{ minHeight: 0 }} disabled={busy} onClick={del}
              title={locked ? "มีประวัติการใช้บริการ ระบบจะซ่อนแทนการลบ" : "ไม่มีประวัติการใช้บริการ ลบได้ถาวร"}
              className="py-3 px-4 rounded-xl border border-red-200 text-sm font-semibold text-red-600 bg-white disabled:opacity-50 cursor-pointer">
              {locked ? "ซ่อนลูกค้า" : "ลบถาวร"}</button>
          )}
          <button type="button" style={{ minHeight: 0 }} onClick={onClose}
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
                ซ่อนอยู่ — ไม่แสดงในผลค้นหาและหน้า LINE ของลูกค้า
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
              <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">เลขบัตรประชาชน</span>
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
            {sel.phones.length === 0 && <div className="px-5 py-2 text-xs font-semibold text-amber-600">⚠ ไม่มีเบอร์โทร — ลูกค้ายืนยันตัวตนผ่าน LINE ไม่ได้</div>}
            {sel.phones.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 text-sm">
                <b>{p.phone}</b>
                {p.is_primary ? <span className="text-xxs font-bold px-2 rounded-full bg-emerald-50 text-emerald-700">เบอร์หลัก</span>
                  : <button type="button" style={{ minHeight: 0 }} disabled={busy}
                      onClick={async () => { if (await call("PATCH", `/api/om/customers/${sel.customer.id}/phones`, { phone: p.phone }, "ตั้งเป็นเบอร์หลักแล้ว")) reload(); }}
                      className="h-7 px-2.5 rounded-lg border border-gray-200 text-xxs font-bold text-gray-600 cursor-pointer">ตั้งเป็นเบอร์หลัก</button>}
                <button type="button" style={{ minHeight: 0 }} disabled={busy}
                  onClick={async () => { if (await call("DELETE", `/api/om/customers/${sel.customer.id}/phones`, { phone: p.phone }, "ลบเบอร์แล้ว")) reload(); }}
                  className="ml-auto h-7 px-2.5 rounded-lg border border-red-200 text-xxs font-bold text-red-600 cursor-pointer">ลบ</button>
              </div>
            ))}

            <SecHead t={`บ้านที่เชื่อมโยง (${sel.houses.length})`} />
            {sel.houses.map((h) => (
              <div key={h.link_id} className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 text-sm">
                <div className="flex-1 min-w-0">
                  <b>{h.house_number || "—"}</b>
                  <div className="text-xxs font-medium text-gray-500 truncate">{h.project_name || "—"}</div>
                </div>
                <span className={`text-xxs font-bold px-2 rounded-full ${h.role === "owner" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {ROLE[h.role] ?? h.role}</span>
                <button type="button" style={{ minHeight: 0 }} disabled={busy}
                  onClick={async () => { if (await call("DELETE", `/api/om/customers/${sel.customer.id}/houses`, { link_id: h.link_id }, "ยกเลิกการเชื่อมโยงแล้ว (ประวัติยังอยู่)")) reload(); }}
                  className="h-7 px-2.5 rounded-lg border border-red-200 text-xxs font-bold text-red-600 cursor-pointer">ยกเลิกการเชื่อมโยง</button>
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
