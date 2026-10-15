"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import { useDialog } from "@/components/ui/Dialog";
import { apiFetch, getUserContextHeaders } from "@/lib/api";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatThaiDate, formatTHB } from "@/lib/utils/formatters";
import { QUOTE_KIND_LABEL, QUOTE_STATUS_LABEL, tierOfStatus, type B2bQuote, type QuoteStatus } from "@/lib/b2b/quotation";
import TierTracker from "@/components/b2b/quote/TierTracker";
import { openQuotePdf } from "@/components/b2b/quote/openQuotePdf";
import { ReasonModal } from "@/components/b2b/project/ActionModals";

// หน้าอนุมัติใบเสนอราคา B2B — คิวซ้าย (เฉพาะชั้นของ role ที่สวมอยู่ · admin ทุกชั้น) · รายละเอียดขวา
// กลไกเดียวกับหน้าอนุมัติ B2C (ติ๊กยืนยัน · ส่งกลับพร้อมเหตุผล) + ตัวเลขต้นทุน/margin และเทียบกับ Rev ก่อน (แผน 20261015-07)

type Row = {
  id: number; doc_no: string; revision: number; kind: "estimate" | "confirmed"; status: QuoteStatus;
  subtotal: number; total: number; submitted_at: string; proposer_name: string | null; boq_cost: number | null; capacity_wp: number | null;
  project_id: number; project_code: string; project_name: string; customer_name: string; option_label: string | null;
};
type Detail = { q: B2bQuote; prev: B2bQuote | null; html: string };

const APPROVER_ROLES = ["b2b_review1", "b2b_review2", "b2b_review3", "admin"] as const;
const pct = (n: number) => `${n.toFixed(1)}%`;

export default function B2bApprovalsPage() {
  const { confirm, toast } = useDialog();
  const { activeRoles } = useActiveRoles();
  const canUse = hasRole(activeRoles, ...APPROVER_ROLES);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [certify, setCertify] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [returning, setReturning] = useState(false);

  const loadQueue = useCallback(async (keep?: number | null) => {
    const r = await apiFetch("/api/b2b/approvals") as Row[];
    setRows(r);
    setSelected(keep != null && r.some((x) => x.id === keep) ? keep : r[0]?.id ?? null);
  }, []);
  useEffect(() => { if (canUse) loadQueue().catch(() => setRows([])); }, [canUse, loadQueue]);

  useEffect(() => {
    if (selected == null) return;
    let cancelled = false;
    (async () => {
      const q = await apiFetch(`/api/b2b/quotations/${selected}`) as B2bQuote;
      const prevRef = q.revisions.find((r) => r.revision === q.revision - 1);
      const [prev, html] = await Promise.all([
        prevRef ? apiFetch(`/api/b2b/quotations/${prevRef.id}`) as Promise<B2bQuote> : Promise.resolve(null),
        fetch(`/api/b2b/quotations/${selected}/pdf?format=html`, { headers: { ...getUserContextHeaders() } }).then((r) => (r.ok ? r.text() : "")),
      ]);
      if (!cancelled) { setDetail({ q, prev, html }); setCertify(false); setNote(""); setError(""); }
    })().catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "โหลดใบไม่สำเร็จ"); });
    return () => { cancelled = true; };
  }, [selected]);

  if (activeRoles.length > 0 && !canUse) {
    return <div><Header title="อนุมัติ B2B" /><main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">หน้านี้สำหรับผู้ตรวจสอบใบเสนอราคา B2B</div></main></div>;
  }
  if (!rows) return <Loading />;

  const q = detail && detail.q.id === selected ? detail.q : null;
  const prev = q ? detail!.prev : null;
  const tier = q ? tierOfStatus(q.status) : null;
  const act = async (action: "approve" | "return", reason?: string) => {
    if (!q) return;
    setError(""); setBusy(true);
    try {
      await apiFetch(`/api/b2b/quotations/${q.id}/action`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "approve" ? { action, certify, note: note || null } : { action, note: reason }),
      });
      toast({ message: action === "approve" ? `อนุมัติ ${q.doc_no} Rev ${q.revision} แล้ว` : "ส่งกลับแก้แล้ว", variant: "success" });
      setReturning(false);
      await loadQueue(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    if (!q || !tier) return;
    const ok = await confirm({ title: `อนุมัติในฐานะผู้ตรวจสอบ ${tier}`, message: `ลายเซ็นของคุณจะขึ้นในช่อง "ผู้ตรวจสอบ" ช่องที่ ${tier} ของ ${q.doc_no} Rev ${q.revision}${tier < 3 ? ` แล้วส่งต่อผู้ตรวจสอบ ${tier + 1}` : " — ครบ 3 ชั้น ส่งลูกค้าได้"}`, confirmText: "อนุมัติ" });
    if (ok) await act("approve");
  };

  // ตัวเลขหลัก — ต้นทุนจาก snapshot ตอนส่ง (ตัวเลขที่ผู้ตรวจสอบเห็น = ตอนที่ใบถูกส่งมา)
  const cost = q?.boq_snapshot?.total_cost ?? null;
  const cap = q?.boq_snapshot?.capacity_wp ?? q?.boq.capacity_wp ?? null;
  const margin = q && cost != null && q.subtotal > 0 ? ((q.subtotal - cost) / q.subtotal) * 100 : null;
  const prevCost = prev?.boq_snapshot?.total_cost ?? null;
  const prevMargin = prev && prevCost != null && prev.subtotal > 0 ? ((prev.subtotal - prevCost) / prev.subtotal) * 100 : null;
  const diffRows: [string, string, string][] = q && prev ? [
    ["ชนิดใบ", QUOTE_KIND_LABEL[prev.kind], QUOTE_KIND_LABEL[q.kind]],
    ["BOQ", `${prev.boq.doc_no} Rev ${prev.boq.revision}`, `${q.boq.doc_no} Rev ${q.boq.revision}`],
    ["ราคาก่อน VAT", formatTHB(prev.subtotal, { decimals: 0 }), formatTHB(q.subtotal, { decimals: 0 })],
    ["ต้นทุน BOQ", prevCost != null ? formatTHB(prevCost, { decimals: 0 }) : "—", cost != null ? formatTHB(cost, { decimals: 0 }) : "—"],
    ["Margin", prevMargin != null ? pct(prevMargin) : "—", margin != null ? pct(margin) : "—"],
    ["งวดเงิน", prev.installments.map((x) => x.pct).join(" / "), q.installments.map((x) => x.pct).join(" / ")],
    ["ยืนยันราคา", `${prev.validity_days} วัน`, `${q.validity_days} วัน`],
    ["รายละเอียดรายการ", `${prev.items.reduce((s, i) => s + i.bullets.length, 0)} บรรทัด`, `${q.items.reduce((s, i) => s + i.bullets.length, 0)} บรรทัด`],
    ["หมายเหตุ", `${prev.remarks.length} ข้อ`, `${q.remarks.length} ข้อ`],
  ] : [];

  const tile = "rounded-xl border border-gray-200 bg-white px-3 py-2";
  return (
    <div>
      <Header title="อนุมัติ B2B" subtitle={`ใบเสนอราคา B2B · รอคุณ ${rows.length} ใบ`} />
      <div className="p-3 md:p-6 grid gap-4 lg:grid-cols-[20rem_1fr] items-start">
        <aside className="rounded-xl border border-gray-300 bg-white overflow-hidden">
          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">ไม่มีใบรออนุมัติ</div>
          ) : rows.map((r) => (
            <button key={r.id} type="button" onClick={() => setSelected(r.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${selected === r.id ? "bg-active-light shadow-[inset_3px_0_0_var(--color-active)]" : "hover:bg-gray-50"}`}>
              <div className="flex justify-between gap-2 text-sm font-bold text-gray-900"><span className="truncate">{r.project_name}</span><span className="tabular-nums shrink-0">{formatTHB(r.subtotal, { decimals: 0 })}</span></div>
              <div className="text-xs text-gray-500">{r.doc_no} Rev {r.revision} · {QUOTE_KIND_LABEL[r.kind]}{r.option_label ? ` · ${r.option_label}` : ""}</div>
              <div className="text-xs text-gray-500">{QUOTE_STATUS_LABEL[r.status]} · ส่ง {formatThaiDate(r.submitted_at, { time: true })}</div>
            </button>
          ))}
        </aside>

        {!q ? (rows.length > 0 ? <Loading /> : null) : (
          <section className="space-y-4 min-w-0">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900">{q.doc_no} Rev {q.revision} — {rows.find((r) => r.id === q.id)?.project_name}</h2>
                <p className="text-sm text-gray-500">{QUOTE_KIND_LABEL[q.kind]} · {q.boq.option_label || q.boq.doc_no} ({q.boq.doc_no} Rev {q.boq.revision}) · ผู้เสนอราคา {q.proposer.name ?? "—"}</p>
              </div>
              <div className="ml-auto flex gap-2">
                <Link href={`/b2b/projects/${q.project_id}`} className="h-9 px-3 inline-flex items-center rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">หน้าโครงการ</Link>
                <Link href={`/b2b/boq/${q.boq_id}`} className="h-9 px-3 inline-flex items-center rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">ดู BOQ</Link>
                <button type="button" onClick={() => void openQuotePdf(q.id).catch((e) => setError(e.message))} className="h-9 px-3 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">เปิด PDF</button>
              </div>
            </div>

            <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className={tile}><dt className="text-xs text-gray-500">ราคาก่อน VAT</dt><dd className="text-xl font-medium tabular-nums">{formatTHB(q.subtotal, { decimals: 0 })}</dd>
                {prev && <dd className={`text-xs ${q.subtotal < prev.subtotal ? "text-red-600" : "text-emerald-600"}`}>{q.subtotal === prev.subtotal ? "เท่า Rev ก่อน" : `${q.subtotal < prev.subtotal ? "▼" : "▲"} ${formatTHB(Math.abs(q.subtotal - prev.subtotal), { decimals: 0 })} จาก Rev ${prev.revision}`}</dd>}</div>
              <div className={tile}><dt className="text-xs text-gray-500">ต้นทุน BOQ (ตอนส่ง)</dt><dd className="text-xl font-medium tabular-nums">{cost != null ? formatTHB(cost, { decimals: 0 }) : "—"}</dd></div>
              <div className={tile}><dt className="text-xs text-gray-500">Margin จริง</dt><dd className={`text-xl font-medium tabular-nums ${margin != null && margin < 10 ? "text-red-600" : ""}`}>{margin != null ? pct(margin) : "—"}</dd>
                {prevMargin != null && margin != null && <dd className="text-xs text-gray-500">Rev ก่อน {pct(prevMargin)}</dd>}</div>
              <div className={tile}><dt className="text-xs text-gray-500">บาท / Wp</dt><dd className="text-xl font-medium tabular-nums">{cap ? (q.subtotal / cap).toFixed(2) : "—"}</dd><dd className="text-xs text-gray-500">{cap ? `${formatTHB(cap / 1000, { decimals: 2 })} kWp` : ""}</dd></div>
            </dl>

            <TierTracker q={q} />

            <div className="grid gap-4 xl:grid-cols-2 items-start">
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 text-sm font-bold text-gray-900">{prev ? `เทียบกับ Rev ${prev.revision} (${QUOTE_STATUS_LABEL[prev.status]})` : "Rev แรกของใบนี้ — ไม่มีให้เทียบ"}</div>
                {prev && (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-gray-500"><th className="px-3 py-1.5">เรื่อง</th><th className="px-3 py-1.5">Rev {prev.revision}</th><th className="px-3 py-1.5">Rev {q.revision}</th></tr></thead>
                    <tbody>
                      {diffRows.map(([k, a, b]) => (
                        <tr key={k} className="border-t border-gray-100">
                          <td className="px-3 py-1.5 text-gray-500">{k}</td><td className="px-3 py-1.5 tabular-nums">{a}</td>
                          <td className={`px-3 py-1.5 tabular-nums ${a === b ? "text-gray-400" : "font-semibold text-gray-900"}`}>{a === b ? "ไม่เปลี่ยน" : b}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {/* ตัวอย่างใบ (HTML ชุดเดียวกับ PDF) ย่อลงให้พอดีคอลัมน์ */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 text-sm font-bold text-gray-900">ตัวอย่างใบ</div>
                <div className="h-[28rem] overflow-auto bg-gray-100">
                  <iframe title="ตัวอย่างใบเสนอราคา" srcDoc={detail?.html ?? ""} sandbox="" className="origin-top-left border-0 bg-white"
                    style={{ width: "210mm", height: "600mm", transform: "scale(0.5)" }} />
                </div>
              </div>
            </div>

            {tier && (
              <div className="rounded-xl border border-gray-300 bg-white p-4 space-y-3">
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-active)]" checked={certify} onChange={(e) => setCertify(e.target.checked)} />
                  <span>ข้าพเจ้าตรวจสอบราคา margin งวดเงิน และเงื่อนไขในใบเสนอราคานี้แล้ว
                    <span className="block text-xs text-gray-500">กดอนุมัติแล้ว ชื่อ + ลายเซ็นในโปรไฟล์ของคุณขึ้นในช่อง &quot;ผู้ตรวจสอบ&quot; ช่องที่ {tier} ทันที</span></span>
                </label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุถึงชั้นถัดไป (ไม่บังคับ)"
                  className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-primary" />
                <div className="flex flex-wrap items-center gap-2">
                  {error && <span className="text-sm text-red-600">{error}</span>}
                  <div className="ml-auto flex gap-2">
                    <button type="button" disabled={busy} onClick={() => { setError(""); setReturning(true); }}
                      className="h-9 px-4 rounded-lg border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50">ส่งกลับแก้…</button>
                    <button type="button" disabled={busy || !certify} onClick={() => void approve()}
                      className="h-9 px-5 rounded-lg bg-active text-white text-sm font-semibold hover:bg-active-dark disabled:opacity-40">อนุมัติ (ผู้ตรวจสอบ {tier})</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {returning && q && (
        <ReasonModal title="ส่งกลับแก้" subtitle={`${q.doc_no} Rev ${q.revision} กลับไปที่ผู้เสนอราคา — ส่งใหม่เริ่มผู้ตรวจสอบ 1`} label="เหตุผล / สิ่งที่ต้องแก้" danger
          placeholder="เช่น margin ต่ำกว่าเกณฑ์ · งวด 2 ควรผูกกับของเข้าหน้างาน" confirmText="ส่งกลับแก้" saving={busy} error={error}
          onClose={() => setReturning(false)} onConfirm={(reason) => void act("return", reason)} />
      )}
    </div>
  );
}
