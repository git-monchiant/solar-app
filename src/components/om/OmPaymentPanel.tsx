"use client";

// ขั้น 03 ชำระเงิน ของหน้ารายละเอียดงานบริการ (แผน docs/plan/20260924-02 เฟส 4)
// ★ Sale แนบสลิปของลูกค้า → เข้าคิว "รอยืนยันรับเงิน" ของ Account (คิวเดียวกับฝั่งขาย ติดป้าย O&M)
//   Account ยืนยันแล้วระบบเติมสิทธิ์ที่ซื้อให้บ้าน แล้ว Sale โทรตกลงนัดได้ (เก็บค่าบริการก่อนนัดหมาย)
// ★ ไม่ใช้ PaymentSection ของฝั่งขาย — ตัวนั้นเขียน pay token / ใบแจ้งหนี้ / สถานะลงตัว lead
//   บ้านที่ใช้ lead ร่วมกับฝั่งขายจะเสียลิงก์จ่ายเงินที่ส่งลูกค้าไปแล้ว (ดู /api/om/payments)
// ★ แผน 20261002-10: ขั้นที่กำลังทำ (steps) หน้าตาแบบขั้น Order ฝั่งขาย (OrderStep)
//   แถบขั้นย่อย "เลือกใบเสนอราคา · ชำระเงิน" · กล่องส้มเลือกชุดที่ลูกค้ารับ · ส่วนลด (ล็อกตามใบ) · ยอดรวม · ปุ่ม ถัดไป ›
//   เลือก/เปลี่ยนชุด = /api/om/quotations/[id]/send ได้จนกว่าจะแนบสลิป (แบบ quoteLocked ฝั่งขาย)
//   ขั้นที่ปิดแล้ว (กางดูใน DoneSection) คงหน้าตาเดิม
// ★ แผน 20261002-11: ขั้นย่อย "ชำระเงิน" หน้าตาแบบงวดชำระเงินของ OrderStep + PaymentSection
//   ล็อก 1 งวด 100% (ผู้ใช้เคาะ) · เช็ค / บัตรเครดิตแบบฝั่งขายเต็ม · ไม่มีสินเชื่อ / ชำระหลังติดตั้ง / LINE / ใบแจ้งชำระเงิน
//   แท็บ Thai QR · Bank Account · อื่นๆ ตามค่าใน /api/settings ชุดเดียวกับฝั่งขาย (ไม่มี Payment Link — ต้องใช้ pay token ของ lead)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatTHB } from "@/lib/utils/formatters";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { useSubStep } from "@/lib/hooks/useSubStep";
import { thDT, type Item } from "@/lib/om/service-view";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon } from "@/components/ui/icons";
import Dropdown from "@/components/ui/Dropdown";
import ErrorPopup from "@/components/ui/ErrorPopup";
import ModalBase from "@/components/ui/ModalBase";
import { useDialog } from "@/components/ui/Dialog";
import StepLayout from "@/components/lead/detail/StepLayout";
import OmReceiptRow from "@/components/om/OmReceiptRow";
import { openQuotationPdf, type Quote } from "@/components/om/OmQuotationPanel";

type Pay = {
  id: number; lead_id: number; actual_receipt_url: string | null; amount: number; payment_method: string | null; description: string | null;
  submitted_at: string | null; submitted_by_name: string | null;
  confirmed_at: string | null; confirmed_by: string | null; slip_urls: string[];
  cheque_received_at: string | null; cheque_received_by: string | null;
  cc_surcharge_pct: number | null; cc_surcharge_amount: number;
};
type Settings = Record<string, string | undefined>;

const METHOD: Record<string, string> = { transfer: "โอน / QR", cash: "เงินสด", other: "อื่น ๆ",
  qr: "Thai QR", bank_transfer: "โอนเข้าบัญชี", cheque: "เช็ค", cc: "บัตรเครดิต" };
const SUB_STEPS = ["เลือกใบเสนอราคา", "ชำระเงิน"] as const;
/** ค่าธรรมเนียมบัตรเครดิต — ชุดเดียวกับ CC_RATES / CC_DEFAULT ของ OrderStep (API ตรวจซ้ำ) */
const CC_RATES = [0, 1.5, 2, 2.5, 3] as const;
const CC_DEFAULT = 3;
const MAX_FILES = 5;
// ปุ่มล่าง — คลาสเดียวกับปุ่ม ย้อนกลับ / ถัดไป ของ OrderStep
const BACK_BTN = "flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1 cursor-pointer";
const NEXT_BTN = "flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1 cursor-pointer";
const FILE_ICON = "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z";
const CASH_ICON = "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z";
const COPY_ICON = "M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75";

/** ชื่อไฟล์ใบเสนอราคาแบบที่ PDF ตั้งให้ (เลขใบ_ชื่อลูกค้า.pdf) — ชุดเดียวกับ quotationFileName ของ OrderStep */
const pdfName = (docNo: string, customer: string | null) => {
  const c = (customer || "").trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_");
  return `${c ? `${docNo}_${c}` : docNo}.pdf`;
};
const methodText = (p: Pay) => (METHOD[p.payment_method ?? ""] ?? p.payment_method ?? "—")
  + (p.cc_surcharge_amount > 0 ? ` +${p.cc_surcharge_pct}%` : "");

export default function OmPaymentPanel({ item, skip, onSaved, onReload, steps = false }: {
  item: Item;
  skip: boolean;
  onSaved: (msg: string) => void;
  onReload?: () => void;
  /** การ์ดขั้นที่กำลังทำ — ใบงานขั้นชำระเงินแสดงแบบขั้นย่อยของ Order ฝั่งขาย (แผน 20261002-10) */
  steps?: boolean;
}) {
  const { activeRoles } = useActiveRoles();
  const canSubmit = hasRole(activeRoles, "admin", "sales", "sales_sup");
  const [pays, setPays] = useState<Pay[] | null>(null);
  const [err, setErr] = useState("");

  // โหมดขั้นย่อยโหลดเงินของชุดที่เลือกเอง (PaySteps) — ไม่ยิงซ้ำ
  const ownsPays = !(steps && item.job_status === "payment");
  const load = useCallback(() => {
    if (!item.q_id || !ownsPays) return;
    apiFetch(`/api/om/payments?quotation_id=${item.q_id}`).then(setPays).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [item.q_id, ownsPays]);
  useEffect(() => { load(); }, [load]);

  if (skip && !item.q_id) return <div className="text-sm text-gray-600">งานนี้<b>ใช้สิทธิ์ฟรี</b> — ไม่มีค่าบริการ</div>;
  if (!item.q_id) return <div className="text-sm text-gray-500">ยังไม่มีใบเสนอราคา — ออกใบที่ขั้น 02 ก่อน</div>;
  // ลูกค้าไม่เอา — ใบงานยกเลิกแล้ว ไม่มีอะไรให้ชำระ (API รับสลิปเฉพาะใบงานขั้นชำระเงินอยู่แล้ว)
  if (item.job_status === "cancelled")
    return <div className="text-sm text-gray-500">ใบงานนี้ยกเลิกแล้ว — ไม่ต้องชำระค่าบริการ</div>;
  if (item.job_status === "quote") {
    return (
      <div className="text-sm text-gray-600 leading-relaxed">
        รอใบเสนอราคาอนุมัติครบ แล้วกด <b>&ldquo;ส่งใบเสนอราคาให้ทีมขาย&rdquo;</b> ที่ขั้น 02 ก่อน
        <div className="mt-1 text-xs text-gray-400">เก็บค่าบริการเต็มจำนวนก่อนนัดหมาย</div>
      </div>
    );
  }
  if (steps && item.job_status === "payment" && item.booking_id)
    return <PaySteps item={item} bookingId={item.booking_id} canSubmit={canSubmit} onSaved={onSaved} onReload={onReload} />;
  if (pays === null) return err
    ? <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>
    : <div className="text-sm text-gray-400">กำลังโหลด…</div>;

  const current = pays[0];
  const fee = current ? Number(current.cc_surcharge_amount || 0) : 0;
  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap mb-3">
        <span className="text-sm text-gray-600">ค่าบริการตามใบ <b className="font-mono">{item.q_doc_no}</b></span>
        <span className="ml-auto text-lg font-bold tabular-nums">{formatTHB(Number(item.q_total || 0) + fee)} บาท</span>
      </div>
      {current
        ? <PayStatus pay={current} docNo={item.q_doc_no ?? `om_${item.q_id}`} onChanged={load} />
        : <div className="text-sm text-gray-600">ยังไม่มีสลิปค่าบริการ</div>}
    </div>
  );
}

/** สลิปที่แนบแล้ว — รอ Account / รับเช็คแล้วรอเงินเข้า / ยืนยันแล้ว + ใบเสร็จ */
function PayStatus({ pay: current, docNo, onChanged }: { pay: Pay; docNo: string; onChanged: () => void }) {
  const chequeWaitingMoney = !current.confirmed_at && !!current.cheque_received_at;
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${current.confirmed_at ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50"}`}>
      <div className={`text-sm font-bold ${current.confirmed_at ? "text-emerald-800" : "text-amber-800"}`}>
        {current.confirmed_at ? "✓ Account ยืนยันรับเงินแล้ว"
          : chequeWaitingMoney ? "✓ รับเช็คแล้ว — รอฝ่ายบัญชียืนยันเงินเข้า"
          : current.payment_method === "cheque" ? "รอฝ่ายบัญชียืนยันรับเช็ค" : "รอ Account ยืนยันรับเงิน"}
      </div>
      <div className="mt-0.5 text-xs text-gray-600">
        {methodText(current)}
        {current.cc_surcharge_amount > 0 && <> (ค่าธรรมเนียม {formatTHB(current.cc_surcharge_amount)} บาท)</>}
        {" "}· แนบโดย {current.submitted_by_name ?? "—"} · {thDT(current.submitted_at)}
        {current.cheque_received_at && <> · รับเช็คโดย {current.cheque_received_by ?? "—"} · {thDT(current.cheque_received_at)}</>}
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
      {/* ใบเสร็จ — แบบแถวใบเสร็จงวดของฝั่งขาย (ชั่วคราว PDF · แนบตัวจริงโดย Account/admin) */}
      {current.confirmed_at && (
        <div className="mt-2.5 md:flex md:items-center md:gap-2">
          <span className="block mb-1.5 md:mb-0 text-xs font-semibold text-gray-500">ใบเสร็จ</span>
          <OmReceiptRow pay={current} docNo={docNo} onChanged={onChanged} />
        </div>
      )}
      {(current.confirmed_at || chequeWaitingMoney) && (
        <div className="mt-2 text-xs text-emerald-800 leading-relaxed">
          {/* ★ 29 ก.ย. 69 (แผน 20260929-02): ขั้น 01 ปิดแล้วอ่านอย่างเดียว — โทรตกลงวันนัดย้ายไปการ์ดนัดหมาย */}
          {current.confirmed_at ? "เติมสิทธิ์ที่ซื้อให้บ้านแล้ว · " : "รับเช็คแล้วทำงานต่อได้ (เติมสิทธิ์เมื่อเงินเข้า) · "}
          ขั้นถัดไป <b>โทรตกลงวันนัด</b> ที่ขั้น 04 นัดหมาย
        </div>
      )}
    </div>
  );
}

// ── ขั้นที่กำลังทำ: ขั้นย่อยแบบ OrderStep ฝั่งขาย (แผน 20261002-10 / 11) ──
function PaySteps({ item, bookingId, canSubmit, onSaved, onReload }: {
  item: Item; bookingId: number; canSubmit: boolean;
  onSaved: (msg: string) => void; onReload?: () => void;
}) {
  const { activeRoles } = useActiveRoles();
  // ยืนยันในแผงได้แบบ "ยืนยันการชำระเงิน 2" ของ PaymentSection — คิว /report/pending ยังใช้ได้ตามเดิม
  const canAccount = hasRole(activeRoles, "admin", "account");
  const dialog = useDialog();
  const [sub, setSub] = useSubStep(`omPaySubStep_${bookingId}`, 0, SUB_STEPS.length);
  // ทุกใบของใบงาน + บันทึกถึงฝ่ายขาย — ผูกเลขใบงานไว้ กันโชว์ของบ้านก่อนหน้าค้างตอนเปลี่ยนบ้าน
  const [list, setList] = useState<{ bookingId: number; quotes: Quote[]; note: string } | null>(null);
  const [pays, setPays] = useState<{ qid: number; rows: Pay[] } | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [picking, setPicking] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);
  // แถวงวด: วิธีชำระ (เช็ค / บัตรเครดิต / โอน) · แผงรับเงินกาง/พับ (ปุ่ม "บันทึกรับชำระ")
  const [rowMethod, setRowMethod] = useState<"transfer" | "cheque" | "cc">("transfer");
  const [ccPct, setCcPct] = useState<number>(CC_DEFAULT);
  const [payOpen, setPayOpen] = useState(true);
  const [tab, setTab] = useState<"qr" | "bank" | "other">("qr");
  const [otherDetail, setOtherDetail] = useState("");
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [qr, setQr] = useState<{ amount: number; url: string | null; mode: string; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<{ id: number; reason: string } | null>(null);
  const [err, setErr] = useState("");

  const loadQuotes = useCallback(() => apiFetch(`/api/om/quotations?booking_id=${bookingId}`)
    .then((d) => setList({ bookingId, quotes: d.quotes, note: d.quote_note ?? "" }))
    .catch((e) => setErr(e instanceof Error ? e.message : String(e))), [bookingId]);
  useEffect(() => { loadQuotes(); }, [loadQuotes, item.q_id]);
  const quotes = list && list.bookingId === bookingId ? list.quotes : null;

  // ค่าช่องทางรับเงินชุดเดียวกับ PaymentSection — แท็บแรกที่เปิดใช้
  useEffect(() => {
    apiFetch("/api/settings").then((s: Settings) => {
      setSettings(s);
      if (s.promptpay_qr_enabled === "false") setTab(s.bank_account_enabled !== "false" ? "bank" : "other");
    }).catch(console.error);
  }, []);
  const qrEnabled = settings.promptpay_qr_enabled !== "false";
  const bankEnabled = settings.bank_account_enabled !== "false";
  const otherEnabled = settings.other_payment_enabled === "true";

  // ชุดให้เลือก = ใบล่าสุดของแต่ละชุดที่อนุมัติแล้ว (API เรียง ชุด → Revision ใหม่สุดก่อน) · ชุดที่เลือก = sent_to_customer_at
  const options = useMemo(() => {
    const m = new Map<number, Quote>();
    for (const q of quotes ?? []) if (q.status !== "cancelled" && !m.has(q.option_no)) m.set(q.option_no, q);
    return [...m.values()].filter((q) => q.status === "approved");
  }, [quotes]);
  const chosen = options.find((q) => q.sent_to_customer_at) ?? null;

  const loadPays = useCallback(() => {
    if (!chosen) return;
    const qid = chosen.id;
    apiFetch(`/api/om/payments?quotation_id=${qid}`).then((rows) => setPays({ qid, rows }))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [chosen]);
  useEffect(() => { loadPays(); }, [loadPays]);
  const payRows = pays && chosen && pays.qid === chosen.id ? pays.rows : null;
  const current = payRows?.[0] ?? null;
  // แนบสลิปแล้ว = ล็อกชุด (สลิปผูกเลขใบ) แบบ quoteLocked ฝั่งขาย · Account ปฏิเสธสลิป = ลบแถว เปลี่ยนได้อีก
  const locked = !!current;

  // เปิดใบงานที่แนบสลิปแล้ว — ไปขั้นย่อยชำระเงินให้เลย (ครั้งเดียวต่อใบงาน กดย้อนกลับไปดูชุดได้)
  const jumped = useRef<number | null>(null);
  useEffect(() => {
    if (current && jumped.current !== bookingId) { jumped.current = bookingId; setSub(1); }
  }, [current, bookingId, setSub]);

  // ยอด — แถวที่แนบแล้วใช้วิธี/ค่าธรรมเนียมที่บันทึกไว้ · ยังไม่แนบใช้ที่ติ๊กอยู่
  const subtotal = Number(chosen?.subtotal_incl_vat ?? 0);
  const discount = Number(chosen?.discount_amount ?? 0);
  const pct = subtotal > 0 && discount > 0 ? Math.round((discount / subtotal) * 10000) / 100 : 0;
  const net = Number(chosen?.contract_total_incl_vat ?? 0);
  const method = current ? (current.payment_method === "cheque" ? "cheque" : current.payment_method === "cc" ? "cc" : "transfer") : rowMethod;
  const feePct = current ? Number(current.cc_surcharge_pct ?? 0) : method === "cc" ? ccPct : 0;
  const fee = current ? Number(current.cc_surcharge_amount || 0) : Math.round((net * feePct) / 100);
  const toCharge = net + fee;

  // Thai QR — /api/qr ตัวเดียวกับฝั่งขาย (lead + step 900 ทำ Ref1 ของ O&M · ไม่จอง payment_no เพราะทางนั้นเขียนลง lead)
  useEffect(() => {
    if (!qrEnabled || toCharge <= 0 || !chosen) return;
    let cancelled = false;
    const params = new URLSearchParams({ amount: String(toCharge), lead_id: String(chosen.lead_id), step_no: "900" });
    apiFetch(`/api/qr?${params.toString()}`)
      .then((d: { qrDataUrl: string; mode?: string }) => { if (!cancelled) setQr({ amount: toCharge, url: d.qrDataUrl, mode: d.mode ?? "credit_transfer" }); })
      .catch(() => { if (!cancelled) setQr({ amount: toCharge, url: null, mode: "credit_transfer", error: "สร้าง QR ไม่สำเร็จ" }); });
    return () => { cancelled = true; };
  }, [qrEnabled, toCharge, chosen]);
  const qrNow = qr && qr.amount === toCharge ? qr : null;

  // ปล่อย object URL ของรูปพรีวิวตอนเลิกใช้
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => { for (const f of filesRef.current) URL.revokeObjectURL(f.url); }, []);
  const addFiles = (list: FileList | null) => {
    const picked = Array.from(list ?? []).slice(0, MAX_FILES - files.length).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setFiles((cur) => [...cur, ...picked]);
  };
  const removeFile = (i: number) => setFiles((cur) => {
    URL.revokeObjectURL(cur[i].url);
    return cur.filter((_, k) => k !== i);
  });

  /** เลือกชุดที่ลูกค้ารับ — กดแล้วบันทึกทันทีแบบ pickQuote ฝั่งขาย (ไม่มี dialog) */
  const pick = async (q: Quote) => {
    if (picking || !canSubmit || locked || q.id === chosen?.id) return;
    setPicking(true); setErr("");
    try {
      await apiFetch(`/api/om/quotations/${q.id}/send`, { method: "POST" });
      await loadQuotes();
      onSaved(`ลูกค้าเลือกชุด ${q.option_no} (${q.doc_no})`);
      onReload?.();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setPicking(false); }
  };

  /** "ยืนยันการชำระเงิน 1" — Sale ส่งสลิปเข้าคิว Account */
  const submit = async () => {
    if (!chosen) return;
    if (files.length === 0) { setNextError("แนบสลิปหรือหลักฐานการชำระอย่างน้อย 1 รูป"); return; }
    const payMethod = rowMethod === "cheque" ? "cheque" : tab === "bank" ? "bank_transfer" : tab;
    if (payMethod === "other" && !otherDetail.trim()) { setNextError("กรอกรายละเอียดการชำระ (ชำระโดย)"); return; }
    setBusy(true); setErr("");
    const fd = new FormData();
    fd.set("quotation_id", String(chosen.id)); fd.set("amount", String(net));
    fd.set("method", payMethod); fd.set("note", payMethod === "other" ? otherDetail.trim() : "");
    if (rowMethod === "cc") { fd.set("cc", "1"); fd.set("cc_pct", String(ccPct)); }
    for (const f of files) fd.append("files", f.file);
    try {
      await apiFetch("/api/om/payments", { method: "POST", body: fd });
      for (const f of files) URL.revokeObjectURL(f.url);
      setFiles([]); setOtherDetail("");
      onSaved(rowMethod === "cheque" ? "แนบภาพเช็คแล้ว — รอฝ่ายบัญชียืนยันรับเช็ค" : "แนบสลิปแล้ว — รอ Account ยืนยันรับเงิน");
      loadPays(); onReload?.();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  /** Account/admin ในแผง — รับเช็ค / ยืนยันเงิน / ไม่อนุมัติ (ทาง /api/om/payments/[id] ตัวเดียวกับคิว) */
  const account = async (action: "confirm" | "cheque_received" | "reject", reason = "") => {
    if (!current) return;
    if (action !== "reject") {
      const ok = await dialog.confirm(action === "cheque_received"
        ? { title: "ยืนยันรับเช็ค", confirmText: "ยืนยันรับเช็ค",
            message: "รับเช็คแล้ว Sale โทรนัดได้ · ยืนยันรับเงินอีกครั้งเมื่อเงินเข้าจริง (ตอนนั้นจึงเติมสิทธิ์)" }
        : { title: "ยืนยันรับเงินค่าบริการ", confirmText: "ยืนยันรับเงิน", variant: "success",
            message: `${formatTHB(toCharge)} บาท — ยืนยันแล้วระบบเติมสิทธิ์ที่ลูกค้าซื้อให้บ้าน` });
      if (!ok) return;
    }
    setBusy(true); setErr("");
    try {
      await apiFetch(`/api/om/payments/${current.id}`, { method: "POST", body: JSON.stringify({ action, reason }) });
      setRejecting(null);
      onSaved(action === "cheque_received" ? "รับเช็คแล้ว — Sale โทรนัดได้" : action === "confirm" ? "ยืนยันรับเงินแล้ว" : "ส่งกลับให้แนบสลิปใหม่แล้ว");
      loadPays(); onReload?.();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  // ไปขั้นย่อยถัดไปต้องเลือกชุดก่อน — แบบ gateCheck ของ OrderStep
  const go = (n: number) => {
    if (n > sub && !chosen) { setNextError("เลือกใบเสนอราคา"); return; }
    setNextError(null); setSub(n);
  };

  if (!quotes) return err
    ? <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>
    : <div className="text-sm text-gray-400">กำลังโหลด…</div>;

  const pdfLink = (q: Quote, cls: string, textCls: string) => (
    <button type="button" style={{ minHeight: 0 }}
      onClick={(e) => { e.stopPropagation(); openQuotationPdf(q.id); }}
      className={`w-full flex items-center gap-2 rounded border border-orange-100 hover:bg-orange-100 transition-colors cursor-pointer text-left ${cls}`}>
      <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={FILE_ICON} />
      </svg>
      <span className={`text-orange-700 font-semibold truncate ${textCls}`}>{pdfName(q.doc_no, item.customer_name)}</span>
    </button>
  );

  // กล่องยอดรวม — ชุดเดียวกับท้ายขั้นย่อยของ OrderStep (+ ค่าธรรมเนียมบัตรเมื่อจ่ายบัตร)
  const totalsBox = (
    <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-500">ยอดรวม</span>
        <span className="font-bold font-mono">{formatTHB(subtotal)} บาท</span>
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>ส่วนลด{pct > 0 ? ` ${pct}%` : ""}{chosen?.discount_reason ? ` · ${chosen.discount_reason}` : ""}</span>
        <span>{discount > 0 ? `-${formatTHB(discount)}` : "0"} บาท</span>
      </div>
      <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1">
        <span className="text-gray-600">ยอดชำระสุทธิ</span>
        <span className="font-bold font-mono text-gray-900">{formatTHB(net)} บาท</span>
      </div>
      {fee > 0 && (<>
        <div className="flex justify-between text-xs text-gray-400">
          <span>ค่าธรรมเนียมบัตรเครดิต</span>
          <span>+{formatTHB(fee)} บาท</span>
        </div>
        <div className="flex justify-between text-sm font-semibold">
          <span className="text-gray-600">ยอดรวมที่ต้องชำระ</span>
          <span className="font-bold font-mono text-gray-900">{formatTHB(toCharge)} บาท</span>
        </div>
      </>)}
    </div>
  );

  // ── แถวงวดที่ 1 (ยกจากแถวงวดของ OrderStep — ไม่มีสินเชื่อ / ชำระหลังติดตั้ง ตามที่ผู้ใช้เคาะ) ──
  const paid = !!current?.confirmed_at;
  const chequeWaitingMoney = !paid && !!current?.cheque_received_at;
  const pendingApproval = !!current && !paid && !chequeWaitingMoney;
  const methodLocked = !!current || !canSubmit;
  const checkbox = (k: "cheque" | "cc", label: string) => (
    <label className={`flex items-center gap-1.5 text-xs text-gray-600 shrink-0 ${methodLocked ? "cursor-default opacity-60" : "cursor-pointer"}`}>
      <input type="checkbox" checked={method === k} disabled={methodLocked}
        onChange={(e) => setRowMethod(e.target.checked ? k : "transfer")}
        className="w-4 h-4 accent-primary" />
      <span>{label}</span>
    </label>
  );
  const ccPicker = method === "cc" ? (
    <Dropdown className="w-full md:w-24" value={String(feePct)} disabled={methodLocked}
      onChange={(v) => setCcPct(v ? parseFloat(v) : CC_DEFAULT)}
      options={CC_RATES.map((r) => ({ value: String(r), label: r === 0 ? "0%" : `+${r}%` }))} />
  ) : null;
  const recordBtn = (full: boolean) => (
    <button type="button" onClick={(e) => { e.stopPropagation(); setPayOpen((o) => !o); }}
      className={`${full ? "w-full text-sm justify-center gap-2" : "px-3 text-xs gap-1.5"} h-8 rounded-md border font-semibold transition-colors inline-flex items-center cursor-pointer ${
        paid ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : chequeWaitingMoney || pendingApproval ? "bg-amber-50 text-amber-700 border-amber-300"
          : payOpen ? "bg-active text-white border-active"
          : "border-gray-200 bg-white text-gray-700 hover:border-active hover:text-active hover:bg-active/5"}`}>
      {paid ? <>ชำระแล้ว</>
        : chequeWaitingMoney ? <>รอรับเงิน</>
        : pendingApproval ? <><ClockIcon className={full ? "w-4 h-4" : "w-3.5 h-3.5"} strokeWidth={2} />รอยืนยัน</>
        : <>
            <svg className={full ? "w-4 h-4" : "w-3.5 h-3.5"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={CASH_ICON} />
            </svg>
            บันทึกรับชำระ
          </>}
    </button>
  );
  const tabBtn = (t: "qr" | "bank" | "other", label: string) => (
    <button type="button" onClick={() => setTab(t)}
      className={`flex-1 pb-2.5 text-xs md:text-sm font-semibold border-b-2 -mb-px transition-colors inline-flex items-center justify-center whitespace-nowrap cursor-pointer ${
        tab === t ? "text-active border-active" : "text-gray-400 border-transparent hover:text-gray-600"}`}>
      {label}
    </button>
  );
  const companyFull = settings.company_name || "SENA SOLAR ENERGY CO., LTD.";
  const slipLabel = method === "cheque" ? "หลักฐานเช็ค" : tab === "other" ? "หลักฐานการชำระ" : "สลิปโอนเงิน";
  const uploadLabel = method === "cheque" ? "อัปโหลดภาพเช็ค" : tab === "other" ? "อัปโหลดหลักฐานการชำระ" : "กรุณาอัปโหลดสลิปโอนเงิน";

  // แผงรับเงินของงวด — แบบ PaymentSection: แท็บช่องทาง → อัปโหลดหลักฐาน → ปุ่มยืนยัน
  const payPanel = current ? (
    <div className="space-y-3">
      <PayStatus pay={current} docNo={chosen?.doc_no ?? ""} onChanged={loadPays} />
      {!paid && (canAccount ? (
        <>
          <button type="button" disabled={busy} onClick={() => account(chequeWaitingMoney || current.payment_method !== "cheque" ? "confirm" : "cheque_received")}
            className={`w-full h-11 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
              current.payment_method === "cheque" && !chequeWaitingMoney ? "bg-amber-500 hover:bg-amber-600" : "bg-gradient-to-r from-primary to-primary-dark hover:brightness-110"}`}>
            {busy ? "กำลังยืนยัน…" : current.payment_method === "cheque" && !chequeWaitingMoney ? "ยืนยันรับเช็ค" : "ยืนยันการชำระเงิน 2"}
          </button>
          <button type="button" disabled={busy} onClick={() => setRejecting({ id: current.id, reason: "" })}
            className="w-full h-8 rounded-lg text-sm font-semibold text-red-600 border border-red-300 bg-white hover:bg-red-50 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40">
            ✗ ไม่อนุมัติ / ส่งกลับให้ upload ใหม่
          </button>
        </>
      ) : (
        <button type="button" disabled
          className="w-full h-11 rounded-lg text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 cursor-not-allowed flex items-center justify-center gap-1.5">
          ⏳ {chequeWaitingMoney ? "รับเช็คแล้ว — รอฝ่ายบัญชียืนยันเงินเข้า" : current.payment_method === "cheque" ? "รอฝ่ายบัญชียืนยันรับเช็ค" : "รออนุมัติการรับชำระเงิน"}
        </button>
      ))}
    </div>
  ) : !canSubmit ? (
    <div className="text-sm text-gray-600">รอ Sale แนบสลิปค่าบริการ</div>
  ) : (
    <div className="space-y-3">
      {method === "cheque" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
          <div className="font-semibold">ชำระด้วยเช็ค</div>
          <div className="text-xs mt-1">อัปโหลดภาพเช็คแล้วส่งให้ฝ่ายบัญชียืนยันรับเช็ค เมื่อรับเช็คแล้วสามารถดำเนินงานต่อได้ และฝ่ายบัญชีจะยืนยันรับเงินอีกครั้งเมื่อเงินเข้าจริง</div>
        </div>
      ) : (<>
        {[qrEnabled, bankEnabled, otherEnabled].filter(Boolean).length > 1 && (
          <div className="flex border-b border-gray-200 -mx-3 px-3">
            {qrEnabled && tabBtn("qr", "Thai QR")}
            {bankEnabled && tabBtn("bank", "Bank Account")}
            {otherEnabled && tabBtn("other", "อื่นๆ")}
          </div>
        )}
        {tab === "qr" && qrEnabled && (
          <div className="max-w-[280px] mx-auto">
            <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col items-center gap-2">
              <div className="w-full aspect-square bg-black rounded-lg flex items-center justify-center">
                {!qrNow ? <span className="text-white text-xs tracking-wider">LOADING…</span>
                  : qrNow.error ? <span className="text-white text-xs">{qrNow.error}</span>
                  // eslint-disable-next-line @next/next/no-img-element
                  : qrNow.url ? <img src={qrNow.url} alt="PromptPay QR" className="w-full h-full object-contain p-2 bg-white rounded-lg" />
                  : <span className="text-white text-sm font-semibold tracking-wider uppercase">NO QR</span>}
              </div>
              <div className="text-center">
                <div className="text-xs font-semibold text-gray-700">{companyFull}</div>
                <div className="text-xxs text-gray-500 font-mono tabular-nums mt-0.5">
                  {qrNow?.mode === "bill_payment"
                    ? `Bill Payment · Biller ${settings.promptpay_biller_id || ""}`
                    : `PromptPay Tax ID: ${settings.promptpay_tax_id || ""}`}
                </div>
              </div>
            </div>
          </div>
        )}
        {tab === "bank" && bankEnabled && (
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-3">
            <div>
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">ธนาคาร</div>
              <div className="text-sm font-semibold text-gray-900 mt-0.5">{settings.bank_account_bank || "—"}</div>
              {settings.bank_account_branch && <div className="text-xs text-gray-500">สาขา {settings.bank_account_branch}</div>}
            </div>
            <div className="pt-2 border-t border-gray-200">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">เลขบัญชี</div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="text-base font-bold font-mono tabular-nums text-gray-900 flex-1 min-w-0">{settings.bank_account_number || "—"}</div>
                <button type="button" title="คัดลอกข้อมูลธนาคารทั้งหมด" style={{ minHeight: 0 }}
                  onClick={() => {
                    navigator.clipboard.writeText([
                      `ธนาคาร ${settings.bank_account_bank || ""}${settings.bank_account_branch ? ` สาขา${settings.bank_account_branch}` : ""}`,
                      `เลขบัญชี ${settings.bank_account_number || ""}`,
                      `ชื่อบัญชี ${settings.bank_account_name || ""}`,
                    ].join("\n"));
                    setCopied(true); setTimeout(() => setCopied(false), 2000);
                  }}
                  className="shrink-0 w-9 h-8 rounded-md flex items-center justify-center text-active hover:bg-active/10 transition-all cursor-pointer">
                  {copied ? <CheckIcon className="w-5 h-5" strokeWidth={2.5} /> : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={COPY_ICON} />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="pt-2 border-t border-gray-200">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">ชื่อบัญชี</div>
              <div className="text-sm font-semibold text-gray-900 break-words mt-0.5">{settings.bank_account_name || "—"}</div>
            </div>
          </div>
        )}
        {tab === "other" && otherEnabled && (
          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ชำระโดย / รายละเอียด <span className="text-red-500">*</span></label>
            <textarea value={otherDetail} onChange={(e) => setOtherDetail(e.target.value)} rows={5} maxLength={150}
              placeholder="รับชำระรูปแบบอื่นๆ (โปรดระบุให้ละเอียด เช่น เงินสด ผู้รับเงิน วันที่รับ)"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-active" />
          </div>
        )}
      </>)}

      {/* อัปโหลดหลักฐาน — สูงสุด 5 แบบช่องสลิปของ PaymentSection (ไม่มีตรวจสลิปอัตโนมัติ) */}
      <div className="pt-2 border-t border-gray-100">
        <input type="file" accept="image/*,application/pdf" multiple className="hidden" id={`om-slip-${bookingId}`}
          disabled={files.length >= MAX_FILES} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <div className="text-xs font-semibold tracking-wider uppercase text-gray-400 mb-2">
          {slipLabel} <span className="text-red-500">*</span>
        </div>
        {files.length === 0 ? (
          <label htmlFor={`om-slip-${bookingId}`}
            className="w-full h-11 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer bg-white border border-gray-200 text-gray-700 hover:border-gray-400 transition-colors">
            {uploadLabel}
          </label>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {files.map((f, i) => (
              <div key={f.url} className="relative rounded-lg overflow-hidden border border-gray-200 aspect-square bg-gray-50">
                {f.file.type.startsWith("image/")
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={f.url} alt={f.file.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 text-gray-500">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={FILE_ICON} /></svg>
                      <span className="text-xxs truncate w-full text-center">{f.file.name}</span>
                    </div>}
                <button type="button" onClick={() => removeFile(i)} aria-label="ลบไฟล์" style={{ minHeight: 0 }}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center cursor-pointer">✕</button>
              </div>
            ))}
            {files.length < MAX_FILES && (
              <label htmlFor={`om-slip-${bookingId}`}
                className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-2xl text-gray-400 hover:border-active hover:text-active cursor-pointer">+</label>
            )}
          </div>
        )}
        {files.length > 0 && (
          <button type="button" disabled={busy || (method !== "cheque" && tab === "other" && !otherDetail.trim())} onClick={submit}
            className="w-full h-11 mt-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
            {busy ? "กำลังส่ง…" : "ยืนยันการชำระเงิน 1"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <StepLayout state="active" subSteps={SUB_STEPS} subStep={sub} onSubStepChange={go} doneHeader={null}>
      {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>}

      {/* ขั้นย่อย 0: เลือกใบเสนอราคาที่ลูกค้ารับ — ยกจาก Step 0 ของ OrderStep */}
      {sub === 0 && (
        <div className="space-y-3">
          <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
            <div className="flex items-center justify-between mb-2 gap-2">
              <div className="text-xs font-bold text-orange-600 uppercase">{`เลือกใบเสนอราคาที่ลูกค้ารับ (${options.length} ชุด)`}</div>
              {locked && (
                <div className="inline-flex items-center gap-1 text-xxs font-bold uppercase tracking-wider text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full" title="แนบสลิปค่าบริการแล้ว — เปลี่ยนใบเสนอราคาไม่ได้">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                  <span>ล็อก · แนบสลิปแล้ว</span>
                </div>
              )}
            </div>
            <div className={`grid gap-2 ${options.length > 1 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1"}`}>
              {options.map((q) => {
                const isAccepted = q.id === chosen?.id;
                const isSelectable = canSubmit && !locked && !isAccepted;
                return (
                  <div key={q.id}
                    onClick={isSelectable ? () => pick(q) : undefined}
                    className={`rounded-lg border p-2 transition-colors ${isAccepted ? "border-emerald-400 bg-emerald-50/60 ring-1 ring-emerald-300" : "border-orange-100 bg-white"} ${isSelectable ? "cursor-pointer hover:border-orange-300 hover:bg-orange-50/40" : ""} ${picking ? "opacity-60" : ""}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-xxs font-bold uppercase tracking-wider text-gray-500">ชุด {q.option_no}</div>
                      {isAccepted && <div className="text-xxs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">เลือกแล้ว</div>}
                    </div>
                    {pdfLink(q, "px-2 py-1.5 bg-orange-50", "text-xs")}
                    <div className="mt-1.5 text-base font-bold font-mono tabular-nums text-gray-900">{formatTHB(Number(q.contract_total_incl_vat))} บาท</div>
                    <div className="text-xxs text-gray-500 font-mono mt-0.5">{q.doc_no}</div>
                  </div>
                );
              })}
            </div>
            {list?.note && <div className="text-xs text-orange-600 mt-2 whitespace-pre-wrap">{list.note}</div>}
          </div>

          {/* ส่วนลด — O&M ให้ส่วนลดในใบเสนอราคาเท่านั้น (ผ่านอนุมัติแล้ว) ⇒ ล็อกเสมอ แบบ discountLockedFromQuotation */}
          <div className="rounded-lg bg-white border border-gray-200 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">ส่วนลด</div>
              <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xxs font-semibold text-gray-500">
                <span aria-hidden="true">🔒</span>
                ข้อมูลจากใบเสนอราคาที่อนุมัติแล้ว
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <label className="col-span-2 min-w-0">
                <span className="text-xxs text-gray-500">Discount Text</span>
                <input type="text" disabled value={chosen?.discount_reason ?? ""} placeholder="เช่น โปรโมชัน, ส่วนลดพนักงาน"
                  className="mt-0.5 w-full h-8 px-3 rounded-lg border border-gray-200 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-600" />
              </label>
              <label>
                <span className="text-xxs text-gray-500">%</span>
                <div className="relative mt-0.5">
                  <input type="number" disabled value={pct || ""} placeholder="0"
                    className="w-full h-8 pl-3 pr-7 rounded-lg border border-gray-200 text-sm font-mono tabular-nums text-right disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-600" />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">%</span>
                </div>
              </label>
              <label>
                <span className="text-xxs text-gray-500">บาท</span>
                <div className="relative mt-0.5">
                  <input type="number" disabled value={discount || ""} placeholder="0"
                    className="w-full h-8 pl-3 pr-7 rounded-lg border border-gray-200 text-sm font-mono tabular-nums text-right disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-600" />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">฿</span>
                </div>
              </label>
            </div>
          </div>

          {totalsBox}
        </div>
      )}

      {/* ขั้นย่อย 1: ชำระเงิน — ยกจาก Step 1 (งวดชำระเงิน) ของ OrderStep · ล็อก 1 งวด 100% */}
      {sub === 1 && chosen && (
        <div className="space-y-3">
          <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
            <div className="text-xs font-bold text-orange-600 uppercase mb-2">ใบเสนอราคาที่ลูกค้าเลือก · {chosen.doc_no}</div>
            {pdfLink(chosen, "px-3 py-2 bg-white", "text-sm")}
            {list?.note && <div className="text-xs text-orange-600 mt-2 whitespace-pre-wrap">{list.note}</div>}
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">จำนวนเงินตามใบเสนอราคา (บาท)</label>
            <div className="w-full h-14 px-3 rounded-lg border border-gray-200 bg-gray-50 text-2xl font-bold font-mono text-gray-800 flex items-center">
              {formatTHB(subtotal)}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              ยอดตามใบเสนอราคา {chosen.doc_no}{locked ? "" : " · แก้ไขโดยเลือกใบเสนอราคาฉบับอื่น"}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">งวดการชำระเงิน</label>
            {/* ★ ผู้ใช้เคาะ 2 ต.ค. 69: O&M ล็อก 1 งวด ชำระเต็มก่อนนัด — ปุ่ม 2–4 งวดคงหน้าตาไว้แต่กดไม่ได้ */}
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2 items-center mb-3">
              {[1, 2, 3, 4].map((n) => (
                <button key={n} type="button" disabled={n !== 1} style={{ minHeight: 0 }}
                  title={n === 1 ? undefined : "งานบริการ O&M ชำระเต็มจำนวนก่อนนัด 1 งวด"}
                  className={`h-8 px-2 rounded-lg text-sm font-semibold border transition-all ${n === 1
                    ? "bg-active text-white border-active" : "bg-white text-gray-300 border-gray-200 cursor-not-allowed"}`}>
                  {n} งวด
                </button>
              ))}
              <span className="col-span-2 md:col-span-3 text-sm text-gray-500 md:text-right">
                ยอดรวมที่ต้องชำระ <span className="font-bold font-mono tabular-nums text-lg text-gray-900">{formatTHB(toCharge)}</span> บาท
              </span>
            </div>

            <div className={`rounded-lg border p-2 transition-colors ${paid ? "bg-emerald-50 border-emerald-200"
              : payOpen ? "bg-active-light border-active border-2 shadow-md shadow-active/20" : "bg-white border-gray-200"} ${method === "cc" && fee > 0 ? "pb-6" : ""}`}>
              {/* มือถือ grid 12 ช่อง · desktop แถวเดียว — ผังเดียวกับแถวงวดของ OrderStep */}
              <div className="grid grid-cols-12 gap-2 items-center md:flex md:flex-nowrap">
                <div className="order-1 col-span-4 md:w-24 text-xs font-semibold text-gray-700 md:shrink-0 flex items-center gap-1">
                  <span className="shrink-0 w-5 h-5" aria-hidden />
                  {paid && <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" strokeWidth={3} />}
                  <span className={paid ? "text-emerald-800" : ""}>งวดที่ 1</span>
                </div>
                <div className="order-2 col-span-3 md:w-20 relative md:shrink-0">
                  <input type="text" value="100" disabled
                    className="w-full h-8 pl-2 pr-7 rounded-md border text-sm font-mono tabular-nums bg-gray-50 border-gray-200 text-gray-700" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">%</span>
                </div>
                <div className="order-3 col-span-5 flex items-center justify-end md:justify-start gap-2 md:shrink-0 md:-ml-1">
                  <div className="w-full md:w-32 text-right relative">
                    <div className="relative">
                      <input type="text" value={net} disabled
                        className="w-full h-8 pl-2 pr-6 rounded-md border text-sm font-mono tabular-nums text-right bg-gray-50 border-gray-200 text-gray-700" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">฿</span>
                    </div>
                    {method === "cc" && fee > 0 && (
                      <span className="absolute top-full left-0 right-0 mt-0.5 text-xs text-gray-500 whitespace-nowrap text-right pointer-events-none">
                        +ค่าธรรมเนียม {feePct}% = {formatTHB(fee)} ฿ · รวม <span className="font-semibold text-gray-700">{formatTHB(toCharge)}</span> ฿
                      </span>
                    )}
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-2 md:ml-auto md:order-last">
                  {checkbox("cheque", "เช็ค")}
                  {checkbox("cc", "บัตรเครดิต")}
                  {ccPicker}
                  {recordBtn(false)}
                </div>
              </div>
              <div className="mt-2 md:hidden space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  {checkbox("cheque", "เช็ค")}
                  {checkbox("cc", "บัตรเครดิต")}
                </div>
                {ccPicker && <div>{ccPicker}</div>}
                {recordBtn(true)}
              </div>
              {payOpen && <div className="mt-3 pt-3 border-t border-gray-100">{payPanel}</div>}
            </div>
          </div>

          {totalsBox}
        </div>
      )}

      {/* ปุ่มล่าง — แบบ OrderStep: ขั้นย่อยแรก [ว่าง | ถัดไป ›] · ขั้นสุดท้าย [‹ ย้อนกลับ] (ยืนยันการชำระอยู่ในแผงงวด) */}
      {sub === 0 ? (
        <div className="flex gap-2 mt-3 md:justify-between">
          <span className="hidden md:block md:w-64" />
          <button type="button" disabled={picking} onClick={() => go(1)} className={NEXT_BTN}>
            ถัดไป
            <ChevronRightIcon className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2 mt-3 md:justify-between">
          <button type="button" onClick={() => go(0)} className={BACK_BTN}>
            <ChevronLeftIcon className="w-4 h-4" strokeWidth={2} />
            ย้อนกลับ
          </button>
        </div>
      )}

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
      {rejecting && (
        <ModalBase title="ไม่อนุมัติสลิปค่าบริการ" size="md" onClose={() => setRejecting(null)}
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setRejecting(null)}
                className="h-9 px-4 rounded-lg text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50">ยกเลิก</button>
              <button type="button" disabled={!rejecting.reason.trim() || busy} onClick={() => account("reject", rejecting.reason.trim())}
                className="h-9 px-4 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">ส่งกลับ</button>
            </div>
          }>
          <p className="text-xs text-gray-600">สลิปนี้จะถูกเอาออก Sale ต้องแนบใหม่ กรุณาระบุเหตุผล</p>
          <label className="block text-xs font-semibold text-gray-700 mt-4 mb-1">เหตุผล <span className="text-red-500">*</span></label>
          <textarea value={rejecting.reason} onChange={(e) => setRejecting({ ...rejecting, reason: e.target.value })} rows={3} autoFocus maxLength={300}
            placeholder="เช่น ยอดในสลิปไม่ตรง / สลิปไม่ชัด / ยังไม่พบเงินเข้าบัญชี"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-red-400 resize-none" />
        </ModalBase>
      )}
    </StepLayout>
  );
}
