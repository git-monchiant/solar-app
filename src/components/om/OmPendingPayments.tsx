"use client";

// ค่าบริการงาน O&M ที่รอ Account ยืนยัน — แสดงในหน้า /report/pending คิวเดียวกับฝั่งขาย
// (แผน docs/plan/20260924-02 เฟส 4 · ผู้ใช้เคาะ 24 ก.ย. "Account เหมือนฝั่งขาย" + คิวเดียว ติดป้าย O&M)
// ★ หน้าตาแถวยกจากแถวของฝั่งขายในหน้าเดียวกัน (รูปสลิป · ชื่อ · รายการ · ยอด · ปุ่ม)
// ★ ต่างจากฝั่งขายตรงที่ยืนยัน/ปฏิเสธในคิวได้เลย — ของขายพาไปกดใน PaymentSection บนหน้า lead
//   แต่ Account เข้าโมดูล O&M ไม่ได้ และหน้า lead ของงาน O&M ไม่มีช่องรับเงินนี้
// ★ ปุ่มพาไปหน้างาน O&M มีให้ admin เท่านั้น (Account ไม่มีสิทธิ์โมดูล O&M)

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useDialog } from "@/components/ui/Dialog";
import FallbackImage from "@/components/ui/FallbackImage";
import { formatTHB } from "@/lib/utils/formatters";
import { hasRole, useActiveRoles } from "@/lib/roles";

export type OmPendingPayment = {
  id: number; lead_id: number; amount: number; description: string | null; payment_method: string | null;
  submitted_at: string | null; submitted_by_name: string | null;
  quotation_id: number; quotation_doc_no: string; package_name_snapshot: string | null;
  booking_id: number; house_id: number; house_number: string | null; project_name: string | null;
  customer_name: string; phone: string | null; slip_urls: string[];
};

const METHOD: Record<string, string> = { transfer: "โอน / QR", cash: "เงินสด", other: "อื่น ๆ" };
const fmt = (n: number) => formatTHB(Math.round(n));

export default function OmPendingPayments({ items, focusedId, onChanged }: {
  items: OmPendingPayment[];
  focusedId: number | null;
  onChanged: () => void;
}) {
  const dialog = useDialog();
  const { activeRoles } = useActiveRoles();
  const isAdmin = hasRole(activeRoles, "admin");
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [rejecting, setRejecting] = useState<OmPendingPayment | null>(null);
  const [reason, setReason] = useState("");

  if (items.length === 0) return null;

  const act = async (it: OmPendingPayment, action: "confirm" | "reject", why = "") => {
    if (action === "confirm") {
      const ok = await dialog.confirm({
        title: "ยืนยันรับเงินค่าบริการ O&M", confirmText: "ยืนยันรับเงิน", variant: "success",
        message: `${it.customer_name} · ${it.quotation_doc_no} · ${fmt(it.amount)} บาท\nยืนยันแล้วระบบเติมสิทธิ์ที่ลูกค้าซื้อให้บ้าน และ Sale โทรนัดได้`,
      });
      if (!ok) return;
    }
    setBusy(it.id); setErr("");
    try {
      await apiFetch(`/api/om/payments/${it.id}`, { method: "POST", body: JSON.stringify({ action, reason: why }) });
      setRejecting(null); setReason("");
      onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1 pt-2">
        <span className="rounded-md bg-pink-50 px-2 py-0.5 text-xxs font-semibold text-pink-700">งานบริการ O&amp;M</span>
        <span className="text-xs text-gray-500">ค่าบริการรอยืนยัน {items.length} รายการ</span>
      </div>
      {err && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
      <div className="space-y-2 md:space-y-0 md:bg-white md:rounded-xl md:border md:border-gray-300 md:divide-y md:divide-gray-100">
        {items.map((it) => {
          const label = `ค่าบริการ O&M · ${it.package_name_snapshot || "งานบริการตามใบเสนอราคา"}`;
          const gallery = it.slip_urls.map((u, k) => ({ url: u, label: it.slip_urls.length > 1 ? `${label} · สลิป ${k + 1} / ${it.slip_urls.length}` : label }));
          const where = [it.house_number ? `บ้าน ${it.house_number}` : null, it.project_name].filter(Boolean).join(" · ");
          const actions = (cls = "") => (
            <div className={`flex gap-2 ${cls}`}>
              <button type="button" disabled={busy === it.id} onClick={() => { setReason(""); setRejecting(it); }}
                className="h-8 px-3 rounded-lg text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 flex-1 md:flex-none">ปฏิเสธ</button>
              <button type="button" disabled={busy === it.id} onClick={() => act(it, "confirm")}
                className="h-8 px-3 rounded-lg text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 flex-1 md:flex-none">
                {busy === it.id ? "กำลังบันทึก…" : "ยืนยันรับเงิน"}</button>
            </div>
          );
          const name = isAdmin
            ? <a href={`/om/services/${it.house_id}`} className="font-semibold text-gray-900 hover:text-primary">{it.customer_name}</a>
            : <span className="font-semibold text-gray-900">{it.customer_name}</span>;
          return (
            <div key={it.id} id={`pending-payment-${it.id}`}
              className={focusedId === it.id ? "rounded-xl ring-2 ring-primary ring-offset-2" : ""}>
              {/* Mobile card — ผังเดียวกับแถวฝั่งขาย */}
              <div className="md:hidden bg-white rounded-xl border border-gray-300 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{name}</div>
                    <div className="text-[11px] text-gray-400 font-mono truncate">{it.quotation_doc_no}{where ? ` · ${where}` : ""}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-bold font-mono tabular-nums text-amber-600 leading-none">{fmt(it.amount)}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">บาท</div>
                  </div>
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-gray-800">{label}</span>
                  <span className="text-gray-500"> · {METHOD[it.payment_method ?? ""] ?? it.payment_method} · แนบโดย {it.submitted_by_name ?? "—"}</span>
                </div>
                {it.slip_urls.length > 0 && (
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
                    {it.slip_urls.map((url, idx) => (
                      <FallbackImage key={url} src={url} alt="" className="w-14 h-14 object-cover rounded border border-gray-200 shrink-0"
                        gallery={gallery} galleryIndex={idx} />
                    ))}
                  </div>
                )}
                {actions("w-full")}
              </div>

              {/* Desktop row */}
              <div className="hidden md:flex items-center gap-4 p-4">
                <div className="flex items-center gap-1 shrink-0">
                  {it.slip_urls.slice(0, 3).map((url, idx) => (
                    <FallbackImage key={url} src={url} alt="" className="w-12 h-12 object-cover rounded border border-gray-200"
                      gallery={gallery} galleryIndex={idx} />
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {name}
                    <span className="text-xs font-mono text-gray-400">{it.quotation_doc_no}</span>
                    {where && <span className="text-xs text-gray-500">· {where}</span>}
                    <span className="rounded bg-pink-50 px-1.5 py-0.5 text-[10px] font-bold text-pink-700">O&amp;M</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    <span className="font-semibold text-gray-700">{label}</span>
                    <span> · {METHOD[it.payment_method ?? ""] ?? it.payment_method} · แนบโดย {it.submitted_by_name ?? "—"}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold font-mono tabular-nums text-amber-600">{fmt(it.amount)}</div>
                  <div className="text-xs text-gray-400">บาท</div>
                </div>
                {actions()}
              </div>
            </div>
          );
        })}
      </div>

      {/* ปฏิเสธต้องมีเหตุผล — กล่องเดียวกับหน้าคิวอนุมัติใบเสนอราคา */}
      {rejecting && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onClick={() => busy !== rejecting.id && setRejecting(null)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-xl">
            <h3 className="text-base font-bold text-gray-900">ปฏิเสธสลิปค่าบริการ O&amp;M</h3>
            <p className="mt-1 text-xs text-gray-600">
              {rejecting.customer_name} · {rejecting.quotation_doc_no} — สลิปนี้จะถูกเอาออกจากคิว Sale ต้องแนบใหม่ กรุณาระบุเหตุผล
            </p>
            <label className="mt-4 mb-1 block text-xs font-semibold text-gray-700">เหตุผล <span className="text-red-500">*</span></label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={300} autoFocus
              placeholder="เช่น ยอดในสลิปไม่ตรง / สลิปไม่ชัด / ยังไม่พบเงินเข้าบัญชี"
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none" />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setRejecting(null)} disabled={busy === rejecting.id}
                className="h-8 rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">ยกเลิก</button>
              <button type="button" onClick={() => act(rejecting, "reject", reason.trim())} disabled={!reason.trim() || busy === rejecting.id}
                className="h-8 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40">
                {busy === rejecting.id ? "กำลังส่ง…" : "ยืนยันปฏิเสธ"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
