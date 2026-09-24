"use client";

// ขั้น 02 เสนอราคา ของหน้ารายละเอียดงานบริการ (แผน docs/plan/20260924-02 เฟส 2)
// ★ ใบอยู่ตาราง quotations ของฝั่งขาย (ผูก om_booking_id) — ฟอร์มนี้เล็กกว่า QuotationBuilder ของฝั่งขายมาก
//   เพราะงาน O&M มีแค่ Package O&M 1 ตัว + รายการเพิ่ม + ส่วนลด ไม่มีชุด 1–3 / อุปกรณ์ / งวดหลายงวด
//   ยอดเงินคิดที่ server ด้วย calculateQuotation ตัวเดียวกับฝั่งขาย — ตัวเลขในฟอร์มเป็นแค่พรีวิว
// ★ ออก/แก้ได้เฉพาะ Sale (ผู้ใช้เคาะ 24 ก.ย. ข้อ 3) · ส่งอนุมัติ Solar Sup → Sale Sup เป็นเฟส 3

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatTHB } from "@/lib/utils/formatters";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { useDialog } from "@/components/ui/Dialog";
import { QUOTE_STATUS, thD, type Item } from "@/lib/om/service-view";

type Pkg = {
  id: number; kw_min: number; kw_max: number; max_panels: number | null;
  plan_type: "per_visit" | "contract"; contract_months: number | null; visits: number | null;
  price: number; scope: string | null;
};
type Line = { item_name: string; quantity: number; unit: string; unit_price: number };
type Quote = {
  id: number; doc_no: string; status: string; om_package_id: number | null;
  package_name_snapshot: string; package_price_snapshot: number; subtotal_incl_vat: number;
  discount_value: number; discount_amount: number; discount_reason: string | null;
  contract_total_incl_vat: number; amount_before_vat: number; vat_amount: number;
  terms_text: string | null; note: string | null; created_at: string; created_by_name: string | null;
  items: { id: number; item_name: string; quantity: number; unit: string | null; unit_price: number; line_total: number }[];
  // ลำดับอนุมัติ (เฟส 3)
  submitted_at: string | null; solar_approved_at: string | null; solar_approved_by_name: string | null;
  approved_at: string | null; approved_by_name: string | null; approval_note: string | null;
  /** ใบล่าสุดของใบงาน — สร้าง Revision ได้เฉพาะจากใบล่าสุด */
  latest_id: number;
};

// เปิด PDF ตรง ๆ (ไม่ใช่ blob) ให้ชื่อไฟล์จาก server ติดไปถึงปุ่มดาวน์โหลด — แบบเดียวกับหน้าคิวอนุมัติ
const openPdf = (id: number) => {
  const uid = typeof window !== "undefined" ? window.localStorage.getItem("userId") : null;
  const url = `/api/quotation-pdf/${id}${uid ? `?user_id=${uid}` : ""}`;
  const tab = window.open(url, "_blank");
  if (tab) tab.opener = null;
  else window.location.href = url;
};

const EDITABLE = ["draft", "changes_required"];
const baht = (n: number) => `${formatTHB(n)} บาท`;
const INPUT = "h-9 rounded-lg border border-gray-200 px-2.5 text-sm outline-none focus:border-primary bg-white";

/** ขนาดระบบรวมของบ้าน — kwp_list มาเป็น "5.00" หรือ "3.00 + 2.00" (บ้านที่ติดตั้งหลายชุด) */
const houseKw = (kwpList: string | null) =>
  (kwpList ?? "").split("+").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x)).reduce((a, b) => a + b, 0);

const planLabel = (p: Pkg) => p.plan_type === "contract"
  ? `สัญญา ${p.contract_months ?? 12} เดือน · เข้า ${p.visits ?? 2} ครั้ง` : "รายครั้ง";

export default function OmQuotationPanel({ item, skip, onSaved, onReload }: {
  item: Item;
  /** งานนี้เส้นฟรี (ใช้สิทธิ์) — ข้ามขั้นเสนอราคา */
  skip: boolean;
  onSaved: (msg: string) => void;
  onReload?: () => void;
}) {
  const { activeRoles } = useActiveRoles();
  const canIssue = hasRole(activeRoles, "admin", "sales", "sales_sup");
  const [loaded, setQuote] = useState<Quote | null>(null);
  // ใบที่โหลดไว้ต้องเป็นใบของใบงานนี้ — กันโชว์ใบเก่าค้างตอนเปลี่ยนบ้าน
  const quote = loaded && loaded.id === item.q_id ? loaded : null;
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");
  const [actErr, setActErr] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useDialog();

  useEffect(() => {
    if (!item.q_id) return;
    apiFetch(`/api/om/quotations/${item.q_id}`).then(setQuote).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [item.q_id]);

  /** ส่งอนุมัติ / สร้าง Revision — ใช้ endpoint ลำดับอนุมัติตัวเดียวกับฝั่งขาย (แยกทาง O&M ข้างในเอง) */
  const act = async (action: "submit" | "revise") => {
    if (!quote) return;
    const ok = await dialog.confirm(action === "submit"
      ? { title: "ส่งใบเสนอราคาขออนุมัติ", confirmText: "ส่งอนุมัติ",
          message: `ส่ง ${quote.doc_no} ให้ Solar Sup ตรวจ แล้วต่อ Sale Sup · ระหว่างรออนุมัติแก้ใบไม่ได้ จนกว่าผู้อนุมัติจะส่งกลับ` }
      : { title: "สร้าง Revision ใหม่", confirmText: "สร้าง Revision",
          message: `คัดลอก ${quote.doc_no} เป็นใบร่างเลขที่ใหม่ แก้แล้วต้องส่งอนุมัติใหม่ทั้งสองขั้น` });
    if (!ok) return;
    setBusy(true); setActErr("");
    try {
      await apiFetch(`/api/quotations/${quote.id}/action`, { method: "POST", body: JSON.stringify({ action }) });
      if (action === "submit") setQuote(await apiFetch(`/api/om/quotations/${quote.id}`));
      onSaved(action === "submit" ? `ส่ง ${quote.doc_no} ให้ Solar Sup อนุมัติแล้ว` : `สร้าง Revision จาก ${quote.doc_no} แล้ว`);
      onReload?.();
    } catch (e) { setActErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  if (skip && !item.q_id) {
    return <div className="text-sm text-gray-600">งานนี้<b>ใช้สิทธิ์ฟรี</b> — ข้ามขั้นเสนอราคา</div>;
  }
  if (err) return <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>;

  if (!item.q_id || editing) {
    if (!canIssue) {
      return (
        <div className="text-sm text-gray-600 leading-relaxed">
          บ้านนี้<b>สิทธิ์หมดแล้ว</b> งานถัดไปต้องมีใบเสนอราคา — <b>รอ Sale ออกใบ</b>
          <div className="mt-1 text-xs text-gray-400">ใบเสนอราคา O&amp;M ออกได้เฉพาะ Sale</div>
        </div>
      );
    }
    return (
      <QuoteForm item={item} quote={editing ? quote : null}
        onCancel={editing ? () => setEditing(false) : undefined}
        onDone={(msg, q) => { setQuote(q); setEditing(false); onSaved(msg); onReload?.(); }} />
    );
  }

  if (!quote) return <div className="text-sm text-gray-400">กำลังโหลดใบเสนอราคา…</div>;
  const st = QUOTE_STATUS[quote.status] ?? { t: quote.status, tone: "bg-gray-100 text-gray-700" };
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <b className="text-sm font-mono tabular-nums">{quote.doc_no}</b>
        <span className={`text-xxs px-2 py-0.5 rounded-full font-bold ${st.tone}`}>{st.t}</span>
        <span className="text-xs text-gray-400">ออกโดย {quote.created_by_name ?? "—"} · {thD(quote.created_at)}</span>
        {canIssue && EDITABLE.includes(quote.status) && (
          <button type="button" style={{ minHeight: 0 }} onClick={() => setEditing(true)}
            className="ml-auto h-8 px-3.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 bg-white cursor-pointer">แก้ใบเสนอราคา</button>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xxs font-bold uppercase tracking-wide text-gray-500">
            <th className="text-left py-1.5">รายการ</th>
            <th className="text-right py-1.5 w-20">จำนวน</th>
            <th className="text-right py-1.5 w-28">ราคา/หน่วย</th>
            <th className="text-right py-1.5 w-28">รวม</th>
          </tr>
        </thead>
        <tbody>
          {Number(quote.package_price_snapshot) > 0 && (
            <tr className="border-b border-gray-100">
              <td className="py-1.5">{quote.package_name_snapshot}</td>
              <td className="py-1.5 text-right tabular-nums">1</td>
              <td className="py-1.5 text-right tabular-nums">{formatTHB(Number(quote.package_price_snapshot))}</td>
              <td className="py-1.5 text-right tabular-nums">{formatTHB(Number(quote.package_price_snapshot))}</td>
            </tr>
          )}
          {quote.items.map((x) => (
            <tr key={x.id} className="border-b border-gray-100">
              <td className="py-1.5">{x.item_name}</td>
              <td className="py-1.5 text-right tabular-nums">{Number(x.quantity)} {x.unit ?? ""}</td>
              <td className="py-1.5 text-right tabular-nums">{formatTHB(Number(x.unit_price))}</td>
              <td className="py-1.5 text-right tabular-nums">{formatTHB(Number(x.line_total))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Totals subtotal={Number(quote.subtotal_incl_vat)} discount={Number(quote.discount_amount)}
        reason={quote.discount_reason} total={Number(quote.contract_total_incl_vat)}
        beforeVat={Number(quote.amount_before_vat)} vat={Number(quote.vat_amount)} />

      <div className="mt-3 text-xs text-gray-500">ชำระเต็มจำนวน<b>ก่อนวันนัดหมาย</b>เข้าให้บริการ</div>
      {quote.note && <div className="mt-1 text-xs text-gray-500">โน้ต: {quote.note}</div>}

      {/* ลำดับอนุมัติ Solar Sup → Sale Sup (เฟส 3) — ชุดเดียวกับฝั่งขาย ผู้อนุมัติกดที่คิว /quotation-approvals */}
      {quote.status === "changes_required" && quote.approval_note && (
        <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700">
          <b>ถูกส่งกลับแก้:</b> {quote.approval_note}
        </div>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Stage label="Solar Sup" at={quote.solar_approved_at} by={quote.solar_approved_by_name}
          waiting={quote.status === "pending_solar_sup"} />
        <Stage label="Sale Sup" at={quote.approved_at} by={quote.approved_by_name}
          waiting={quote.status === "pending_sales_sup" || quote.status === "pending_approval"} />
      </div>
      {quote.status === "approved" && (
        <div className="mt-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-800">
          อนุมัติครบแล้ว — ขั้นถัดไป <b>ส่งใบให้ลูกค้า แล้วรับชำระเงินก่อนนัด</b> (ระบบรับเงินของ O&amp;M เปิดใช้เฟส 4)
        </div>
      )}

      {actErr && <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{actErr}</div>}
      <div className="mt-3 flex gap-2 flex-wrap">
        <button type="button" style={{ minHeight: 0 }} onClick={() => openPdf(quote.id)}
          className="h-9 px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white cursor-pointer">ดูใบเสนอราคา (PDF)</button>
        {canIssue && EDITABLE.includes(quote.status) && (
          <button type="button" disabled={busy} style={{ minHeight: 0 }} onClick={() => act("submit")}
            className="h-9 px-5 rounded-xl bg-primary text-white text-sm font-bold cursor-pointer disabled:opacity-50">
            {busy ? "กำลังส่ง…" : "ส่งอนุมัติ Solar Sup"}</button>
        )}
        {canIssue && quote.status === "approved" && quote.latest_id === quote.id && (
          <button type="button" disabled={busy} style={{ minHeight: 0 }} onClick={() => act("revise")}
            className="h-9 px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 bg-white cursor-pointer disabled:opacity-50">
            แก้ใบที่อนุมัติแล้ว (สร้าง Revision)</button>
        )}
      </div>
    </div>
  );
}

/** กล่องสถานะของผู้อนุมัติ 1 ขั้น */
function Stage({ label, at, by, waiting }: { label: string; at: string | null; by: string | null; waiting: boolean }) {
  const done = !!at;
  return (
    <div className={`rounded-xl border px-3 py-2 text-xs ${done ? "border-emerald-200 bg-emerald-50/60" : waiting ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
      <div className="font-bold text-gray-700">{label}</div>
      <div className={done ? "text-emerald-700" : waiting ? "text-amber-700 font-semibold" : "text-gray-400"}>
        {done ? <>✓ อนุมัติแล้ว · {by ?? "—"} · {thD(at)}</> : waiting ? "รออนุมัติ" : "ยังไม่ถึงขั้นนี้"}
      </div>
    </div>
  );
}

function Totals({ subtotal, discount, reason, total, beforeVat, vat }: {
  subtotal: number; discount: number; reason: string | null; total: number; beforeVat?: number; vat?: number;
}) {
  return (
    <div className="mt-2 ml-auto max-w-xs text-sm space-y-0.5">
      <div className="flex justify-between"><span className="text-gray-500">รวม</span><span className="tabular-nums">{formatTHB(subtotal)}</span></div>
      {discount > 0 && (
        <div className="flex justify-between text-red-600" title={reason ?? undefined}>
          <span>ส่วนลด{reason ? ` (${reason})` : ""}</span><span className="tabular-nums">−{formatTHB(discount)}</span>
        </div>
      )}
      <div className="flex justify-between font-bold border-t border-gray-200 pt-1"><span>ยอดชำระ (รวม VAT)</span><span className="tabular-nums">{baht(total)}</span></div>
      {beforeVat != null && vat != null && (
        <div className="flex justify-between text-xxs text-gray-400"><span>ก่อน VAT {formatTHB(beforeVat, { decimals: 2 })} · VAT 7% {formatTHB(vat, { decimals: 2 })}</span></div>
      )}
    </div>
  );
}

function QuoteForm({ item, quote, onCancel, onDone }: {
  item: Item;
  quote: Quote | null;
  onCancel?: () => void;
  onDone: (msg: string, q: Quote) => void;
}) {
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [pkgId, setPkgId] = useState<number | null>(quote?.om_package_id ?? null);
  const [lines, setLines] = useState<Line[]>(
    quote?.items.map((x) => ({ item_name: x.item_name, quantity: Number(x.quantity), unit: x.unit ?? "", unit_price: Number(x.unit_price) })) ?? []);
  const [discount, setDiscount] = useState<number>(Number(quote?.discount_value ?? 0));
  const [reason, setReason] = useState(quote?.discount_reason ?? "");
  const [note, setNote] = useState(quote?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const kw = houseKw(item.kwp_list);
  useEffect(() => {
    apiFetch("/api/om/packages").then((d) => {
      const list = (d.packages ?? []) as Pkg[];
      setPkgs(list);
      // ใบใหม่: เลือกแพ็กเกจรายครั้งของช่วงขนาดบ้านไว้ให้ก่อน (ยังเปลี่ยนได้)
      if (!quote && kw > 0) {
        const hit = list.find((p) => p.plan_type === "per_visit" && kw >= p.kw_min && kw <= p.kw_max);
        if (hit) setPkgId(hit.id);
      }
    }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [quote, kw]);

  const tiers = useMemo(() => {
    const m = new Map<string, Pkg[]>();
    for (const p of pkgs) {
      const k = `${p.kw_min.toFixed(2)}–${p.kw_max.toFixed(2)} kW`;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()];
  }, [pkgs]);

  const pkg = pkgs.find((p) => p.id === pkgId) ?? null;
  const subtotal = (pkg?.price ?? 0) + lines.reduce((s, x) => s + Math.max(0, x.quantity) * Math.max(0, x.unit_price), 0);
  const disc = Math.min(Math.max(0, discount), subtotal);

  const setLine = (i: number, patch: Partial<Line>) => setLines((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    setBusy(true); setErr("");
    const body = {
      house_id: item.house_id, om_package_id: pkgId,
      items: lines.filter((x) => x.item_name.trim()), discount_value: disc,
      discount_reason: reason.trim() || null, note: note.trim() || null,
    };
    try {
      if (quote) {
        const q = await apiFetch(`/api/om/quotations/${quote.id}`, { method: "PATCH", body: JSON.stringify(body) });
        onDone(`แก้ใบเสนอราคา ${quote.doc_no} แล้ว`, q);
      } else {
        const r = await apiFetch("/api/om/quotations", { method: "POST", body: JSON.stringify(body) });
        const q = await apiFetch(`/api/om/quotations/${r.id}`);
        onDone(`ออกใบเสนอราคา ${r.doc_no} แล้ว`, q);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      {!quote && (
        <div className="text-sm text-gray-600 mb-3">
          บ้านนี้<b>สิทธิ์หมดแล้ว</b> — ออกใบเสนอราคาก่อน แล้วเก็บค่าบริการก่อนนัดหมาย
        </div>
      )}

      <div className="text-xs font-bold text-gray-500 mb-1.5">
        Package O&amp;M {kw > 0 && <span className="font-normal text-gray-400">· บ้านนี้ {kw.toFixed(2)} kW</span>}
      </div>
      <div className="grid gap-2 sm:grid-cols-3 mb-2">
        {tiers.map(([tier, ps]) => {
          const fits = kw > 0 && kw >= ps[0].kw_min && kw <= ps[0].kw_max;
          return (
            <div key={tier} className={`rounded-xl border p-2 ${fits ? "border-primary/40 bg-teal-50/40" : "border-gray-200"}`}>
              <div className="text-xs font-bold text-gray-700 mb-1">{tier}
                {fits && <span className="ml-1.5 text-xxs font-bold text-primary-dark">ตรงกับบ้านนี้</span>}
              </div>
              {ps.map((p) => (
                <button key={p.id} type="button" style={{ minHeight: 0 }} onClick={() => setPkgId(p.id)}
                  className={`w-full flex justify-between gap-2 px-2.5 py-1.5 mb-1 last:mb-0 rounded-lg border text-left text-xs cursor-pointer ${
                    pkgId === p.id ? "border-active bg-active-light text-active-dark font-bold" : "border-gray-200 bg-white text-gray-700"}`}>
                  <span>{planLabel(p)}</span><span className="tabular-nums">{formatTHB(p.price)}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <button type="button" style={{ minHeight: 0 }} onClick={() => setPkgId(null)}
        className={`mb-3 text-xs cursor-pointer ${pkgId === null ? "font-bold text-active-dark" : "text-gray-500 hover:underline"}`}>
        {pkgId === null ? "✓ " : ""}ไม่ใช้แพ็กเกจ — ใส่รายการเอง (งานซ่อม / งานเพิ่ม)
      </button>
      {pkg?.scope && <div className="-mt-2 mb-3 text-xxs text-gray-400">ขอบเขตงาน: {pkg.scope}</div>}

      <div className="text-xs font-bold text-gray-500 mb-1.5">รายการเพิ่ม</div>
      <div className="space-y-1.5 mb-1.5">
        {lines.map((x, i) => (
          <div key={i} className="grid grid-cols-[1fr_4.5rem_4.5rem_6.5rem_auto] gap-1.5 items-center">
            <input value={x.item_name} onChange={(e) => setLine(i, { item_name: e.target.value })} placeholder="ชื่อรายการ" className={INPUT} />
            <input type="number" min={0} value={x.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} className={`${INPUT} text-right`} />
            <input value={x.unit} onChange={(e) => setLine(i, { unit: e.target.value })} placeholder="หน่วย" className={INPUT} />
            <input type="number" min={0} value={x.unit_price} onChange={(e) => setLine(i, { unit_price: Number(e.target.value) })} className={`${INPUT} text-right`} />
            <button type="button" style={{ minHeight: 0 }} onClick={() => setLines((xs) => xs.filter((_, j) => j !== i))}
              className="h-9 w-9 rounded-lg text-gray-400 hover:text-red-600 cursor-pointer" aria-label="ลบรายการ">×</button>
          </div>
        ))}
      </div>
      <button type="button" style={{ minHeight: 0 }} onClick={() => setLines((xs) => [...xs, { item_name: "", quantity: 1, unit: "", unit_price: 0 }])}
        className="mb-3 text-xs font-bold text-primary cursor-pointer hover:underline">+ เพิ่มรายการ</button>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-xs font-bold text-gray-600">ส่วนลด (บาท)</span>
          <input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className={`${INPUT} text-right`} />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-bold text-gray-600">เหตุผลส่วนลด {disc > 0 && <span className="text-danger">*</span>}</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Sale Sup ใช้ประกอบการอนุมัติ" className={INPUT} />
        </label>
        <label className="grid gap-1 sm:col-span-2">
          <span className="text-xs font-bold text-gray-600">โน้ต</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} />
        </label>
      </div>

      <Totals subtotal={subtotal} discount={disc} reason={reason.trim() || null} total={Math.max(0, subtotal - disc)} />

      {err && <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={save} style={{ minHeight: 0 }}
          className="h-9 px-5 rounded-xl bg-primary text-white text-sm font-bold cursor-pointer disabled:opacity-50">
          {busy ? "กำลังบันทึก…" : quote ? "บันทึกการแก้ไข" : "ออกใบเสนอราคา"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} style={{ minHeight: 0 }}
            className="h-9 px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 bg-white cursor-pointer">ยกเลิก</button>
        )}
      </div>
    </div>
  );
}
