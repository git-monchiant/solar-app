"use client";

import { Fragment, type ReactNode } from "react";
import { formatThaiDate, formatTHB } from "@/lib/utils/formatters";
import {
  B2B_FLOW, INSTALLMENT_STATUS_LABEL, INSTALLMENT_TRIGGER_LABEL, type B2bInstallment, type B2bProject, type InstallmentStatus,
} from "@/lib/b2b/project";
import {
  MILESTONES, PERMITS, PERMIT_STATUS_LABEL, milestoneDef,
  type B2bMilestone, type B2bPermit, type MilestoneDef, type MilestoneFile, type MilestoneKind,
} from "@/lib/b2b/execution";
import type { StepState } from "./ProjectStepper";

// ภาพรวมช่วงดำเนินโครงการ 06–09 (แผน 20261016-01 แบบ C) — แทนการ์ดขั้น 06–09 เดิม
//   คอลัมน์ = ขั้น · แถว = หน้างาน (milestone) / ขออนุญาต / งวดเงิน ⇒ เห็นงานที่เดินคู่ขนานและผูกกัน (แผงส่งครบ → งวด 2) ในจอเดียว
//   ปุ่มในช่องทำได้ครบแบบรายการเดิม (บันทึก/แก้/ยกเลิก milestone · อัปเดตขออนุญาต · แนบหลักฐาน/ยืนยันงวด) — API ตรวจสิทธิ์ซ้ำ
//   มือถือ: เรียงทีละแถว (หน้างาน / ขออนุญาต / งวดเงิน) มีชื่อขั้นนำหน้า

const EXEC = B2B_FLOW.map((s, i) => ({ ...s, no: i + 1 })).filter((s) => s.step >= 3600);
const pad = (n: number) => String(n).padStart(2, "0");

/** ok = เสร็จ · now = ทำต่อไป/ถึงคิวเรา · pending = รอคนอื่น · wait = ยังไม่ถึง · na = ไม่ต้องใช้ */
type Tone = "ok" | "now" | "pending" | "wait" | "na";
const DOT: Record<Tone, string> = {
  ok: "bg-emerald-500 text-white", now: "bg-active text-white", pending: "bg-amber-400 text-white",
  wait: "bg-white ring-2 ring-inset ring-gray-300", na: "bg-gray-100 text-gray-400",
};
const MARK: Record<Tone, string> = { ok: "✓", now: "●", pending: "…", wait: "", na: "–" };
const BAR: Record<InstallmentStatus, string> = { paid: "bg-emerald-500", submitted: "bg-amber-400", due: "bg-amber-200", pending: "bg-gray-200" };
const LEG: Record<InstallmentStatus, string> = { paid: "border-emerald-500", submitted: "border-amber-400", due: "border-amber-200", pending: "border-gray-200" };

const actBtn = "h-7 px-2 rounded-md text-xxs font-bold whitespace-nowrap disabled:opacity-50";
const linkBtn = "text-xxs font-bold hover:underline whitespace-nowrap";

function Item({ tone, title, tag, detail, children }: { tone: Tone; title: ReactNode; tag?: string; detail?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-0.5 w-[18px] h-[18px] shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold leading-none ${DOT[tone]}`}>{MARK[tone]}</span>
      <div className="flex-1 min-w-0 leading-tight">
        <div className={`text-xs ${tone === "now" ? "font-bold text-active-dark" : tone === "wait" || tone === "na" ? "text-gray-500" : "text-gray-800"}`}>
          {title}
          {tag && <span className="ml-1 inline-block whitespace-nowrap rounded-full bg-blue-50 px-1.5 text-xxs font-bold text-blue-700">{tag}</span>}
        </div>
        {detail && <div className="text-xxs text-gray-400 break-words">{detail}</div>}
        {children && <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">{children}</div>}
      </div>
    </div>
  );
}

/** งวดอยู่คอลัมน์ไหน — ตามเหตุการณ์ที่ทำให้ถึงกำหนด · งวดแบบอื่น (ไม่ผูก) งวดแรก = 06 · งวดท้าย = 09 · ที่เหลือ = 07 */
function instStep(it: B2bInstallment, count: number): number {
  switch (it.trigger_key) {
    case "contract": return 3600;
    case "panels_delivered": case "install_done": return 3700;
    case "handover": return 3900;
  }
  return it.no === 1 ? 3600 : it.no === count ? 3900 : 3700;
}

export default function ExecutionBoard({ p, stateOf, dateOf, nextKind, canExec, canPermit, canEdit, canConfirm, busyId,
  onRecord, onEditMilestone, onUndoMilestone, onMilestoneFile, onPermit, onPermitFile, onAttach, onConfirm, onReject, onViewEvidence, onAllInstallments }: {
  p: B2bProject;
  stateOf: (step: number) => StepState;
  /** วันที่ผ่านขั้น (หัวคอลัมน์ขั้นที่เสร็จ) */
  dateOf: (step: number) => string | null;
  /** milestone ที่เป็นงานถัดไปของการ์ดขั้นต่อไป — ไฮไลต์ในตาราง */
  nextKind: MilestoneKind | null;
  /** บันทึก/แก้ milestone (Solar B2B/admin · โครงการยังเปิด) */
  canExec: boolean;
  canPermit: boolean;
  /** แนบหลักฐานงวด */
  canEdit: boolean;
  /** บัญชียืนยัน/ตีกลับงวด */
  canConfirm: boolean;
  busyId: number | null;
  onRecord: (kind: MilestoneKind) => void;
  onEditMilestone: (m: B2bMilestone) => void;
  onUndoMilestone: (m: B2bMilestone) => void;
  onMilestoneFile: (m: B2bMilestone, f: MilestoneFile) => void;
  onPermit: (x: B2bPermit) => void;
  onPermitFile: (x: B2bPermit) => void;
  onAttach: (it: B2bInstallment) => void;
  onConfirm: (it: B2bInstallment) => void;
  onReject: (it: B2bInstallment) => void;
  onViewEvidence: (it: B2bInstallment) => void;
  onAllInstallments?: () => void;
}) {
  const byKind = new Map(p.milestones.map((m) => [m.kind, m]));
  const latest = p.milestones[p.milestones.length - 1];
  const count = p.installments.length;
  const instOf = (trigger?: string) => (trigger ? p.installments.find((i) => i.trigger_key === trigger) : undefined);

  const milestoneItem = (d: MilestoneDef) => {
    const m = byKind.get(d.kind);
    const inst = instOf(d.trigger);
    const tag = inst ? `งวด ${inst.no}` : undefined;
    if (m) {
      return (
        <Item key={d.kind} tone="ok" title={d.label} tag={tag}
          detail={`${formatThaiDate(m.done_date)}${m.created_by_name ? ` · ${m.created_by_name}` : ""}${m.note ? ` · ${m.note}` : ""}`}>
          {m.files.map((f) => (
            <button key={f.file} type="button" onClick={() => onMilestoneFile(m, f)} style={{ minHeight: 0 }}
              className="max-w-[10rem] truncate text-xxs text-primary hover:underline">{f.mime === "application/pdf" ? "📄" : "🖼"} {f.name}</button>
          ))}
          {canExec && <button type="button" onClick={() => onEditMilestone(m)} style={{ minHeight: 0 }} className={`${linkBtn} text-gray-500`}>แก้</button>}
          {canExec && latest?.id === m.id && p.stage === m.stage_after && (
            <button type="button" onClick={() => onUndoMilestone(m)} style={{ minHeight: 0 }} className={`${linkBtn} text-red-600`}>ยกเลิกการบันทึก</button>
          )}
        </Item>
      );
    }
    const blocked = d.requires && !byKind.has(d.requires) ? milestoneDef(d.requires)!.label : null;
    // ขั้นที่ยังไม่ถึง: บันทึกจากปุ่มของการ์ดขั้นต่อไปเท่านั้น (เช่น ของเข้าหน้างาน · ยื่นขนานไฟ)
    const reachable = d.step <= p.stage;
    return (
      <Item key={d.kind} tone={d.kind === nextKind ? "now" : "wait"} title={d.label} tag={tag}
        detail={blocked ? `ต้องบันทึก "${blocked}" ก่อน` : d.purchase ? "Purchase บันทึกจากเมนูจัดซื้อได้" : d.hint}>
        {canExec && !blocked && reachable && (
          <button type="button" onClick={() => onRecord(d.kind)} style={{ minHeight: 0 }}
            className={`${actBtn} border border-active text-active hover:bg-active-light`}>บันทึก</button>
        )}
      </Item>
    );
  };

  const permitItem = (d: (typeof PERMITS)[number]) => {
    const x = p.permits.find((k) => k.kind === d.kind);
    if (!x) return null;
    const tone: Tone = x.status === "approved" ? "ok" : x.status === "not_required" ? "na" : x.status === "submitted" ? "pending" : "wait";
    const detail = x.status === "approved" ? `ได้แล้ว${x.approved_date ? ` ${formatThaiDate(x.approved_date)}` : ""}`
      : x.status === "submitted" ? `ยื่น${x.submitted_date ? ` ${formatThaiDate(x.submitted_date)}` : "แล้ว"} · รอผล`
      : PERMIT_STATUS_LABEL[x.status];
    return (
      <Item key={d.kind} tone={tone} title={<span title={d.label}>{d.short}</span>} detail={detail}>
        {x.has_file && (
          <button type="button" onClick={() => onPermitFile(x)} style={{ minHeight: 0 }} className="max-w-[10rem] truncate text-xxs text-primary hover:underline">📄 {x.file_label ?? "เอกสาร"}</button>
        )}
        {canPermit && <button type="button" onClick={() => onPermit(x)} style={{ minHeight: 0 }} className={`${linkBtn} text-active`}>อัปเดต</button>}
      </Item>
    );
  };

  const instItem = (it: B2bInstallment) => {
    const tone: Tone = it.status === "paid" ? "ok" : it.status === "submitted" ? "pending" : it.status === "due" ? "now" : "wait";
    const trig = it.trigger_key ? INSTALLMENT_TRIGGER_LABEL[it.trigger_key] : null;
    const state = it.status === "paid" ? `รับแล้ว${it.confirmed_at ? ` ${formatThaiDate(it.confirmed_at)}` : ""}`
      : it.status === "pending" ? (trig ? `ถึงกำหนดเมื่อ${trig}` : "ยังไม่ถึง") : INSTALLMENT_STATUS_LABEL[it.status];
    return (
      <Item key={it.id} tone={tone} title={`งวด ${it.no} · ${it.pct}%`}
        detail={<>{formatTHB(it.total, { decimals: 2 })} · {state}{it.status === "due" && it.reject_note && <span className="block text-red-600">บัญชีตีกลับ: {it.reject_note}</span>}</>}>
        {it.has_evidence && <button type="button" onClick={() => onViewEvidence(it)} style={{ minHeight: 0 }} className={`${linkBtn} text-gray-500`}>ดูหลักฐาน</button>}
        {canEdit && it.status === "due" && (
          <button type="button" disabled={busyId === it.id} onClick={() => onAttach(it)} style={{ minHeight: 0 }}
            className={`${actBtn} bg-active text-white hover:bg-active-dark`}>แนบหลักฐาน</button>
        )}
        {canConfirm && it.status === "submitted" && (
          <>
            <button type="button" disabled={busyId === it.id} onClick={() => onReject(it)} style={{ minHeight: 0 }} className={`${linkBtn} text-red-600`}>ตีกลับ…</button>
            <button type="button" disabled={busyId === it.id} onClick={() => onConfirm(it)} style={{ minHeight: 0 }}
              className={`${actBtn} bg-emerald-500 text-white hover:bg-emerald-600`}>ยืนยันรับเงิน</button>
          </>
        )}
      </Item>
    );
  };

  const rows: { key: string; label: string; sub: string; cell: (step: number) => ReactNode[] }[] = [
    { key: "site", label: "🔧 หน้างาน", sub: "milestone", cell: (step) => MILESTONES.filter((d) => d.step === step).map(milestoneItem) },
    { key: "permit", label: "📑 ขออนุญาต", sub: "ทำคู่ขนานได้", cell: (step) => PERMITS.filter((d) => d.step === step).map(permitItem).filter(Boolean) },
    { key: "money", label: "💰 งวดเงิน", sub: "รวม VAT", cell: (step) => p.installments.filter((i) => instStep(i, count) === step).map(instItem) },
  ];

  const colHead = (step: number) => {
    const st = stateOf(step);
    if (st === "active") return { tone: "bg-active-light text-active-dark shadow-[inset_0_3px_0_var(--active)]", sub: "ตอนนี้" };
    if (st === "stopped") return { tone: "bg-gray-100 text-gray-600", sub: "หยุดที่นี่" };
    if (st === "done") { const d = dateOf(step); return { tone: "bg-gray-50 text-emerald-700", sub: d ? `เสร็จ ${formatThaiDate(d, { year: false })}` : "เสร็จแล้ว" }; }
    return { tone: "bg-gray-50 text-gray-500", sub: "" };
  };

  const paid = p.installments.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0);
  const sum = p.installments.reduce((s, i) => s + i.total, 0);

  return (
    <div id="exec-board" className="space-y-3 scroll-mt-[calc(var(--hdr,124px)+12px)]">
      <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-200 px-3 md:px-4 py-2">
          <h3 className="text-sm font-bold text-gray-900">ภาพรวมช่วงดำเนินโครงการ</h3>
          <div className="max-md:hidden ml-auto flex items-center gap-3 text-xxs text-gray-500">
            {([["bg-emerald-500", "เสร็จ"], ["bg-active", "ทำต่อไป"], ["bg-amber-400", "รอคนอื่น"], ["bg-white ring-2 ring-inset ring-gray-300", "ยังไม่ถึง"]] as const).map(([c, t]) => (
              <span key={t} className="inline-flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-full ${c}`} />{t}</span>
            ))}
          </div>
        </div>

        {/* จอ md ขึ้นไป: ตาราง */}
        <div className="max-md:hidden grid grid-cols-[7.5rem_repeat(4,minmax(0,1fr))]">
          <div className="bg-gray-50 border-b border-gray-200" />
          {EXEC.map((c) => {
            const h = colHead(c.step);
            return (
              <div key={c.step} className={`px-3 py-2 border-b border-l border-b-gray-200 border-l-gray-100 text-xs font-bold leading-tight ${h.tone}`}>
                {pad(c.no)} {c.label}
                <div className="text-xxs font-normal">{h.sub || " "}</div>
              </div>
            );
          })}
          {rows.map((r, ri) => (
            <Fragment key={r.key}>
              <div className={`px-3 py-2.5 text-sm font-bold leading-tight text-gray-800 ${ri > 0 ? "border-t border-gray-100" : ""}`}>
                {r.label}<div className="text-xxs font-normal text-gray-400">{r.sub}</div>
              </div>
              {EXEC.map((c) => {
                const items = r.cell(c.step);
                return (
                  <div key={c.step} className={`px-2.5 py-2.5 border-l border-gray-100 space-y-2.5 ${ri > 0 ? "border-t" : ""} ${stateOf(c.step) === "active" ? "bg-violet-50/40" : ""}`}>
                    {items.length ? items : <span className="text-xxs text-gray-300">—</span>}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>

        {/* มือถือ: ทีละแถว */}
        <div className="md:hidden divide-y divide-gray-100">
          {rows.map((r) => (
            <div key={r.key} className="px-3 py-2.5">
              <div className="text-sm font-bold text-gray-800">{r.label} <span className="text-xxs font-normal text-gray-400">{r.sub}</span></div>
              <div className="mt-2 space-y-2.5">
                {EXEC.map((c) => {
                  const items = r.cell(c.step);
                  if (!items.length) return null;
                  const cur = stateOf(c.step) === "active";
                  return (
                    <div key={c.step} className="flex gap-2">
                      <span className={`w-16 shrink-0 pt-0.5 text-xxs font-bold leading-tight ${cur ? "text-active-dark" : "text-gray-400"}`}>{pad(c.no)} {c.short}</span>
                      <div className="flex-1 min-w-0 space-y-2.5">{items}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {count > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white px-3 md:px-4 py-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-bold text-gray-800">เงินที่รับแล้ว</span>
            <span className="text-base font-medium tabular-nums text-gray-900">{formatTHB(paid, { decimals: 2 })}</span>
            <span className="text-xs text-gray-500">จาก {formatTHB(sum, { decimals: 2 })} บาท (รวม VAT)</span>
            {onAllInstallments && (
              <button type="button" onClick={onAllInstallments} style={{ minHeight: 0 }} className="ml-auto text-xs font-bold text-active hover:underline">งวดเงินทั้งหมด ›</button>
            )}
          </div>
          <div className="mt-2 flex h-3 gap-0.5 overflow-hidden rounded-full">
            {p.installments.map((it) => <span key={it.id} className={BAR[it.status]} style={{ flex: `${it.pct} 1 0` }} />)}
          </div>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
            {p.installments.map((it) => (
              <div key={it.id} className={`border-l-[3px] pl-2 leading-tight ${LEG[it.status]}`}>
                <div className="text-xxs text-gray-500 truncate" title={it.condition}>งวด {it.no} · {it.trigger_key ? INSTALLMENT_TRIGGER_LABEL[it.trigger_key] ?? it.condition : it.condition}</div>
                <div className="text-xs font-medium tabular-nums text-gray-800">{formatTHB(it.total, { decimals: 2 })}</div>
                <div className="text-xxs text-gray-400">{INSTALLMENT_STATUS_LABEL[it.status]}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
