"use client";

// ขั้น 03 ชำระเงิน ของหน้ารายละเอียดงานบริการ (แผน docs/plan/20260924-02 เฟส 4)
// ★ Sale แนบสลิปของลูกค้า → เข้าคิว "รอยืนยันรับเงิน" ของ Account (คิวเดียวกับฝั่งขาย ติดป้าย O&M)
//   Account ยืนยันแล้วระบบเติมสิทธิ์ที่ซื้อให้บ้าน แล้ว Sale โทรตกลงนัดได้ (เก็บค่าบริการก่อนนัดหมาย)
// ★ ไม่ใช้ PaymentSection ของฝั่งขาย — ตัวนั้นเขียน pay token / ใบแจ้งหนี้ / สถานะลงตัว lead
//   บ้านที่ใช้ lead ร่วมกับฝั่งขายจะเสียลิงก์จ่ายเงินที่ส่งลูกค้าไปแล้ว (ดู /api/om/payments)

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatTHB } from "@/lib/utils/formatters";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { thDT, type Item } from "@/lib/om/service-view";

type Pay = {
  id: number; amount: number; payment_method: string | null; description: string | null;
  submitted_at: string | null; submitted_by_name: string | null;
  confirmed_at: string | null; confirmed_by: string | null; slip_urls: string[];
};

const METHOD: Record<string, string> = { transfer: "โอน / QR", cash: "เงินสด", other: "อื่น ๆ" };
const INPUT = "h-9 rounded-lg border border-gray-200 px-2.5 text-sm outline-none focus:border-primary bg-white";

export default function OmPaymentPanel({ item, skip, onSaved, onReload }: {
  item: Item;
  skip: boolean;
  onSaved: (msg: string) => void;
  onReload?: () => void;
}) {
  const { activeRoles } = useActiveRoles();
  const canSubmit = hasRole(activeRoles, "admin", "sales", "sales_sup");
  const [pays, setPays] = useState<Pay[] | null>(null);
  const [method, setMethod] = useState("transfer");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    if (!item.q_id) return;
    apiFetch(`/api/om/payments?quotation_id=${item.q_id}`).then(setPays).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [item.q_id]);
  useEffect(() => { load(); }, [load]);

  if (skip && !item.q_id) return <div className="text-sm text-gray-600">งานนี้<b>ใช้สิทธิ์ฟรี</b> — ไม่มีค่าบริการ</div>;
  if (!item.q_id) return <div className="text-sm text-gray-500">ยังไม่มีใบเสนอราคา — ออกใบที่ขั้น 02 ก่อน</div>;
  if (item.job_status === "quote") {
    return (
      <div className="text-sm text-gray-600 leading-relaxed">
        รอใบเสนอราคา <b className="font-mono">{item.q_doc_no}</b> อนุมัติครบ แล้วกด <b>&ldquo;ส่งใบให้ลูกค้าแล้ว&rdquo;</b> ที่ขั้น 02 ก่อน
        <div className="mt-1 text-xs text-gray-400">เก็บค่าบริการเต็มจำนวนก่อนนัดหมาย</div>
      </div>
    );
  }
  if (pays === null) return <div className="text-sm text-gray-400">กำลังโหลด…</div>;

  const total = Number(item.q_total || 0);
  const current = pays[0];
  const submit = async () => {
    setBusy(true); setErr("");
    const fd = new FormData();
    fd.set("quotation_id", String(item.q_id)); fd.set("amount", String(total));
    fd.set("method", method); fd.set("note", note);
    for (const f of files) fd.append("files", f);
    try {
      await apiFetch("/api/om/payments", { method: "POST", body: fd });
      setFiles([]); setNote("");
      onSaved("แนบสลิปแล้ว — รอ Account ยืนยันรับเงิน"); load(); onReload?.();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap mb-3">
        <span className="text-sm text-gray-600">ค่าบริการตามใบ <b className="font-mono">{item.q_doc_no}</b></span>
        <span className="ml-auto text-lg font-bold tabular-nums">{formatTHB(total)} บาท</span>
      </div>

      {current ? (
        <div className={`rounded-xl border px-3.5 py-3 ${current.confirmed_at ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50"}`}>
          <div className={`text-sm font-bold ${current.confirmed_at ? "text-emerald-800" : "text-amber-800"}`}>
            {current.confirmed_at ? "✓ Account ยืนยันรับเงินแล้ว" : "รอ Account ยืนยันรับเงิน"}
          </div>
          <div className="mt-0.5 text-xs text-gray-600">
            {METHOD[current.payment_method ?? ""] ?? current.payment_method} · แนบโดย {current.submitted_by_name ?? "—"} · {thDT(current.submitted_at)}
            {current.confirmed_at && <> · ยืนยันโดย {current.confirmed_by ?? "—"} · {thDT(current.confirmed_at)}</>}
          </div>
          {current.slip_urls.length > 0 && (
            <div className="mt-2 flex gap-2 flex-wrap">
              {current.slip_urls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer"
                  className="block w-16 h-16 rounded-lg border border-gray-200 bg-white overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="สลิป" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
          {current.confirmed_at && (
            <div className="mt-2 text-xs text-emerald-800 leading-relaxed">
              เติมสิทธิ์ที่ซื้อให้บ้านแล้ว · ขั้นถัดไป <b>โทรตกลงนัด</b> ที่ขั้น 01 (บันทึกการโทร &ldquo;รับสาย · ตกลงนัด&rdquo;)
            </div>
          )}
        </div>
      ) : !canSubmit ? (
        <div className="text-sm text-gray-600">รอ Sale แนบสลิปค่าบริการ</div>
      ) : (
        <div>
          <div className="text-xs text-gray-500 mb-2">
            แนบสลิปหรือรูปหลักฐานรับเงินของลูกค้า (สูงสุด 5 รูป) — ส่งเข้าคิว &ldquo;รอยืนยันรับเงิน&rdquo; ของ Account
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-xs font-bold text-gray-600">วิธีชำระ</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={INPUT}>
                {Object.entries(METHOD).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-bold text-gray-600">ยอดเงิน</span>
              <input value={`${formatTHB(total)} บาท (เต็มจำนวน)`} readOnly className={`${INPUT} bg-gray-50 text-gray-600`} />
            </label>
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-xs font-bold text-gray-600">สลิป / หลักฐาน <span className="text-danger">*</span></span>
              <input type="file" accept="image/*,application/pdf" multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))}
                className="text-sm file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border-0 file:bg-gray-100 file:text-sm file:font-semibold" />
              {files.length > 0 && <span className="text-xxs text-gray-500">{files.length} ไฟล์</span>}
            </label>
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-xs font-bold text-gray-600">โน้ต</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น โอนจากบัญชีภรรยา" className={INPUT} />
            </label>
          </div>
          {err && <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
          <button type="button" disabled={busy || files.length === 0} onClick={submit} style={{ minHeight: 0 }}
            className="mt-3 h-9 px-5 rounded-xl bg-primary text-white text-sm font-bold cursor-pointer disabled:opacity-50">
            {busy ? "กำลังส่ง…" : "ส่งให้ Account ยืนยัน"}</button>
        </div>
      )}
    </div>
  );
}
