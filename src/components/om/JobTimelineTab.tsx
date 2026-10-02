"use client";

// แท็บ Timeline ในหน้ารายละเอียดงานบริการ (แผน 20260928-05 · ผู้ใช้สั่ง "ทำเลย" 28 ก.ย. 69)
// ★ concept เดียวกับแท็บ Timeline ของหน้า lead: Timeline = เหตุการณ์สำคัญจัดตามขั้น · Activity Log = ประวัติครบทุกอย่าง
//   กล่องขั้นพับได้ยก InfoSection · กลุ่มรายการยิบย่อยพับไว้ (เส้นประ) ยก detailGroupBlock — จาก leads/[id]/page.tsx
//   ก๊อปมาไม่ import เพราะอยู่ในไฟล์หน้า lead (ไฟล์นั้นชนบ่อยตอน merge main → v3 ไม่แตะ) — แก้ฝั่งนั้นแล้วตามมาแก้ที่นี่
// ★ ต่างจากหน้า lead: บ้าน 1 หลังมีหลายใบงาน (ล้างปีละ 2 รอบ + ใบซ่อม) ⇒ จัดกลุ่มตามใบงานก่อน แล้วแบ่งขั้นตาม FLOW ข้างใน
// ★ ยังไม่มีส่วน SLA (เฟส 5 ผู้ใช้เคาะรอใช้งานจริง)
// ★ ไม่ขึ้นใน Timeline (ดูใน Activity Log): เปลี่ยนเจ้าของงาน · สลับคิว · โน้ต · action ที่ยังไม่รู้จัก
import { useState } from "react";
import { CALL_OUTCOME, CONTACT_CHANNEL, statusLabel, statusTone } from "@/lib/om/booking";
import { formatTHB } from "@/lib/utils/formatters";
import {
  FLOW, teamLabel, thD, thAppt, thDT, type BookingSummary, type HistoryRow, type Team,
} from "@/lib/om/service-view";
import ServiceDocButton from "@/components/om/ServiceDocButton";

export type StageKey = (typeof FLOW)[number]["k"];
type Tone = "paid" | "pending" | "bad";
type DetailKey = "call" | "appoint" | "team" | "quote" | "report";
export type Row = {
  key: string; at: string; label: string; sub?: string | null; tone?: Tone;
  /** อยู่ในกลุ่มพับ (เส้นประ) แทนที่จะเป็นรายการหลัก */
  detail?: DetailKey;
  /** action ของแถวประวัติ + ผลโทร — บรรทัดสรุปขั้นติดตามในการ์ดที่ปิดแล้วนับการโทรจากตรงนี้ (แผน 20260929-02) */
  action?: string; outcome?: string | null;
};

const DETAIL_LABEL: Record<DetailKey, string> = {
  call: "บันทึกการโทร", appoint: "ประวัติแก้ไขนัด", team: "ประวัติจ่ายทีม", quote: "ประวัติแก้ใบเสนอราคา",
  report: "บันทึกใบตรวจ",
};
// สีจุดของแต่ละขั้น — ชุดเดียวกับป้ายแท็บงานบริการ (TONE ใน service-view)
const STAGE_DOT: Record<StageKey, string> = {
  follow: "bg-gray-500", quote: "bg-pink-600", payment: "bg-fuchsia-600",
  appoint: "bg-blue-600", progress: "bg-violet-600", closed: "bg-emerald-600",
};

const parse = (s: string | null | undefined): Record<string, unknown> => {
  if (!s) return {};
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
};
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const money = (v: unknown) => (v === null || v === undefined || v === "" ? "" : `${formatTHB(Number(v))} บาท`);

/** 1 แถวประวัติ → ขั้น + รายการ (null = ไม่ขึ้นใน Timeline) */
function toRow(h: HistoryRow, teamName: (id: unknown) => string): { stage: StageKey; row: Row } | null {
  const to = parse(h.to_json), from = parse(h.from_json);
  const base = { key: String(h.id), at: h.created_at, action: h.action };
  const by = h.actor_name ? `โดย ${h.actor_name}` : null;
  const withReason = (s: string | null) => [s, h.reason].filter(Boolean).join(" · ") || null;
  switch (h.action) {
    case "call": {
      const oc = h.outcome ?? str(to.outcome) ?? "";
      const t = CALL_OUTCOME[oc]?.t ?? oc;
      // ปุ่ม Follow-up (1 ต.ค. 69) — ช่องทางอื่นที่ไม่ใช่โทร + วันที่ติดตามจริงถ้าไม่ใช่วันบันทึก
      const via = CONTACT_CHANNEL[str(to.channel) ?? "call"] ?? "โทร";
      const on = str(to.contact_date) ? `ติดต่อ ${thD(str(to.contact_date))} · ` : "";
      // ลูกค้าไม่เอา ตอนขั้นเสนอราคา/ชำระเงิน — /cancel จดเป็นการโทร + ยกเลิกทั้งใบ ⇒ เป็นทางออกของใบงาน
      if (oc === "declined" && to.status === "cancelled")
        return { stage: "closed", row: { ...base, label: "ลูกค้าไม่เอา — ยกเลิกใบงาน", tone: "bad", sub: withReason(by) } };
      if (oc === "agreed")
        return { stage: "follow", row: { ...base, outcome: oc, label: `โทร · ${t}`, sub: withReason(to.scheduled_at ? `นัด ${thAppt(str(to.scheduled_at), str(to.time_slot) || null)}` : by) } };
      const next = h.next_action_date ?? str(to.next_date);
      return { stage: "follow", row: { ...base, outcome: oc, label: `${via} · ${t}`, detail: "call", sub: withReason(`${on}${next ? `นัดโทรใหม่ ${thD(next)}` : by}`) } };
    }
    case "create":
      // เปิดใบงานพร้อมวันนัด = วันนัดไปอยู่หัวขั้นนัดหมายแล้ว ไม่ต้องขึ้นซ้ำ
      return to.status === "follow" || !to.scheduled_at
        ? { stage: "follow", row: { ...base, label: "เปิดใบงาน", sub: by } }
        : null;
    case "repair_open":
      return { stage: "follow", row: { ...base,
        label: `เปิดใบงานซ่อมจากใบงาน #${str(to.from_booking) ?? "-"} · ${to.in_warranty ? "ในประกัน" : "นอกประกัน"}`,
        sub: h.reason ? `อาการ: ${h.reason}` : by } };
    case "quote":
      // ชุด N (แผน 20261002-02) — ประวัติเก่าก่อนมีหลายชุดไม่มี option_no
      return { stage: "quote", row: { ...base, label: `ออกใบเสนอราคา${to.option_no ? ` ชุด ${str(to.option_no)}` : ""} ${str(to.doc_no) ?? ""}`.trim(), sub: withReason(money(to.total) || null) } };
    case "quote_delete":
      return { stage: "quote", row: { ...base, label: `ลบใบเสนอราคาฉบับร่าง ชุด ${str(from.option_no) ?? "-"} ${str(from.doc_no) ?? ""}`.trim(), tone: "bad", sub: by } };
    case "quote_edit":
      return { stage: "quote", row: { ...base, detail: "quote", label: `แก้ใบเสนอราคา ${str(to.doc_no) ?? ""}`.trim(),
        sub: withReason(from.total !== undefined ? `${money(from.total)} → ${money(to.total)}` : null) } };
    case "quote_revise":
      return { stage: "quote", row: { ...base, detail: "quote", label: h.action_label ?? "สร้าง Revision ใบเสนอราคา", sub: withReason(null) } };
    case "quote_submit":
      return { stage: "quote", row: { ...base, label: "ส่งใบเสนอราคาขออนุมัติ", tone: "pending", sub: withReason(by) } };
    case "quote_approve":
      return { stage: "quote", row: { ...base, label: h.action_label ?? "อนุมัติใบเสนอราคา", sub: withReason(by) } };
    case "quote_return":
      return { stage: "quote", row: { ...base, label: "ส่งใบเสนอราคากลับแก้", tone: "bad", sub: withReason(by) } };
    case "quote_send":
      // ตั้งแต่มี 3 ชุด (แผน 20261002-02) ทางนี้ = ลูกค้าเลือกชุดนั้น · ประวัติเก่าไม่มี option_no คงป้ายเดิม
      // แผน 20261002-10: handoff = ปุ่มขั้น 02 "ส่งใบเสนอราคาให้ทีมขาย" · เปลี่ยนชุดที่ขั้นชำระเงิน = อยู่ขั้นชำระเงิน
      if (to.handoff)
        return { stage: "quote", row: { ...base, label: "ส่งใบเสนอราคาให้ทีมขาย", sub: withReason(by) } };
      return { stage: from.status === "payment" ? "payment" : "quote", row: { ...base, label: to.option_no
        ? `ลูกค้าเลือกชุด ${str(to.option_no)} ${str(to.doc_no) ?? ""}`.trim()
        : `ส่งใบเสนอราคาให้ลูกค้า ${str(to.doc_no) ?? ""}`.trim(), sub: withReason(by) } };
    case "pay_submit":
      // เช็ค / บัตรเครดิต (แผน 20261002-11) — บัตรแสดงยอดรวมค่าธรรมเนียม
      return { stage: "payment", row: { ...base, tone: "pending",
        label: to.method === "cheque" ? `แนบภาพเช็ค ${money(to.amount)}`.trim()
          : `แนบสลิป ${money(Number(to.amount ?? 0) + Number(to.cc_fee ?? 0))}`.trim(),
        sub: withReason(to.method === "cheque" ? "รอ Account ยืนยันรับเช็ค"
          : to.cc_fee ? `บัตรเครดิต +${str(to.cc_pct)}% · รอ Account ยืนยันรับเงิน` : "รอ Account ยืนยันรับเงิน") } };
    case "pay_cheque":
      return { stage: "payment", row: { ...base, label: `รับเช็ค ${money(to.amount)}`.trim(), tone: "pending", sub: withReason("รอ Account ยืนยันเงินเข้า") } };
    case "pay_reject":
      return { stage: "payment", row: { ...base, label: "Account ปฏิเสธสลิป", tone: "bad", sub: withReason(null) } };
    case "paid":
      return { stage: "payment", row: { ...base, label: `ยืนยันรับเงิน ${money(to.amount)}`.trim(), tone: "paid",
        sub: to.grant_qty ? `เติมสิทธิ์ +${str(to.grant_qty)} ครั้ง` : by } };
    case "confirm":
      return { stage: "appoint", row: { ...base, label: "ลูกค้ายืนยันนัด", sub: by } };
    case "reschedule": {
      const extra = [
        to.status === "pending" && from.status === "confirmed" ? "กลับเป็นรอยืนยัน" : null,
        "team_id" in to && to.team_id === null && from.team_id ? "ปลดทีม" : null,
      ].filter(Boolean).join(" · ");
      const moved = from.scheduled_at || to.scheduled_at
        ? `เลื่อนนัด ${thAppt(str(from.scheduled_at), str(from.time_slot) || null)} → ${thAppt(str(to.scheduled_at), str(to.time_slot) || null)}` : (h.action_label ?? "เลื่อนนัด");
      return { stage: "appoint", row: { ...base, detail: "appoint", label: moved, sub: withReason(extra || by) } };
    }
    case "assign_team":
      return { stage: "appoint", row: { ...base, label: to.team_id ? `จ่าย${teamLabel(teamName(to.team_id))}` : "ถอนทีมช่าง", sub: by } };
    case "start":
      return { stage: "progress", row: { ...base, label: "ช่างเริ่มงาน", sub: by } };
    case "check":
      // ★ "check" มา 2 ทาง (ดู historyLabel ใน booking-log.ts): เปลี่ยนสถานะเป็นรอปิด = มี status ใน to_json
      //   ที่เหลือคือการกดบันทึกใบตรวจ (บันทึกร่าง/ปิดงาน) — พับเป็นประวัติ ไม่งั้นใบที่บันทึกร่างหลายรอบรกทั้งขั้น
      if (to.status) return { stage: "progress", row: { ...base, label: "ตรวจงานเสร็จ รอปิด", sub: by } };
      return { stage: "progress", row: { ...base, detail: "report",
        label: `บันทึกใบตรวจ${to.result === "pass" ? " · ผลตรวจผ่าน" : to.result === "fail" ? " · ผลตรวจไม่ผ่าน" : " (ร่าง)"}`,
        sub: [Number(to.fail) > 0 ? `ไม่ผ่าน ${str(to.fail)} ข้อ` : null, to.repair ? `พบงานซ่อม: ${str(to.repair)}` : null, by]
          .filter(Boolean).join(" · ") || null } };
    case "done":
      return { stage: "closed", row: { ...base, label: "ปิดงาน", tone: "paid", sub: by } };
    case "cancel":
      return { stage: "closed", row: { ...base, label: "ยกเลิกใบงาน", tone: "bad", sub: withReason(by) } };
    case "no_show":
      return { stage: "closed", row: { ...base, label: "ลูกค้าไม่อยู่บ้าน", tone: "bad", sub: withReason(by) } };
    default:
      return null;   // assign_owner · reorder · note · action ใหม่ที่ยังไม่รู้จัก → Activity Log
  }
}

/** กล่องขั้นพับได้ — ยก InfoSection จากหน้า lead (เลข = จำนวนเหตุการณ์หลักในขั้น แบบ "4/4" ของฝั่งขาย) */
function StageSection({ title, count, open, onToggle, children }: {
  title: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div>
      <button type="button" onClick={onToggle} style={{ minHeight: 0 }}
        className="w-full flex items-center gap-2 px-1 py-1.5 hover:bg-gray-50 rounded transition-colors text-left cursor-pointer">
        <svg className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{title}</span>
        <span className={`text-xxs font-mono tabular-nums shrink-0 ${count === 0 ? "text-gray-300" : "text-emerald-600"}`}>{count}/{count}</span>
      </button>
      {open && <div className="ml-1.5 pl-3 border-l border-gray-200 mt-0.5 mb-1">{children}</div>}
    </div>
  );
}

/** กลุ่มรายการยิบย่อย (เส้นประ) — ยก detailGroupBlock จากหน้า lead */
function DetailGroup({ label, rows }: { label: string; rows: Row[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} style={{ minHeight: 0 }}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-2.5 py-1 text-xxs font-semibold text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors cursor-pointer">
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        {open ? `ซ่อน${label}` : `${label} (${rows.length})`}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1.5 border-l border-dashed border-gray-200 pl-3">
          {rows.map((r) => (
            <li key={r.key} className="text-xs text-gray-500">
              <span className="font-medium text-gray-600">{r.label}</span>
              <span className="font-mono tabular-nums"> · บันทึก {thDT(r.at)}</span>
              {r.sub && <div className="text-xxs mt-0.5">{r.sub}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** รายการหลัก — จุดสีตามขั้น · เขียว = เงินเข้า/ปิดงาน · ส้ม = รอ · แดง = ปฏิเสธ/ยกเลิก (สีชุดเดียวกับหน้า lead) */
function Milestone({ r, dot }: { r: Row; dot: string }) {
  const cls = r.tone === "paid" ? ["bg-emerald-500", "text-emerald-700", "text-emerald-600"]
    : r.tone === "pending" ? ["bg-orange-500", "text-orange-700", "text-orange-600"]
    : r.tone === "bad" ? ["bg-red-500", "text-red-700", "text-red-600"]
    : [dot, "text-gray-800", "text-gray-500"];
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${cls[0]}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`font-semibold ${cls[1]}`}>{r.label}</span>
          <span className={`text-xs font-mono tabular-nums ${cls[2]}`}>{thDT(r.at)}</span>
        </div>
        {r.sub && <div className={`text-xs mt-0.5 ${cls[2]}`}>{r.sub}</div>}
      </div>
    </li>
  );
}

type Group = { key: string; booking: BookingSummary | null; stages: Map<StageKey, Row[]> };

/** จัดประวัติทั้งบ้านเข้ากลุ่มใบงาน แล้วแบ่งตามขั้น — แท็บนี้วาดทุกกลุ่ม · การ์ดขั้นที่ปิดแล้วใช้ของใบงานเดียว */
function groupHistory(bookings: BookingSummary[], history: HistoryRow[], teams: Team[]) {
  const teamName = (id: unknown) => teams.find((t) => t.id === Number(id))?.name ?? `#${str(id)}`;

  // ── จัดประวัติเข้ากลุ่มใบงาน ──
  const byBooking = new Map<number, Group>(bookings.map((b) => [b.id, { key: `b${b.id}`, booking: b, stages: new Map() }]));
  const pending: Group = { key: "new", booking: null, stages: new Map() };   // การโทรหลังใบล่าสุด ยังไม่มีใบงานใหม่
  const oldestFirst = [...bookings].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
  const push = (g: Group, stage: StageKey, row: Row) => g.stages.set(stage, [...(g.stages.get(stage) ?? []), row]);
  for (const h of [...history].sort((a, b) => a.created_at.localeCompare(b.created_at) || Number(a.id) - Number(b.id))) {
    const m = toRow(h, teamName);
    if (!m) continue;
    // การโทรก่อนมีใบงาน (ไม่รับสาย/ปฏิเสธ) ไม่มี booking_id — ผูกกับใบงานถัดไปที่เปิดหลังจากนั้น
    const g = h.booking_id ? byBooking.get(h.booking_id)
      : (() => { const nb = oldestFirst.find((b) => b.created_at >= h.created_at); return nb ? byBooking.get(nb.id) : pending; })();
    if (g) push(g, m.stage, m.row);
  }

  // ── หัวขั้นนัดหมาย = วันนัดที่ยืนอยู่ตอนนี้ · ประวัติเลื่อนนัดพับอยู่ใต้หัวนี้ (แบบ appointmentAnchor ของหน้า lead) ──
  for (const g of byBooking.values()) {
    const b = g.booking!;
    const appoint = g.stages.get("appoint") ?? [];
    if (b.scheduled_at) {
      const setters = history.filter((h) => h.booking_id === b.id && (h.action === "reschedule" || h.action === "create"
        || (h.action === "call" && (h.outcome ?? parse(h.to_json).outcome) === "agreed")));
      const at = setters.map((h) => h.created_at).sort().pop() ?? b.created_at;
      appoint.unshift({ key: `anchor${b.id}`, at, label: `นัด ${thAppt(b.scheduled_at, b.time_slot)}`,
        sub: [b.rescheduled_count > 0 ? `เลื่อนมาแล้ว ${b.rescheduled_count} ครั้ง` : null, b.team_name ? teamLabel(b.team_name) : null]
          .filter(Boolean).join(" · ") || null });
    }
    // จ่ายทีมหลายรอบ (ลากจัดคิว) — ครั้งล่าสุดเป็นรายการหลัก ที่เหลือพับเป็นประวัติ
    const teamRows = appoint.filter((r) => !r.detail && /^จ่ายทีม|^ถอนทีม/.test(r.label));
    teamRows.slice(0, -1).forEach((r) => { r.detail = "team"; });
    if (appoint.length) g.stages.set("appoint", appoint);
    // ปิดงาน — ผลตรวจ + ตัดสิทธิ์ จากใบตรวจ/ใบตัดสิทธิ์ของใบนั้น
    const done = (g.stages.get("closed") ?? []).find((r) => r.label === "ปิดงาน");
    if (done) done.sub = [
      b.result === "pass" ? "ผลตรวจ ผ่าน" : b.result === "fail" ? "ผลตรวจ ไม่ผ่าน" : null,
      b.redeemed > 0 ? `ตัดสิทธิ์ ${b.redeemed} ครั้ง` : b.consumes_quota === 0 ? "ไม่ตัดสิทธิ์" : null,
      done.sub,
    ].filter(Boolean).join(" · ") || null;
  }
  return { byBooking, pending };
}

/** เหตุการณ์ของใบงานเดียว แบ่งตามขั้น — สรุปในการ์ดขั้นที่ปิดแล้วของหน้ารายละเอียด (แผน 20260929-02)
 *  ★ ชุดเดียวกับที่แท็บนี้วาด ป้าย/การจัดกลุ่มการโทรก่อนมีใบงานจึงตรงกันทั้งสองที่ */
export function bookingStages(bookings: BookingSummary[], history: HistoryRow[], teams: Team[], bookingId: number) {
  return groupHistory(bookings, history, teams).byBooking.get(bookingId)?.stages ?? new Map<StageKey, Row[]>();
}

/** เหตุการณ์ในขั้นเดียว — รายการหลัก (หัวนัดอยู่บนสุดเสมอ) + กลุ่มรายการยิบย่อยพับไว้ */
export function StageEvents({ stage, rows }: { stage: StageKey; rows: Row[] }) {
  const sorted = [...rows].sort((a, b) => a.at.localeCompare(b.at));
  const main = sorted.filter((r) => !r.detail);
  // หัวนัด (anchor) อยู่บนสุดของขั้นนัดหมายเสมอ ถึงเวลาจะไม่ใช่แถวแรก
  const anchor = main.find((r) => r.key.startsWith("anchor"));
  const shown = anchor ? [anchor, ...main.filter((r) => r !== anchor)] : main;
  const details = (Object.keys(DETAIL_LABEL) as DetailKey[])
    .map((k) => ({ k, rows: sorted.filter((r) => r.detail === k) })).filter((d) => d.rows.length);
  return (
    <>
      <ul className="space-y-2 py-1">
        {shown.map((r) => <Milestone key={r.key} r={r} dot={STAGE_DOT[stage]} />)}
      </ul>
      {details.map((d) => <DetailGroup key={d.k} label={DETAIL_LABEL[d.k]} rows={d.rows} />)}
    </>
  );
}

export default function JobTimelineTab({ bookings, history, teams }: {
  bookings: BookingSummary[]; history: HistoryRow[]; teams: Team[];
}) {
  const { byBooking, pending } = groupHistory(bookings, history, teams);

  // ใบล่าสุดก่อน · กลุ่ม "รอบใหม่" (ยังไม่มีใบงาน) อยู่บนสุดถ้ามี
  const groups: Group[] = [
    ...(pending.stages.size ? [pending] : []),
    ...bookings.map((b) => byBooking.get(b.id)!),
  ];

  // เปิดไว้ก่อน: กลุ่มแรก + ใบที่ยังไม่จบ · ใบเก่าที่จบแล้วพับไว้ (บ้านที่ใช้มาหลายปีจะไม่ยาวเต็มจอ)
  const [openGroup, setOpenGroup] = useState<Record<string, boolean>>({});
  const [closedStage, setClosedStage] = useState<Record<string, boolean>>({});
  const isOpen = (g: Group, i: number) => openGroup[g.key]
    ?? (i === 0 || (!!g.booking && !["closed", "cancelled", "no_show"].includes(g.booking.status)));

  if (!groups.length) return (
    <div className="rounded-2xl bg-white border border-gray-200 px-4 py-16 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-3">
        <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
        </svg>
      </div>
      <div className="text-sm font-semibold text-gray-700">ยังไม่มี milestone</div>
      <div className="text-xs text-gray-400 mt-1">บันทึกการโทรครั้งแรกหรือเปิดใบงานแล้วจะขึ้นที่นี่</div>
    </div>
  );

  return (
    <div className="space-y-3 rounded-2xl bg-white border border-gray-200 px-4 py-4">
      <div className="pb-3 border-b border-gray-100">
        <div className="text-sm font-bold text-gray-800 uppercase tracking-wide">Timeline</div>
        <div className="text-xs text-gray-500 mt-0.5">ลำดับเหตุการณ์สำคัญของแต่ละใบงาน แบ่งตามขั้น · ประวัติครบทุกอย่างดูที่ Activity Log</div>
      </div>

      {groups.map((g, gi) => {
        const b = g.booking;
        const open = isOpen(g, gi);
        const exit = b && ["cancelled", "no_show"].includes(b.status);
        const doneAt = b?.finished_at ?? (b?.status === "closed" ? (g.stages.get("closed") ?? []).find((r) => r.label === "ปิดงาน")?.at ?? null : null);
        const days = b && doneAt ? Math.max(0, Math.round((new Date(doneAt).getTime() - new Date(b.created_at).getTime()) / 86_400_000)) : null;
        return (
          <div key={g.key} className="rounded-xl border border-gray-100">
            {/* หัวใบงาน — กดพับ/กางทั้งใบ */}
            <div className="flex items-start gap-2 px-3 py-2.5 bg-gray-50/70 rounded-t-xl">
              <button type="button" onClick={() => setOpenGroup((s) => ({ ...s, [g.key]: !open }))} style={{ minHeight: 0 }}
                className="flex-1 min-w-0 flex items-start gap-2 text-left cursor-pointer">
                <svg className={`w-3.5 h-3.5 mt-1 text-gray-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <b className="text-sm text-gray-900">{b ? `ใบงาน #${b.id}` : "รอบใหม่ — ยังไม่มีใบงาน"}</b>
                    {b?.service_type && <span className="text-sm text-gray-600">· {b.service_type}</span>}
                    {b?.parent_booking_id && (
                      <span className={`text-xxs font-bold px-2 py-0.5 rounded-full ${b.in_warranty ? "bg-emerald-50 text-emerald-700" : "bg-pink-50 text-pink-700"}`}>
                        ใบงานซ่อมจาก #{b.parent_booking_id} · {b.in_warranty ? "ในประกัน" : "นอกประกัน"}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {b ? [
                      `เปิด ${thD(b.created_at)}`,
                      b.job_no ? `ใบบริการ ${b.job_no}` : null,
                      b.rescheduled_count > 0 ? `เลื่อนนัด ${b.rescheduled_count} ครั้ง` : null,
                      days !== null ? `ใช้เวลา ${days === 0 ? "ไม่ถึง 1 วัน" : `${days} วัน`}` : null,
                    ].filter(Boolean).join(" · ") : "บันทึกการโทรหลังใบงานล่าสุด — ตกลงนัดเมื่อไรจะเปิดใบงานใหม่"}
                  </span>
                </span>
              </button>
              {b && (
                <span className="shrink-0 flex items-center gap-2">
                  {b.status === "closed" && <ServiceDocButton bookingId={b.id} />}
                  <span className={`text-xxs font-bold px-2 py-0.5 rounded-full text-white ${statusTone(b.status)}`}>
                    {b.status === "closed" ? `✓ ปิดงาน${doneAt ? ` ${thD(doneAt)}` : ""}` : exit ? statusLabel(b.status) : `อยู่ขั้น ${statusLabel(b.status)}`}
                  </span>
                </span>
              )}
            </div>

            {open && (
              <div className="px-3 py-2 space-y-1">
                {FLOW.filter((f) => g.stages.has(f.k)).map((f) => {
                  const rows = g.stages.get(f.k) ?? [];
                  const sk = `${g.key}:${f.k}`;
                  return (
                    <StageSection key={f.k} title={f.t} count={rows.filter((r) => !r.detail).length} open={!closedStage[sk]}
                      onToggle={() => setClosedStage((s) => ({ ...s, [sk]: !s[sk] }))}>
                      <StageEvents stage={f.k} rows={rows} />
                    </StageSection>
                  );
                })}
                {!g.stages.size && <div className="px-1 py-2 text-xs text-gray-400">ยังไม่มีเหตุการณ์ในใบงานนี้</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
