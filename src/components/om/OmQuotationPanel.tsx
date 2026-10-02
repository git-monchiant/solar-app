"use client";

// ขั้น 02 เสนอราคา ของหน้ารายละเอียดงานบริการ (แผน docs/plan/20260924-02 เฟส 2)
// ★ ใบอยู่ตาราง quotations ของฝั่งขาย (ผูก om_booking_id) — ข้อมูลเล็กกว่า QuotationBuilder ของฝั่งขายมาก
//   เพราะงาน O&M มีแค่ Package O&M 1 ตัว + รายการเพิ่ม + ส่วนลด ไม่มีอุปกรณ์ / งวดหลายงวด
//   ยอดเงินคิดที่ server ด้วย calculateQuotation ตัวเดียวกับฝั่งขาย — ตัวเลขในฟอร์มเป็นแค่พรีวิว
// ★ ออก/แก้ได้เฉพาะ Sale (ผู้ใช้เคาะ 24 ก.ย. ข้อ 3) · ส่งอนุมัติ Solar Sup → Sale Sup เป็นเฟส 3
// ★ หน้าตายกจาก QuotationBuilder ฝั่งขาย (แผน 20261002-01): การ์ดใบ + ราง ApprovalFlowStatus + ปุ่มยาวไล่สี
//   + ตัวแก้ใบเป็น popup ซ้ายรายการ/ขวาการเงิน · ของเดิม (ฟอร์มกางในการ์ด) อยู่ commit 6864437
// ★ ชุด 1–3 ต่อใบงานแบบฝั่งขาย (แผน 20261002-02) · ใบของใบงานที่ขั้นถัดไปใช้ = ใบที่ลูกค้าเลือก (sent_to_customer_at)
// ★ ไปขั้นถัดไปด้วยปุ่มยาวใต้การ์ด "▷ ส่งใบเสนอราคาให้ทีมขาย" แบบฝั่งขาย (แผน 20261002-09)
//   การ์ดอนุมัติแล้วเหลือ ดูใบเสนอราคา + Revision
// ★ ลูกค้าเลือกชุดที่ขั้นชำระเงิน แบบขั้น Order ฝั่งขาย (แผน 20261002-10 · OmPaymentPanel)
//   ปุ่มยาว = /send ของชุดแรก → ใบงานไปขั้นชำระเงิน ชุดแรกเป็นชุดที่เลือกไว้ก่อน (ฝั่งขายเลือกใบแรกให้เองเหมือนกัน)

import { type MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatTHB, formatThaiDateShort, formatThaiTime } from "@/lib/utils/formatters";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { useDialog } from "@/components/ui/Dialog";
import ModalBase from "@/components/ui/ModalBase";
import { ApprovalFlowStatus } from "@/components/lead/detail/steps/QuotationBuilder";
import QuotationTermsEditor from "@/components/lead/detail/steps/QuotationTermsEditor";
import { OM_TERMS_NO_SALES_OM, OM_TERMS_PROFILE, omTermTree } from "@/lib/om/om-terms";
import type { QuotationTermTree } from "@/lib/quotation-terms";
import type { Item } from "@/lib/om/service-view";

type Pkg = {
  id: number; kw_min: number; kw_max: number; max_panels: number | null;
  plan_type: "per_visit" | "contract"; contract_months: number | null; visits: number | null;
  price: number; scope: string | null;
};
type Line = { item_name: string; quantity: number; unit: string; unit_price: number };
export type Quote = {
  id: number; doc_no: string; option_no: number; revision_no: number; status: string; om_package_id: number | null;
  /** lead ของบ้าน — Ref1 ของ Thai QR ขั้นชำระเงิน (แผน 20261002-11) */
  lead_id: number;
  package_name_snapshot: string; package_price_snapshot: number; subtotal_incl_vat: number;
  discount_value: number; discount_amount: number; discount_reason: string | null;
  contract_total_incl_vat: number; amount_before_vat: number; vat_amount: number;
  terms_text: string | null; note: string | null; created_at: string; created_by_name: string | null;
  /** source_type custom = หัวข้องานเพิ่ม · custom_detail = รายละเอียดใต้หัวข้อก่อนหน้า (ก่อนหัวข้อแรก = ของแพ็กเกจ) */
  items: { id: number; source_type: string | null; item_name: string; quantity: number; unit: string | null; unit_price: number; line_total: number }[];
  // ลำดับอนุมัติ (เฟส 3) — ชุดเดียวกับการ์ดฝั่งขาย
  submitted_at: string | null; submitted_by_name: string | null;
  solar_approved_at: string | null; solar_approved_by_name: string | null;
  approved_at: string | null; approved_by_name: string | null; approval_note: string | null;
  returned_by_name: string | null; returned_by_role: string | null;
  /** ลูกค้าเลือกใบนี้ (/send จดเวลาไว้) — ใบของใบงานที่ขั้นชำระเงินใช้ */
  sent_to_customer_at: string | null;
  /** ใบล่าสุดของชุดเดียวกัน — สร้าง Revision / ลูกค้าเลือกได้เฉพาะใบล่าสุดของชุด */
  latest_id: number;
  /** วันที่ใบเสนอราคา / อายุใบ (วัน) — ช่องวันที่ + แท็บเงื่อนไขใน popup (แผน 20261002-04) */
  issue_date: string | null; valid_days: number | null;
  /** เงื่อนไข/ข้อกำหนดที่แก้ไว้ในใบ (แผน 20261002-07) — null = ใช้ชุดจาก Package O&M */
  terms: QuotationTermTree | null;
};

// เปิด PDF ตรง ๆ (ไม่ใช่ blob) ให้ชื่อไฟล์จาก server ติดไปถึงปุ่มดาวน์โหลด — แบบเดียวกับหน้าคิวอนุมัติ
// ★ export ให้ปุ่มเอกสารในบรรทัดสรุปขั้นเสนอราคาที่ปิดแล้ว (JobDetail · แผน 20260929-02) ใช้ตัวเดียวกัน
export const openQuotationPdf = (id: number) => {
  const uid = typeof window !== "undefined" ? window.localStorage.getItem("userId") : null;
  const url = `/api/quotation-pdf/${id}${uid ? `?user_id=${uid}` : ""}`;
  const tab = window.open(url, "_blank");
  if (tab) tab.opener = null;
  else window.location.href = url;
};

const EDITABLE = ["draft", "changes_required"];
const PENDING = ["pending_solar_sup", "pending_sales_sup", "pending_approval"];
/** ชุดต่อใบงาน — ค่าเดียวกับ OM_MAX_OPTIONS ใน lib/om/om-quotation.ts (ไฟล์นั้น server-only import ฝั่งนี้ไม่ได้) */
const OM_MAX_OPTIONS = 3;

/** ขนาดระบบรวมของบ้าน — kwp_list มาเป็น "5.00" หรือ "3.00 + 2.00" (บ้านที่ติดตั้งหลายชุด) */
const houseKw = (kwpList: string | null) =>
  (kwpList ?? "").split("+").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x)).reduce((a, b) => a + b, 0);

const tierLabel = (p: Pkg) => `${p.kw_min.toFixed(2)}–${p.kw_max.toFixed(2)} kW`;
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
  // ผู้อนุมัติกดที่การ์ดได้เหมือนฝั่งขาย (คิว /quotation-approvals ยังใช้ได้ตามเดิม)
  const canReview = (status: string) =>
    status === "pending_solar_sup"
      ? hasRole(activeRoles, "admin", "solar_sup")
      : ["pending_sales_sup", "pending_approval"].includes(status) && hasRole(activeRoles, "admin", "sales_sup");
  // ทุกใบของใบงาน (ทุกชุด ทุก Revision) — ผูกเลขใบงานไว้ กันโชว์ใบของบ้านก่อนหน้าค้างตอนเปลี่ยนบ้าน
  const [list, setList] = useState<{ bookingId: number; quotes: Quote[] } | null>(null);
  // popup ตัวแก้ใบ: option = ชุดที่แก้/สร้าง · quote = ใบที่แก้ (null = ใบใหม่)
  // · fresh = ใบงานยกเลิก/จบแล้ว ออกใบของงานถัดไป = ใบงานใหม่ (ไม่แก้ใบเดิม)
  const [editor, setEditor] = useState<{ option: number; quote: Quote | null; fresh?: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [actErr, setActErr] = useState("");
  const [busy, setBusy] = useState(false);
  // popup ส่งกลับให้แก้ไข — null = ปิด
  const [returning, setReturning] = useState<{ quote: Quote; note: string } | null>(null);
  // "บันทึกถึงฝ่ายขาย" ใต้การ์ด แบบฝั่งขาย (แผน 20261002-03 · om_bookings.quote_note)
  // dirty = ผู้ใช้พิมพ์แล้ว — โหลดซ้ำหลังกดปุ่มต่าง ๆ จะไม่ทับสิ่งที่กำลังพิมพ์
  const [note, setNote] = useState<{ bookingId: number; text: string; dirty: boolean } | null>(null);
  const dialog = useDialog();

  const bookingId = item.booking_id;
  const load = useCallback(async () => {
    if (!bookingId) return;
    try {
      const d = await apiFetch(`/api/om/quotations?booking_id=${bookingId}`);
      setList({ bookingId, quotes: d.quotes });
      setNote((cur) => (cur && cur.bookingId === bookingId && cur.dirty ? cur
        : { bookingId, text: d.quote_note ?? "", dirty: false }));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [bookingId]);
  // โหลดใหม่เมื่อใบงานขยับ (ส่งอนุมัติ/อนุมัติจากที่อื่น เช่นคิวอนุมัติ แล้วหน้ารายละเอียดรีโหลด)
  useEffect(() => { load(); }, [load, item.q_id, item.q_status, item.job_status]);
  const quotes = list && list.bookingId === bookingId ? list.quotes : null;

  // บันทึกอัตโนมัติเมื่อหยุดพิมพ์ 600ms — แบบ quotation_note ของ QuoteStep ฝั่งขาย
  useEffect(() => {
    if (!note?.dirty) return;
    const t = setTimeout(() => {
      apiFetch(`/api/om/bookings/${note.bookingId}/quote-note`, {
        method: "PUT", body: JSON.stringify({ note: note.text }),
      }).catch(console.error);
    }, 600);
    return () => clearTimeout(t);
  }, [note]);
  const noteText = note && note.bookingId === bookingId ? note.text : "";

  // ใบล่าสุดของแต่ละชุด แบบ latest ของฝั่งขาย — ไม่นับใบยกเลิก ยกเว้นใบงานยกเลิกทั้งใบ (ให้เห็นว่าใบไหนถูกยกเลิก)
  const latest = useMemo(() => {
    const m = new Map<number, Quote>();
    for (const q of quotes ?? []) {   // API เรียง ชุด → Revision ใหม่สุดก่อน
      if (q.status === "cancelled" && item.job_status !== "cancelled") continue;
      if (!m.has(q.option_no)) m.set(q.option_no, q);
    }
    return m;
  }, [quotes, item.job_status]);
  const current = [...latest.values()];
  const chosen = current.find((q) => q.sent_to_customer_at) ?? null;
  const readyQuotes = canIssue ? current.filter((q) => EDITABLE.includes(q.status)) : [];
  const pendingCount = current.filter((q) => PENDING.includes(q.status)).length;
  const allApproved = current.length > 0 && current.every((q) => q.status === "approved");
  const atQuote = item.job_status === "quote";
  // เพิ่มชุดได้ตอนยังไม่มีใบงาน / ติดตาม / เสนอราคา และลูกค้ายังไม่เลือก — เลยขั้นนี้แล้วเหลือแค่การ์ดที่มี
  const canCreate = canIssue && !chosen && (!bookingId || item.job_status === "follow" || atQuote);
  // อนุมัติครบ ส่งต่อขั้นชำระเงินได้ — ไม่ใช่ Sale เห็นปุ่มจาง (API กันอีกชั้น)
  const canHandoff = canIssue && allApproved && atQuote && !chosen;

  const done = (msg: string) => { onSaved(msg); load(); onReload?.(); };
  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setActErr("");
    try { done(await fn()); } catch (e) { setActErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  /** ปุ่มยาว "ส่งใบเสนอราคาให้ทีมขาย" → ใบงานไปขั้นชำระเงิน (แผน 20261002-10)
   *  ไม่มี dialog ยืนยัน แบบ handoff_to_sales ฝั่งขาย · /send ของชุดแรก = ชุดที่เลือกไว้ก่อน เปลี่ยนได้ที่ขั้น 03 */
  const handoff = () => {
    const first = [...current].sort((a, b) => a.option_no - b.option_no)[0];
    if (!first) return;
    run(async () => {
      await apiFetch(`/api/om/quotations/${first.id}/send`, { method: "POST" });
      return current.length > 1 ? "ส่งใบเสนอราคาให้ทีมขายแล้ว — เลือกชุดที่ลูกค้ารับที่ขั้น 03" : "ส่งใบเสนอราคาให้ทีมขายแล้ว — รอชำระเงิน";
    });
  };

  /** อนุมัติ / ส่งกลับ / สร้าง Revision — endpoint ลำดับอนุมัติตัวเดียวกับฝั่งขาย (แยกทาง O&M ข้างในเอง) */
  const act = async (q: Quote, action: "revise" | "approve" | "changes_required", note = "") => {
    if (action !== "changes_required") {
      const ok = await dialog.confirm(action === "approve"
        ? { title: "ยืนยันการอนุมัติ", variant: "success", confirmText: "อนุมัติ",
            message: q.status === "pending_solar_sup"
              ? "ยืนยันว่า Solar Manager ตรวจเอกสารแล้ว และส่งต่อให้ Sale Manager อนุมัติขั้นสุดท้าย"
              : "ยืนยันว่าได้ตรวจสอบ Package O&M ราคา และส่วนลดของใบนี้แล้ว" }
        : { title: "สร้าง Revision ใหม่", confirmText: "สร้าง Revision",
            message: `คัดลอก ${q.doc_no} เป็นใบร่างเลขที่ใหม่ แก้แล้วต้องส่งอนุมัติใหม่ทั้งสองขั้น` });
      if (!ok) return;
    }
    run(async () => {
      await apiFetch(`/api/quotations/${q.id}/action`, { method: "POST",
        body: JSON.stringify({ action, note, certify: action === "approve" }) });
      return action === "approve" ? `อนุมัติ ${q.doc_no} แล้ว`
        : action === "changes_required" ? `ส่ง ${q.doc_no} กลับให้แก้ไขแล้ว`
          : `สร้าง Revision จาก ${q.doc_no} แล้ว`;
    });
  };

  /** ส่งขออนุมัติทุกฉบับที่ร่าง/ถูกส่งกลับ ทีเดียว — แบบปุ่มยาวของฝั่งขาย */
  const submitAll = async () => {
    const ok = await dialog.confirm({ title: "ส่งใบเสนอราคาขออนุมัติ", confirmText: "ส่งอนุมัติ",
      message: `ส่ง ${readyQuotes.map((q) => q.doc_no).join(", ")} ให้ Solar Manager ตรวจ แล้วต่อ Sale Manager · ระหว่างรออนุมัติแก้ใบไม่ได้ จนกว่าผู้อนุมัติจะส่งกลับ` });
    if (!ok) return;
    run(async () => {
      for (const q of readyQuotes)
        await apiFetch(`/api/quotations/${q.id}/action`, { method: "POST", body: JSON.stringify({ action: "submit" }) });
      return `ส่ง ${readyQuotes.length} ฉบับให้ Solar Manager อนุมัติแล้ว`;
    });
  };

  const remove = async (q: Quote) => {
    const ok = await dialog.confirm({ title: "ลบฉบับร่าง", variant: "danger", confirmText: "ลบ",
      message: `ลบใบเสนอราคาฉบับร่าง ${q.doc_no} (ชุด ${q.option_no}) ถาวร? กู้คืนไม่ได้` });
    if (!ok) return;
    run(async () => {
      await apiFetch(`/api/om/quotations/${q.id}`, { method: "DELETE" });
      return `ลบฉบับร่าง ${q.doc_no} แล้ว`;
    });
  };

  const isRepair = item.service_code === "repair";
  const editorEl = editor && (
    // ใบของงานถัดไป — POST /api/om/quotations สร้างใบงานล้างแผงใหม่เสมอ ไม่ใช่ชนิดของใบงานล่าสุด (อาจเป็นซ่อม)
    <QuoteEditor item={editor.fresh ? { ...item, service_code: "cleaning" } : item}
      optionNo={editor.option} quote={editor.quote}
      onClose={() => setEditor(null)}
      onDone={(msg) => { setEditor(null); done(msg); }} />
  );

  // ★ งานล่าสุดจบแล้ว + บ้านสิทธิ์ล้างหมด = งานถัดไปต้องเสนอราคา (ผู้ใช้เคาะ 28 ก.ย. 69 ปิดทางลัดตกลงนัดตรง)
  //   ต้องมีทางออกใบให้งานถัดไปจากตรงนี้ ไม่งั้นบ้านที่งานล่าสุดใช้สิทธิ์ฟรีจะเจอแค่ "ข้ามขั้น" นัดก็ไม่ได้
  const finished = item.job_status === "closed" || item.job_status === "cancelled" || item.job_status === "no_show";
  const nextNeedsQuote = finished && item.balance <= 0;
  const nextQuoteBtn = canIssue
    ? <button type="button" style={{ minHeight: 0 }} onClick={() => setEditor({ option: 1, quote: null, fresh: true })}
        className="ml-auto h-8 px-3.5 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer">ออกใบเสนอราคางานถัดไป</button>
    : <b className="ml-auto text-xs">รอ Sale ออกใบ</b>;

  if (skip && !item.q_id) {
    if (nextNeedsQuote) {
      return (
        <div className="text-sm text-gray-600 leading-relaxed flex items-center gap-2 flex-wrap">
          <span>งานล่าสุด<b>ใช้สิทธิ์ฟรี</b>และจบแล้ว · บ้านนี้<b>สิทธิ์ล้างหมด</b> งานถัดไปต้องออกใบเสนอราคาก่อนนัด</span>
          {nextQuoteBtn}
          {editorEl}
        </div>
      );
    }
    return <div className="text-sm text-gray-600">งานนี้<b>ใช้สิทธิ์ฟรี</b> — ข้ามขั้นเสนอราคา</div>;
  }
  if (err) return <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{err}</div>;

  if (!item.q_id && !canIssue) {
    return (
      <div className="text-sm text-gray-600 leading-relaxed">
        {isRepair
          ? <>งาน<b>ซ่อมนอกประกัน</b>ต้องมีใบเสนอราคา</>
          : <>บ้านนี้<b>สิทธิ์หมดแล้ว</b> งานถัดไปต้องมีใบเสนอราคา</>} — <b>รอ Sale ออกใบ</b>
        <div className="mt-1 text-xs text-gray-400">ใบเสนอราคา O&amp;M ออกได้เฉพาะ Sale</div>
      </div>
    );
  }

  const loading = !!bookingId && !quotes;
  const slots = Array.from({ length: OM_MAX_OPTIONS }, (_, i) => i + 1)
    .filter((n) => latest.has(n) || canCreate);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
          ใบเสนอราคา{" "}
          <span className="font-normal normal-case text-gray-400">
            (สูงสุด {OM_MAX_OPTIONS} ฉบับ — ลูกค้าจะเลือก 1 ฉบับในขั้นชำระเงิน)
          </span>{" "}
          <span className="text-red-500">*</span>
        </div>
        <div className="hidden md:block text-xxs text-gray-400 text-right">อนุมัติให้ครบทุกฉบับ แล้วส่งให้ทีมขายเลือกในขั้น 03 · ชำระเต็มจำนวนก่อนวันนัดหมาย</div>
      </div>

      {actErr && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{actErr}</div>}

      {item.job_status === "cancelled" && current.length > 0 && (
        <div className="rounded-xl bg-gray-50 border border-gray-200 px-3.5 py-2.5 text-sm text-gray-600 flex items-center gap-2 flex-wrap">
          <span>ลูกค้าไม่เอา — ใบงาน #{item.booking_id} และใบเสนอราคาของใบงานนี้<b>ยกเลิกแล้ว</b></span>
          {canIssue && (
            <button type="button" style={{ minHeight: 0 }} onClick={() => setEditor({ option: 1, quote: null, fresh: true })}
              className="ml-auto h-8 px-3.5 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer">ลูกค้าเปลี่ยนใจ? ออกใบเสนอราคาใหม่</button>
          )}
        </div>
      )}
      {/* ใบของงานที่ปิดไปแล้ว — บ้านสิทธิ์หมด งานถัดไปต้องมีใบใหม่ (ใบเดิมแก้ไม่ได้แล้ว) */}
      {item.job_status === "closed" && nextNeedsQuote && current.length > 0 && (
        <div className="rounded-xl bg-gray-50 border border-gray-200 px-3.5 py-2.5 text-sm text-gray-600 flex items-center gap-2 flex-wrap">
          <span>ใบนี้เป็นของใบงาน #{item.booking_id} ที่ปิดแล้ว · บ้านนี้<b>สิทธิ์ล้างหมด</b> งานถัดไปต้องออกใบใหม่</span>
          {nextQuoteBtn}
        </div>
      )}

      {!loading && slots.length === 0 ? (
        <div className="text-sm text-gray-500">ใบงานนี้ไม่มีใบเสนอราคา</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {loading
            ? Array.from({ length: canCreate ? OM_MAX_OPTIONS : 1 }, (_, i) => (
                <div key={`skeleton-${i}`} className="rounded-xl border border-gray-200 bg-white p-4 min-h-[342px] flex flex-col shadow-sm animate-pulse">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-200 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-14 rounded bg-gray-200" />
                      <div className="h-2 w-24 rounded bg-gray-100" />
                    </div>
                  </div>
                  <div className="mt-4 h-20 rounded-xl bg-gray-100" />
                  <div className="mt-auto pt-4 flex items-center justify-between">
                    <div className="h-3 w-16 rounded bg-gray-100" />
                    <div className="h-6 w-24 rounded bg-gray-200" />
                  </div>
                  <div className="mt-3 h-9 rounded-lg bg-gray-100" />
                </div>
              ))
            : slots.map((n) => {
                const q = latest.get(n);
                if (!q) return (
                  <article key={n} className="rounded-xl border border-dashed border-violet-300 bg-white/40 min-h-[342px] p-5 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center text-4xl font-light">+</div>
                    <h3 className="mt-3 text-base font-bold text-gray-900">สร้างใบเสนอราคาชุดที่ {n}</h3>
                    <p className="mt-1 text-xs text-gray-400">เลือกแพ็กเกจหลักและรายการอื่นสำหรับใบเสนอราคาชุดนี้</p>
                    <button type="button" onClick={() => setEditor({ option: n, quote: null })}
                      className="mt-5 h-10 px-5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold cursor-pointer">
                      + สร้างใบเสนอราคา
                    </button>
                  </article>
                );
                const latestOfOption = q.latest_id === q.id;
                return (
                  <QuoteCard key={n} quote={q} busy={busy}
                    chosen={chosen?.id === q.id} dimmed={!!chosen && chosen.id !== q.id}
                    canEdit={canIssue && EDITABLE.includes(q.status)}
                    canDelete={canIssue && q.status === "draft" && atQuote}
                    canReview={PENDING.includes(q.status) && canReview(q.status)}
                    canRevise={canIssue && q.status === "approved" && latestOfOption && atQuote && !chosen}
                    onEdit={() => setEditor({ option: n, quote: q })}
                    onDelete={() => remove(q)}
                    onReturn={() => setReturning({ quote: q, note: "" })}
                    onApprove={() => act(q, "approve")}
                    onRevise={() => act(q, "revise")} />
                );
              })}
        </div>
      )}

      {/* บันทึกถึงฝ่ายขาย — ยกจาก QuotationBuilder ฝั่งขาย · ขั้นนี้ปิดแล้ว (ลูกค้าเลือกชุดแล้ว) = อ่านอย่างเดียว */}
      {!chosen ? (
        <div>
          <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1" htmlFor="om-quote-note">
            บันทึกถึงฝ่ายขาย
          </label>
          <textarea id="om-quote-note"
            value={noteText}
            disabled={!bookingId}
            onChange={(e) => bookingId && setNote({ bookingId, text: e.target.value, dirty: true })}
            placeholder={bookingId ? "รายละเอียดใบเสนอราคา, หมายเหตุ..." : "บันทึกได้หลังสร้างใบเสนอราคาชุดแรก"}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary resize-none disabled:bg-gray-50"
          />
        </div>
      ) : noteText.trim() ? (
        <div>
          <div className="text-xs font-semibold tracking-wider uppercase text-gray-400 mb-1">บันทึกถึงฝ่ายขาย</div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 whitespace-pre-wrap">{noteText}</div>
        </div>
      ) : null}

      {/* ปุ่มยาวใต้การ์ด — แบบ "▷ ส่งขออนุมัติใบเสนอราคา / รออนุมัติ a/b ฉบับ / ▷ ส่งใบเสนอราคาให้ทีมขาย" ของฝั่งขาย
          อนุมัติครบแล้ว = ปุ่มไปขั้นชำระเงิน (แทน "✓ ลูกค้าเลือก" ในการ์ดเดิม · แผน 20261002-09) */}
      {/* คำบนปุ่มตามฝั่งขายเป๊ะ (ผู้ใช้สั่ง 2 ต.ค. 69) · ไม่ใช่ Sale = ปุ่มจางกดไม่ได้ */}
      {allApproved && atQuote && !chosen ? (
        <button type="button" disabled={busy || !canHandoff} onClick={handoff}
          className="w-full h-11 rounded-lg bg-gradient-to-r from-primary to-cyan-500 text-white text-sm font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-40">
          ▷ ส่งใบเสนอราคาให้ทีมขาย
        </button>
      ) : readyQuotes.length > 0 ? (
        <button type="button" disabled={busy} onClick={submitAll}
          className="w-full h-11 rounded-lg bg-gradient-to-r from-primary to-cyan-500 text-white text-sm font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? "กำลังส่ง…" : `▷ ส่งขออนุมัติใบเสนอราคา${readyQuotes.length > 1 ? ` ${readyQuotes.length} ฉบับ` : ""}`}
        </button>
      ) : pendingCount > 0 ? (
        <button type="button" disabled
          className="w-full h-11 rounded-lg bg-gradient-to-r from-primary to-cyan-500 text-white text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
          รออนุมัติใบเสนอราคา {current.filter((q) => q.status === "approved").length}/{current.length} ฉบับ
        </button>
      ) : chosen && item.job_status === "payment" ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-800">
          ส่งใบเสนอราคาให้ทีมขายแล้ว · เลือกอยู่<b> ชุด {chosen.option_no}</b> ({chosen.doc_no})
          — เลือกชุดที่ลูกค้ารับและ<b>รับชำระเงินก่อนนัด</b> ที่ขั้น 03
        </div>
      ) : null}

      {editorEl}
      {returning && (
        <ModalBase title="ส่งกลับให้แก้ไข" size="md" onClose={() => setReturning(null)}
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setReturning(null)}
                className="h-9 px-4 rounded-lg text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
                ยกเลิก
              </button>
              <button type="button" disabled={!returning.note.trim() || busy}
                onClick={() => { const { quote: q, note } = returning; setReturning(null); act(q, "changes_required", note.trim()); }}
                className="h-9 px-4 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
                ส่งกลับ
              </button>
            </div>
          }>
          <p className="text-xs text-gray-600">ใบเสนอราคา {returning.quote.doc_no} จะถูกส่งกลับให้ผู้จัดทำแก้ไข กรุณาระบุเหตุผล</p>
          <label className="block text-xs font-semibold text-gray-700 mt-4 mb-1">
            เหตุผล <span className="text-red-500">*</span>
          </label>
          <textarea value={returning.note} onChange={(e) => setReturning({ ...returning, note: e.target.value })} rows={3} autoFocus
            placeholder="เช่น ราคาไม่ถูกต้อง / ส่วนลดเกินที่ตกลง"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-red-400 resize-none" />
        </ModalBase>
      )}
    </div>
  );
}

/** การ์ดใบเสนอราคา 1 ชุด — ยกจากการ์ด "ชุด N" ของ QuotationBuilder ฝั่งขาย */
function QuoteCard({ quote: q, busy, chosen, dimmed, canEdit, canDelete, canReview, canRevise,
  onEdit, onDelete, onReturn, onApprove, onRevise }: {
  quote: Quote; busy: boolean;
  /** ชุดที่เลือกอยู่ (เลือก/เปลี่ยนที่ขั้นชำระเงิน · แผน 20261002-10) · dimmed = เลือกชุดอื่นอยู่ */
  chosen: boolean; dimmed: boolean;
  canEdit: boolean; canDelete: boolean; canReview: boolean; canRevise: boolean;
  onEdit: () => void; onDelete: () => void; onReturn: () => void; onApprove: () => void;
  onRevise: () => void;
}) {
  const pkgPrice = Number(q.package_price_snapshot);
  const extras = q.items.filter((x) => x.source_type !== "custom_detail");
  const view = (span: string) => (
    <button type="button" onClick={() => openQuotationPdf(q.id)}
      className={`${span} h-full rounded-lg border border-gray-200 px-2 text-xs font-semibold leading-4 cursor-pointer`}>
      ▣ ดูใบเสนอราคา
    </button>
  );
  return (
    <article className={`rounded-xl border p-4 min-h-[342px] flex flex-col shadow-sm ${
      chosen ? "border-emerald-400 bg-emerald-50/40" : "border-gray-200 bg-white"} ${dimmed ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        {/* กว้าง 100px เท่าการ์ดฝั่งขาย (ผู้ใช้ขอให้เหมือน 2 ต.ค. 69) — เลขใบ O&M ยาวกว่า (SSR-OM-QT-26-0004)
            ⇒ ไม่ตัดท้าย ให้ขึ้นบรรทัดใหม่ตรงขีดแทน ราง Sale → Manager ไม่ถูกบีบ */}
        <div className="w-[100px] shrink-0 overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-cyan-400 text-white flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12l4 4L19 6" />
              </svg>
            </div>
            <div className="whitespace-nowrap font-bold text-sm text-gray-900">ชุด {q.option_no}</div>
          </div>
          <div className="mt-1 text-center font-mono text-xxs text-gray-400"
            title={`${q.doc_no}${q.revision_no > 0 ? ` · Rev.${q.revision_no}` : ""}`}>
            {q.doc_no}{q.revision_no > 0 ? ` · Rev.${q.revision_no}` : ""}
          </div>
          {chosen && (
            <div className="mt-1 text-center">
              <span className="text-xxs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">เลือกแล้ว</span>
            </div>
          )}
        </div>
        <ApprovalFlowStatus
          status={q.status}
          returnedByRole={q.returned_by_role ?? undefined}
          submittedByName={q.submitted_by_name ?? undefined}
          submittedAt={q.submitted_at ?? undefined}
          solarApprovedByName={q.solar_approved_by_name ?? undefined}
          solarApprovedAt={q.solar_approved_at ?? undefined}
          approvedByName={q.approved_by_name ?? undefined}
          approvedAt={q.approved_at ?? undefined}
        />
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
        <div className="text-xxs font-semibold text-gray-400">แพ็กเกจหลัก</div>
        <div className="mt-1 font-bold text-sm text-gray-900 break-words">
          {pkgPrice > 0 ? q.package_name_snapshot : "ไม่ใช้แพ็กเกจ — ใส่รายการเอง"}
        </div>
        <div className="mt-1 text-xxs text-gray-500">
          {pkgPrice > 0 ? `${formatTHB(pkgPrice)} บาท` : "งานซ่อม / งานเพิ่ม"}
          {Number(q.discount_amount) > 0 && <> · <span className="text-red-600">ส่วนลด −{formatTHB(Number(q.discount_amount))}</span></>}
        </div>
        {/* รายการเพิ่ม — บอกให้ครบว่าใบนี้มีอะไรบ้าง (เฉพาะหัวข้อ ไม่นับบรรทัดรายละเอียด แบบการ์ดฝั่งขาย) */}
        {extras.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200 space-y-0.5">
            <div className="text-xxs font-semibold text-gray-400">รายการเสริม ({extras.length})</div>
            {extras.map((x) => (
              <div key={x.id} className="text-xxs text-gray-600 break-words">
                + {x.item_name} {Number(x.quantity)} {x.unit ?? ""}
              </div>
            ))}
          </div>
        )}
      </div>

      {q.created_by_name && (
        <div className="mt-2 text-xxs text-gray-500 break-words">
          ผู้จัดทำ: {q.created_by_name}
          {q.created_at ? ` · ${formatThaiDateShort(q.created_at)} ${formatThaiTime(q.created_at)} น.` : ""}
        </div>
      )}
      {q.note && <div className="mt-1 text-xxs text-gray-500 break-words">โน้ต: {q.note}</div>}
      {q.status === "changes_required" && q.approval_note && (
        <div className="mt-2 text-xs text-red-600 line-clamp-2">
          ส่งกลับโดย {q.returned_by_role || "ผู้อนุมัติ"}
          {q.returned_by_name ? ` (${q.returned_by_name})` : ""}: {q.approval_note}
        </div>
      )}

      <div className="mt-auto pt-4 flex items-end justify-between">
        <span className="text-xxs text-gray-400">ยอดที่ต้องชำระ</span>
        <div className="text-right">
          <b className="text-xl text-gray-900 tabular-nums">{formatTHB(Number(q.contract_total_incl_vat))}</b>{" "}
          <span className="text-xxs font-semibold">บาท</span>
        </div>
      </div>

      <div className="mt-3 grid h-14 grid-cols-3 gap-2">
        {canEdit ? (
          <div className="col-span-3 flex h-full gap-2">
            <button type="button" onClick={onEdit}
              className="h-full px-3 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 text-xs font-semibold whitespace-nowrap cursor-pointer">
              ✎ แก้ไข
            </button>
            {view("flex-1")}
            {canDelete && (
              <button type="button" disabled={busy} onClick={onDelete} aria-label="ลบฉบับร่าง" title="ลบฉบับร่าง"
                className="h-full px-3 shrink-0 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                </svg>
              </button>
            )}
          </div>
        ) : canReview ? (
          <>
            {view("")}
            <button type="button" disabled={busy} onClick={onReturn}
              className="h-full rounded-lg bg-red-50 px-2 text-red-700 text-xs font-semibold leading-4 cursor-pointer disabled:opacity-50">
              ส่งกลับ
            </button>
            <button type="button" disabled={busy} onClick={onApprove}
              className="h-full rounded-lg bg-emerald-600 px-2 text-white text-xs font-semibold leading-4 cursor-pointer disabled:opacity-50">
              {q.status === "pending_solar_sup" ? "อนุมัติส่งต่อ" : "อนุมัติ"}
            </button>
          </>
        ) : canRevise ? (
          <>
            {view("col-span-2")}
            <button type="button" disabled={busy} onClick={onRevise}
              className="h-full rounded-lg border border-gray-200 px-2 text-xs font-semibold leading-4 cursor-pointer disabled:opacity-50">
              Revision
            </button>
          </>
        ) : view("col-span-3")}
      </div>
    </article>
  );
}

// วันนี้ตามเวลาเครื่อง YYYY-MM-DD (ไม่ใช้ toISOString — ช่วงค่ำของ +07:00 จะเลื่อนไปวันถัดไป) — แบบ todayIso ฝั่งขาย
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
let lineSeq = 0;
const lineKey = () => `l${++lineSeq}`;

// ── รายละเอียดใต้หัวข้อ (แผน 20261002-05 · แบบ "รายละเอียด" ของ QuotationEditor ฝั่งขาย) ──
// ชื่อ/จำนวน/หน่วย ไม่มีราคา · เก็บเป็น quotation_items source_type custom_detail ต่อท้ายหัวข้อของตัวเอง
// แพ็กเกจไม่ได้เก็บเป็นแถว ⇒ รายละเอียดที่อยู่ก่อนหัวข้องานเพิ่มตัวแรก = รายละเอียดของแพ็กเกจ
type Detail = { key: string; item_name: string; quantity: number; unit: string };
type Head = Line & { key: string; details: Detail[] };

/** แยกรายการของใบที่เก็บไว้ → รายละเอียดของแพ็กเกจ + หัวข้องานเพิ่ม (พร้อมรายละเอียดของแต่ละหัวข้อ) */
const splitItems = (items: Quote["items"]) => {
  const pkg: Detail[] = [];
  const heads: Head[] = [];
  for (const x of items) {
    if (x.source_type === "custom_detail") {
      const d = { key: lineKey(), item_name: x.item_name, quantity: Number(x.quantity), unit: x.unit ?? "" };
      if (heads.length) heads[heads.length - 1].details.push(d);
      else pkg.push(d);
    } else {
      heads.push({ key: lineKey(), item_name: x.item_name, quantity: Number(x.quantity), unit: x.unit ?? "",
        unit_price: Number(x.unit_price), details: [] });
    }
  }
  return { pkg, heads };
};

/** รายละเอียดตั้งต้นของแพ็กเกจ = ขอบเขตงานใน Package O&M ("ล้างแผง+ตรวจสอบระบบ+…" → บรรทัดละข้อ)
 *  แทนรายการอุปกรณ์จาก Package Master ของฝั่งขาย · หน่วยว่าง ⇒ ใบพิมพ์แค่ "- ชื่อ" */
const scopeDetails = (p: Pkg | null): Detail[] =>
  (p?.scope ?? "").split(/[+\n]/).map((x) => x.trim()).filter(Boolean)
    .map((name) => ({ key: lineKey(), item_name: name, quantity: 1, unit: "" }));

const CELL =
  "h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-xxs text-gray-700 outline-none transition-colors placeholder:text-gray-300 hover:border-gray-200 focus:border-primary focus:bg-white";

/** บรรทัดรายละเอียดใต้หัวข้อ + ปุ่ม "+ เพิ่มรายละเอียด" (+ "↺ คืนค่าจาก Master" ของแพ็กเกจ) — ยกจากฝั่งขาย
 *  ★ อยู่นอก QuoteEditor — ประกาศ component ข้างใน render จะ mount ใหม่ทุกครั้งที่พิมพ์ ช่องกรอกหลุดโฟกัส */
function DetailRows({ details, onChange, onRestore }: {
  details: Detail[];
  onChange: (next: Detail[]) => void;
  onRestore?: () => void;
}) {
  const patch = (key: string, p: Partial<Detail>) => onChange(details.map((d) => (d.key === key ? { ...d, ...p } : d)));
  return (
    <div className="border-t border-gray-100 pb-1">
      {details.map((d) => (
        <div key={d.key} className="group grid grid-cols-[minmax(0,1fr)_56px_72px_24px] items-center gap-1.5 py-0.5 pl-9 pr-2 hover:bg-primary/[0.03]">
          <div className="flex min-w-0 items-center gap-1.5">
            {/* จุดนำหน้า = บรรทัดรายการย่อยของหัวข้อด้านบน */}
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
            <input value={d.item_name} onChange={(e) => patch(d.key, { item_name: e.target.value })}
              placeholder="ชื่ออุปกรณ์/บริการ" aria-label="ชื่อรายละเอียด" className={CELL} />
          </div>
          {/* ลบจนหมดต้องเป็นช่องว่าง ไม่ใช่ 0 ค้าง ไม่งั้นพิมพ์ต่อได้ "010" */}
          <input type="number" min="0" value={d.quantity > 0 ? d.quantity : ""} aria-label="จำนวน"
            onChange={(e) => patch(d.key, { quantity: Number(e.target.value.replace(/^0+(?=\d)/, "")) || 0 })}
            className={`text-center ${CELL}`} />
          <input value={d.unit} onChange={(e) => patch(d.key, { unit: e.target.value })} placeholder="หน่วย" aria-label="หน่วย" className={CELL} />
          {/* จอใหญ่โผล่ตอนชี้แถว (แบบฝั่งขาย) · มือถือไม่มี hover ⇒ โชว์ตลอด */}
          <button type="button" onClick={() => onChange(details.filter((x) => x.key !== d.key))} aria-label="ลบรายละเอียด"
            className="flex h-6 w-6 items-center justify-center rounded text-gray-300 transition-all hover:bg-red-50 hover:text-red-600 focus:opacity-100 md:opacity-0 md:group-hover:opacity-100">
            ×
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 pl-9 pr-2 pt-1">
        <button type="button" onClick={() => onChange([...details, { key: lineKey(), item_name: "", quantity: 1, unit: "" }])}
          className="rounded-md px-2 py-1 text-xxs font-semibold text-primary transition-colors hover:bg-primary/10">
          + เพิ่มรายละเอียด
        </button>
        {onRestore && (
          <button type="button" onClick={onRestore}
            className="rounded-md px-2 py-1 text-xxs font-semibold text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
            ↺ คืนค่าจาก Master
          </button>
        )}
      </div>
    </div>
  );
}

/** ป๊อปอัปเลือก Package O&M — ยก PackagePickerDialog ของ QuotationBuilder ฝั่งขาย (ช่องค้นหา + จัดกลุ่ม) */
function PackagePickerDialog({ pkgs, kw, replacing, onPick, onClose }: {
  pkgs: Pkg[];
  /** ขนาดระบบของบ้าน — ป้าย "ตรงกับบ้านนี้" ที่กลุ่มช่วง kW */
  kw: number;
  /** ใบมีแพ็กเกจอยู่แล้ว — ใบ O&M มีแพ็กเกจได้ตัวเดียว เลือกใหม่ = แทนตัวเดิม */
  replacing: boolean;
  onPick: (id: number) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const groups = useMemo(() => {
    const m = new Map<string, Pkg[]>();
    for (const p of pkgs) {
      if (q && !`Package O&M ${tierLabel(p)} ${planLabel(p)} ${p.price} ${p.scope ?? ""}`.toLowerCase().includes(q)) continue;
      m.set(tierLabel(p), [...(m.get(tierLabel(p)) ?? []), p]);
    }
    return [...m.entries()];
  }, [pkgs, q]);
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-900/40 p-4 pt-[8vh] backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 p-3">
          <input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            placeholder="พิมพ์ค้นหาแพ็กเกจ เช่น 5 kW, รายครั้ง, สัญญา…"
            className="h-10 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          <button type="button" onClick={onClose} aria-label="ปิด"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            ×
          </button>
        </div>
        {replacing && (
          <div className="shrink-0 border-b border-amber-100 bg-amber-50 px-3 py-1.5 text-xxs text-amber-800">
            ใบเสนอราคา O&amp;M มีแพ็กเกจได้ 1 ตัว — เลือกใหม่จะแทนตัวเดิม
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {groups.map(([tier, ps]) => {
            const fits = kw > 0 && kw >= ps[0].kw_min && kw <= ps[0].kw_max;
            return (
              <div key={tier} className="border-t border-gray-100 first:border-t-0">
                <div className="sticky top-0 z-10 bg-gray-50/95 px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-gray-500 backdrop-blur">
                  ☀️ {tier}{fits && <span className="ml-1.5 normal-case text-primary-dark">· ตรงกับบ้านนี้</span>}
                </div>
                {ps.map((p) => (
                  <button key={p.id} type="button" onClick={() => onPick(p.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-primary/5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className="shrink-0 text-base">☀️</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-gray-800">Package O&amp;M {tier} · {planLabel(p)}</span>
                        <span className="text-xxs text-gray-400">{p.scope ? `ขอบเขตงาน: ${p.scope}` : planLabel(p)}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-gray-700">{formatTHB(p.price)}</span>
                  </button>
                ))}
              </div>
            );
          })}
          {!groups.length && (
            <div className="px-3 py-10 text-center text-xs text-gray-400">ไม่พบแพ็กเกจที่ตรงกับ “{filter}”</div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ตัวแก้ใบ — popup ยกจาก QuotationEditor ฝั่งขาย (แผน 20261002-04): แท็บรายการ / เงื่อนไข · ขวา = การเงิน งวด วันที่
 * · ล่าง = ยกเลิก / ดูตัวอย่าง / บันทึกฉบับร่าง
 * ★ ต่างจากฝั่งขายเท่าที่ข้อมูล O&M เป็น: แพ็กเกจได้ 1 ตัว (แถว 1 เสมอ) · งานเพิ่มมีจำนวน × ราคาต่อหน่วย
 *   · ทุกหัวข้อมีรายละเอียดเพิ่ม/ลด/แก้ได้ (แผน 20261002-05) — รายละเอียดตั้งต้นของแพ็กเกจ = ขอบเขตงาน
 *   · ไม่มีเงินจอง · งวดเดียวชำระเต็มก่อนนัด · เงื่อนไขอ่านอย่างเดียว (มาจาก Package O&M)
 */
function QuoteEditor({ item, optionNo, quote, onClose, onDone }: {
  item: Item;
  /** ชุดที่สร้าง/แก้ (1–3) */
  optionNo: number;
  quote: Quote | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [pkgId, setPkgId] = useState<number | null>(quote?.om_package_id ?? null);
  // accordion — กางได้ทีละหัวข้อ แบบฝั่งขาย · "pkg" = แถวแพ็กเกจ · อื่น ๆ = key ของหัวข้องานเพิ่ม
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (key: string) => setOpenKey((k) => (k === key ? null : key));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"items" | "terms">("items");
  // ใบงานซ่อม (เฟส 5) — ไม่มีแพ็กเกจล้างแผงมาเกี่ยว · เริ่มด้วยแถวค่าซ่อม 1 แถวให้ Sale ใส่ราคา
  const isRepair = item.service_code === "repair";
  const [pkgDetails, setPkgDetails] = useState<Detail[]>(() => (quote ? splitItems(quote.items).pkg : []));
  const [lines, setLines] = useState<Head[]>(() => quote
    ? splitItems(quote.items).heads
    : isRepair ? [{ key: lineKey(), item_name: "ค่าบริการซ่อม", quantity: 1, unit: "งาน", unit_price: 0, details: [] }] : []);
  // ส่วนลดพิมพ์ได้ทั้ง % และบาทแบบฝั่งขาย — ส่งเป็นบาทเสมอ (O&M เก็บส่วนลดเป็นบาท)
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState<number>(Number(quote?.discount_value ?? 0));
  // "ชื่อส่วนลด" = เหตุผลส่วนลดเดิม (บังคับเมื่อมีส่วนลด — Sale Sup ใช้ประกอบการอนุมัติ)
  const [reason, setReason] = useState(quote?.discount_reason ?? "");
  const [issueDate, setIssueDate] = useState(quote?.issue_date ? String(quote.issue_date).slice(0, 10) : todayIso());
  // เงื่อนไขที่แก้ในใบ — null = ยังไม่แก้ (ใช้ชุด Master ของแพ็กเกจที่เลือกอยู่ ตามแพ็กเกจไปเอง) · แบบ documentInputs.terms ฝั่งขาย
  const [terms, setTerms] = useState<QuotationTermTree | null>(quote?.terms ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const kw = houseKw(item.kwp_list);
  useEffect(() => {
    apiFetch("/api/om/packages").then((d) => {
      const list = (d.packages ?? []) as Pkg[];
      setPkgs(list);
      setNotes(((d.notes ?? []) as { body: string }[]).map((n) => String(n.body)));
      // ใบใหม่: เลือกแพ็กเกจรายครั้งของช่วงขนาดบ้านไว้ให้ก่อน (ยังเปลี่ยนได้) — ยกเว้นใบงานซ่อม
      if (!quote && kw > 0 && !isRepair) {
        const hit = list.find((p) => p.plan_type === "per_visit" && kw >= p.kw_min && kw <= p.kw_max);
        if (hit) { setPkgId(hit.id); setPkgDetails(scopeDetails(hit)); }
      }
    }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [quote, kw, isRepair]);

  const pkg = pkgs.find((p) => p.id === pkgId) ?? null;
  const subtotal = (pkg?.price ?? 0) + lines.reduce((s, x) => s + Math.max(0, x.quantity) * Math.max(0, x.unit_price), 0);
  const discountAmount = Math.round(Math.min(subtotal,
    discountType === "percent" ? (subtotal * Math.min(100, discountValue)) / 100 : discountValue) * 100) / 100;
  const discountPercent = subtotal > 0 ? Math.round((discountAmount / subtotal) * 10000) / 100 : 0;
  const total = Math.max(0, subtotal - discountAmount);
  const validDays = Number(quote?.valid_days) || 7;

  // ชุด Master ของแท็บเงื่อนไข = ขอบเขตงานของแพ็กเกจที่เลือก + หมายเหตุ Package O&M + อายุใบ (ชุดเดียวกับที่ server ใช้พิมพ์)
  // ★ useMemo — ตัวแก้เงื่อนไขใช้ identity ของ master เป็น dependency
  const scope = pkg?.scope ?? null;
  const masterTerms = useMemo(() => omTermTree(scope ? [scope] : [], notes), [scope, notes]);

  const setLine = (key: string, patch: Partial<Head>) => setLines((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const moveLine = (i: number, dir: -1 | 1) => setLines((xs) => {
    const j = i + dir;
    if (j < 0 || j >= xs.length) return xs;
    const next = [...xs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const addLine = () => {
    const key = lineKey();
    setLines((xs) => [...xs, { key, item_name: "", quantity: 1, unit: "งาน", unit_price: 0, details: [] }]);
    setOpenKey(key);
  };
  /** เลือก/เปลี่ยนแพ็กเกจ = ดึงรายละเอียดตั้งต้นจากขอบเขตงานใหม่ (แบบฝั่งขายที่ดึงรายการจาก Package Master) */
  const pickPackage = (id: number) => {
    setPkgId(id);
    setPkgDetails(scopeDetails(pkgs.find((p) => p.id === id) ?? null));
    setOpenKey("pkg");
  };

  const validate = () => {
    if (!pkg && lines.length === 0) return "กรุณาเพิ่มแพ็กเกจ หรืองานเพิ่ม อย่างน้อย 1 รายการ";
    if (lines.some((x) => !x.item_name.trim())) return "กรุณาตั้งชื่อหัวข้อให้ครบทุกอัน";
    if (lines.some((x) => !(x.quantity > 0))) return "จำนวนของงานเพิ่มต้องมากกว่า 0";
    if (discountAmount > 0 && !reason.trim()) return "ใส่ชื่อส่วนลดด้วย — Sale Sup ใช้ประกอบการอนุมัติ";
    if (issueDate > todayIso()) return "วันที่ใบเสนอราคาต้องไม่เป็นวันที่ล่วงหน้า";
    return "";
  };
  const payload = () => ({
    house_id: item.house_id, option_no: optionNo, om_package_id: pkgId,
    // แพ็กเกจไม่ได้เก็บเป็นแถว ⇒ รายละเอียดของแพ็กเกจต้องมาก่อนหัวข้องานเพิ่มตัวแรก (server อ่านกลับตามลำดับนี้)
    items: [
      ...(pkg ? pkgDetails : []).filter((d) => d.item_name.trim())
        .map((d) => ({ item_name: d.item_name, quantity: d.quantity, unit: d.unit, unit_price: 0, detail: true })),
      ...lines.flatMap((h) => [
        { item_name: h.item_name, quantity: h.quantity, unit: h.unit, unit_price: h.unit_price },
        ...h.details.filter((d) => d.item_name.trim())
          .map((d) => ({ item_name: d.item_name, quantity: d.quantity, unit: d.unit, unit_price: 0, detail: true })),
      ]),
    ],
    discount_value: discountAmount,
    // โน้ตรายใบย้ายไปเป็น "บันทึกถึงฝ่ายขาย" ระดับใบงานแล้ว (แผน 20261002-03) — ส่งค่าเดิมกลับ ใบเก่าที่มีโน้ตไม่หาย
    discount_reason: reason.trim() || null, note: quote?.note ?? null, issue_date: issueDate, terms,
  });

  /** ดูตัวอย่าง — ทางเดียวกับฝั่งขาย: เปิดแท็บรอไว้ก่อน (กัน popup blocker) แล้วชี้ไปหน้าตัวอย่างเมื่อได้ token */
  const preview = async () => {
    const problem = validate();
    if (problem) { setErr(problem); return; }
    setErr("");
    const tab = window.open("", "_blank");
    if (tab) {
      tab.opener = null;
      tab.document.write('<!doctype html><meta charset="utf-8"><title>กำลังสร้างตัวอย่าง…</title><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#475569">กำลังสร้างตัวอย่าง…</body>');
    }
    try {
      const { token } = await apiFetch("/api/quotation-pdf/preview", { method: "POST",
        body: JSON.stringify({ om: true, ...payload(), docNo: quote?.doc_no, validDays }) });
      const url = `/quotation-preview/preview-${token}`;
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (e) {
      tab?.close();
      setErr(e instanceof Error ? e.message : "สร้างตัวอย่างไม่สำเร็จ");
    }
  };

  const save = async () => {
    const problem = validate();
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr("");
    try {
      if (quote) {
        await apiFetch(`/api/om/quotations/${quote.id}`, { method: "PATCH", body: JSON.stringify(payload()) });
        onDone(`แก้ใบเสนอราคา ${quote.doc_no} แล้ว`);
      } else {
        const r = await apiFetch("/api/om/quotations", { method: "POST", body: JSON.stringify(payload()) });
        onDone(`ออกใบเสนอราคาชุด ${optionNo} ${r.doc_no} แล้ว`);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const FIELD =
    "h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-800 outline-none transition-colors placeholder:text-gray-300 hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10";
  const HEAD_BTN =
    "h-9 shrink-0 rounded-lg border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-50";
  const ARROW = "flex h-6 w-5 items-center justify-center text-gray-300 hover:text-gray-600 disabled:opacity-30";
  const CLOSE = "flex h-6 w-6 items-center justify-center rounded text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600";
  const BADGE = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg font-bold tabular-nums text-primary";
  const rowCount = (pkg ? 1 : 0) + lines.length;
  // คลิกที่แถวหัวข้อตรงไหนก็กาง/หุบได้ — ยกเว้นช่องกรอกและปุ่ม (แบบฝั่งขาย)
  const rowToggle = (key: string) => (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest("input,textarea,button")) toggle(key);
  };
  const caret = (key: string) => (
    <button type="button" onClick={() => toggle(key)} aria-label={openKey === key ? "ย่อ" : "กาง"}
      className="flex h-6 w-5 shrink-0 items-center justify-center text-gray-400 transition-transform hover:text-gray-600">
      <span className={openKey === key ? "rotate-90" : ""}>▸</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-0 backdrop-blur-sm md:p-6">
      <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl md:h-[88vh] md:rounded-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-900">ใบเสนอราคา ชุด {optionNo}</div>
            <div className="truncate text-xxs text-gray-400">{quote ? quote.doc_no : "เลขเอกสารสร้างอัตโนมัติเมื่อบันทึก"}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700">
            ×
          </button>
        </header>

        {err && <div className="shrink-0 border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700">{err}</div>}

        {/* มือถือ: เลื่อนทั้งก้อนเป็นคอลัมน์เดียว — ถ้าแยกเลื่อนแบบจอใหญ่ กล่องการเงินจะกินจอจนรายการเหลือนิดเดียว */}
        <div className="flex min-h-0 flex-1 flex-col max-md:overflow-y-auto md:flex-row">
          {/* ── ซ้าย: แท็บรายการ / เงื่อนไข (จอใหญ่เลื่อนในกรอบตัวเอง) ── */}
          <div className="flex flex-col border-b border-gray-100 max-md:shrink-0 md:min-h-0 md:flex-1 md:border-b-0 md:border-r">
            <div className="flex shrink-0 gap-1 border-b border-gray-100 px-4 pt-2">
              {([["items", "รายการในใบเสนอราคา"], ["terms", "เงื่อนไข/ข้อกำหนด"]] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setActiveTab(key)}
                  className={`relative -mb-px h-10 rounded-t-lg border border-b-0 px-4 text-sm font-bold transition-colors ${
                    activeTab === key ? "border-gray-200 bg-white text-primary" : "border-transparent text-gray-500 hover:bg-gray-50"}`}>
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "items" && (
              <>
                <div className="flex shrink-0 items-center gap-2 px-4 py-2">
                  <span className="text-xs font-bold text-gray-800">รายการในใบเสนอราคา</span>
                  <span className="text-xxs text-gray-400">{rowCount} หัวข้อ</span>
                  <div className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={() => setPickerOpen(true)} disabled={!pkgs.length} className={HEAD_BTN}>
                      {pkgs.length ? "+ เพิ่มแพ็กเกจ" : "กำลังดึงรายการ…"}
                    </button>
                    <button type="button" onClick={addLine} className={HEAD_BTN}>+ งานเพิ่ม</button>
                  </div>
                </div>

                <div className="px-4 pb-4 md:min-h-0 md:flex-1 md:overflow-y-auto">
                  {rowCount === 0 && (
                    <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-xs text-gray-400">
                      ยังไม่มีรายการ — เริ่มด้วย “+ เพิ่มแพ็กเกจ” หรือ “+ งานเพิ่ม”
                    </div>
                  )}
                  <div className="space-y-2">
                    {/* แพ็กเกจ = หัวข้อ 1 เสมอ (ชื่อ/ราคามาจาก Package O&M) · ▸ กางรายละเอียด */}
                    {pkg && (
                      <div className="rounded-xl border border-gray-200 bg-white">
                        <div onClick={rowToggle("pkg")} className="flex cursor-pointer items-center gap-1.5 px-2 py-1.5">
                          {caret("pkg")}
                          <span className={`${BADGE} max-md:hidden`}>1</span>
                          <span className="min-w-0 flex-1 px-1.5 py-1 text-sm font-semibold leading-snug text-gray-800">
                            Package O&amp;M {tierLabel(pkg)} · {planLabel(pkg)}
                          </span>
                          <div className="w-14 shrink-0">
                            <input value="1" readOnly tabIndex={-1} title="ใบละ 1 แพ็กเกจ" aria-label="จำนวนของแพ็กเกจนี้"
                              className={`text-center cursor-default text-gray-400 hover:border-transparent ${CELL}`} />
                          </div>
                          <div className="w-[72px] shrink-0">
                            <input value="" readOnly tabIndex={-1} placeholder="หน่วย" aria-label="หน่วย"
                              className={`cursor-default text-gray-400 hover:border-transparent ${CELL}`} />
                          </div>
                          <span className="w-24 shrink-0 text-right text-xs font-bold tabular-nums text-gray-800">{formatTHB(pkg.price)}</span>
                          <div className="flex shrink-0 items-center">
                            <button type="button" disabled aria-label="เลื่อนขึ้น" className={ARROW}>↑</button>
                            <button type="button" disabled aria-label="เลื่อนลง" className={ARROW}>↓</button>
                            <button type="button" onClick={() => { setPkgId(null); setPkgDetails([]); }} aria-label="ลบหัวข้อ" className={CLOSE}>×</button>
                          </div>
                        </div>
                        {openKey === "pkg" && (
                          <DetailRows details={pkgDetails} onChange={setPkgDetails} onRestore={() => setPkgDetails(scopeDetails(pkg))} />
                        )}
                      </div>
                    )}
                    {lines.map((x, i) => (
                      <div key={x.key} className="rounded-xl border border-gray-200 bg-white">
                        <div onClick={rowToggle(x.key)} className="flex cursor-pointer items-center gap-1.5 px-2 py-1.5">
                          {caret(x.key)}
                          <span className={`${BADGE} max-md:hidden`}>{i + (pkg ? 2 : 1)}</span>
                          <textarea value={x.item_name} onChange={(e) => setLine(x.key, { item_name: e.target.value })} rows={1}
                            ref={(el) => { if (!el) return; el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }}
                            placeholder="ชื่องานเพิ่ม เช่น เปลี่ยนสาย DC" aria-label="ชื่อหัวข้อบนเอกสาร"
                            className="min-w-0 flex-1 resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold leading-snug text-gray-800 outline-none transition-colors placeholder:font-normal placeholder:text-gray-300 hover:border-gray-200 focus:border-primary focus:bg-white" />
                          <div className="w-14 shrink-0">
                            {/* ลบจนหมดต้องได้ช่องว่าง ไม่ใช่ 0 ค้าง — ไม่งั้นพิมพ์ต่อกลายเป็น "010" */}
                            <input type="number" min="0" value={x.quantity > 0 ? x.quantity : ""} placeholder="0" aria-label="จำนวน"
                              onChange={(e) => setLine(x.key, { quantity: Number(e.target.value) || 0 })} className={`text-center ${CELL}`} />
                          </div>
                          <div className="w-[72px] shrink-0">
                            <input value={x.unit} onChange={(e) => setLine(x.key, { unit: e.target.value })} placeholder="หน่วย" aria-label="หน่วย" className={CELL} />
                          </div>
                          <input type="number" min="0" value={x.unit_price || ""} placeholder="ราคา" aria-label="ราคาต่อหน่วย"
                            title="ราคาต่อหน่วย — ยอดของแถว = จำนวน × ราคา"
                            onChange={(e) => setLine(x.key, { unit_price: Math.max(0, Number(e.target.value) || 0) })}
                            className="h-8 w-24 shrink-0 rounded-md border border-gray-200 bg-white px-1.5 text-right text-xs font-bold tabular-nums text-gray-800 outline-none focus:border-primary" />
                          <div className="flex shrink-0 items-center">
                            <button type="button" onClick={() => moveLine(i, -1)} disabled={i === 0} aria-label="เลื่อนขึ้น" className={ARROW}>↑</button>
                            <button type="button" onClick={() => moveLine(i, 1)} disabled={i === lines.length - 1} aria-label="เลื่อนลง" className={ARROW}>↓</button>
                            <button type="button" onClick={() => setLines((xs) => xs.filter((y) => y.key !== x.key))} aria-label="ลบหัวข้อ" className={CLOSE}>×</button>
                          </div>
                        </div>
                        {openKey === x.key && (
                          <DetailRows details={x.details} onChange={(next) => setLine(x.key, { details: next })} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* เงื่อนไข/ข้อกำหนด — ตัวแก้ตัวเดียวกับฝั่งขาย (แก้ถ้อยคำ · เพิ่ม/ลบ/เลื่อน · คืนค่าจาก Master) แผน 20261002-07
                ชุด Master = ของ O&M (ขอบเขตงาน · หมายเหตุ Package O&M · อายุใบ) แทนชุดมาตรฐานงานขาย */}
            {activeTab === "terms" && (
              <QuotationTermsEditor value={terms} profile={OM_TERMS_PROFILE} legacyTermsText=""
                om={OM_TERMS_NO_SALES_OM} validDays={validDays} master={masterTerms} onChange={setTerms} />
            )}
          </div>

          {/* ── ขวา: การเงิน ── */}
          <div className="flex w-full shrink-0 flex-col bg-slate-50/60 p-3 md:w-80 md:overflow-y-auto">
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="rounded-xl border border-gray-200 bg-white p-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xxs text-gray-400">รวมรายการ</span>
                  <span className="text-sm font-semibold tabular-nums text-gray-800">{formatTHB(subtotal)}</span>
                </div>
                {/* ส่วนลด: ชื่อ + % + บาท แบบฝั่งขาย */}
                <div className="mt-2 space-y-1.5">
                  <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="ชื่อส่วนลด" className={FIELD} />
                  <div className="grid grid-cols-2 gap-1.5">
                    <input type="number" min="0" max="100" step="0.01" value={discountPercent || ""} placeholder="%"
                      onChange={(e) => { setDiscountType("percent"); setDiscountValue(Math.min(100, Math.max(0, Number(e.target.value) || 0))); }}
                      className={`text-right ${FIELD}`} />
                    <input type="number" min="0" value={discountAmount || ""} placeholder="บาท"
                      onChange={(e) => { setDiscountType("amount"); setDiscountValue(Math.min(subtotal, Math.max(0, Number(e.target.value) || 0))); }}
                      className={`text-right ${FIELD}`} />
                  </div>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between border-t border-gray-100 pt-1.5">
                  <span className="text-xs font-bold text-gray-700">ยอดสุทธิ</span>
                  <span className="text-lg font-bold tabular-nums text-primary">{formatTHB(total)}</span>
                </div>
              </div>

              {/* งวดชำระเงิน — งาน O&M งวดเดียว ชำระเต็มก่อนนัด (OM_PAYMENT_TERMS) ⇒ กล่องเดียวกับฝั่งขายแต่ล็อกไว้ */}
              <div className="rounded-xl border border-gray-200 bg-white p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-800">งวดชำระเงิน</span>
                  <button type="button" disabled title="งาน O&M ชำระเต็มจำนวนก่อนนัด — เพิ่มงวดไม่ได้"
                    className="rounded-md bg-primary/10 px-2 py-0.5 text-xxs font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40">
                    + งวด
                  </button>
                </div>
                <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_72px_88px_18px] items-center gap-1">
                  <input value="ชำระเต็มจำนวน" readOnly tabIndex={-1} aria-label="ชื่องวด" className={`cursor-default ${CELL}`} />
                  <div className="relative">
                    <input value="100" disabled aria-label="เปอร์เซ็นต์"
                      className="h-8 w-full rounded-md border border-gray-200 bg-white pl-1.5 pr-5 text-right text-xxs font-semibold tabular-nums text-gray-800 outline-none disabled:bg-gray-50 disabled:opacity-70" />
                    <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-xxs text-gray-400">%</span>
                  </div>
                  <input value={formatTHB(total)} disabled aria-label="ยอดงวด" className={`text-right font-semibold tabular-nums disabled:opacity-60 ${CELL}`} />
                  <span />
                </div>
                <p className="mt-1 text-xxs text-gray-400">รวม 100% · ชำระก่อนวันนัดหมายเข้าให้บริการ</p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-2.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <span className="text-xxs font-semibold text-gray-500">วันที่ใบเสนอราคา</span>
                  <input type="date" value={issueDate} max={todayIso()} onChange={(e) => setIssueDate(e.target.value || todayIso())}
                    className={`w-40 ${FIELD}`} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-gray-100 bg-white px-5 py-3">
          <button type="button" onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700">
            ยกเลิก
          </button>
          {/* คำแนะนำการใช้งานที่คนมักไม่รู้ — ข้อความเดียวกับฝั่งขาย (ตัวเรนเดอร์ PDF ทำ [ ] เป็นสีแดงให้ใบ O&M ด้วย) */}
          <span className="hidden text-xxs text-gray-400 lg:inline">
            💡 พิมพ์{" "}
            <code className="rounded bg-gray-100 px-1 font-mono text-gray-600">[ข้อความ]</code>{" "}
            ในชื่อรายการ → เอกสารแสดงเป็น <span className="font-bold text-red-600">(ข้อความ)</span>{" "}
            สีแดง · คลิกหัวข้อเพื่อกาง/หุบ
          </span>
          <div className="ml-auto flex items-center gap-3">
            <button type="button" disabled={busy} onClick={preview}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40">
              ดูตัวอย่าง
            </button>
            <button type="button" disabled={busy} onClick={save}
              className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 disabled:opacity-50">
              {busy ? "กำลังบันทึก…" : "บันทึกฉบับร่าง"}
            </button>
          </div>
        </footer>
      </div>
      {pickerOpen && (
        <PackagePickerDialog pkgs={pkgs} kw={kw} replacing={!!pkg}
          onPick={(id) => { setPickerOpen(false); pickPackage(id); }}
          onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}
