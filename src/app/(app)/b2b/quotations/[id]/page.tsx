"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import Dropdown from "@/components/ui/Dropdown";
import { useDialog } from "@/components/ui/Dialog";
import { apiFetch } from "@/lib/api";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatTHB } from "@/lib/utils/formatters";
import type { B2bProject } from "@/lib/b2b/project";
import {
  B2B_QUOTE_EDIT_ROLES, B2B_QUOTE_VIEW_ROLES, QUOTE_KIND_LABEL, QUOTE_STATUS_LABEL, QUOTE_STATUS_TONE,
  editableStatus, quoteTotals, roundUpHundreds, type B2bQuote, type QuoteContent,
} from "@/lib/b2b/quotation";
import { bahtText } from "@/lib/b2b/quotation-doc";
import TierTracker from "@/components/b2b/quote/TierTracker";
import { openQuotePdf } from "@/components/b2b/quote/openQuotePdf";

// หน้าใบเสนอราคา B2B — แก้เนื้อหา (ร่าง/ส่งกลับแก้) · ส่งอนุมัติ 3 ชั้น · ส่งลูกค้า · ออก Rev ใหม่ตอนต่อรอง
// แผน docs/plan/20261015-07-b2b-project-flow.md เฟส 2 · หน้าตาใบจริงดูที่ปุ่ม "ดู PDF" (ผัง SSE)

type Draft = QuoteContent & { boq_id: number };
const toDraft = (q: B2bQuote): Draft => ({
  boq_id: q.boq_id, items: q.items.map((i) => ({ ...i, bullets: [...i.bullets] })), payment_days: q.payment_days,
  installments: q.installments.map((x) => ({ ...x })), vat_pct: q.vat_pct, validity_days: q.validity_days,
  warranty: q.warranty.map((x) => ({ ...x })), install_warranty: q.install_warranty, remarks: [...q.remarks],
  om_years: q.om_years, om_visits_per_year: q.om_visits_per_year,
});

export default function B2bQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { confirm, toast } = useDialog();
  const { activeRoles } = useActiveRoles();
  const canView = hasRole(activeRoles, ...B2B_QUOTE_VIEW_ROLES);
  const canEditRole = hasRole(activeRoles, ...B2B_QUOTE_EDIT_ROLES);
  const [q, setQ] = useState<B2bQuote | null>(null);
  const [project, setProject] = useState<B2bProject | null>(null);
  const [d, setD] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const apply = useCallback((r: B2bQuote) => { setQ(r); setD(toDraft(r)); setDirty(false); setError(""); }, []);
  useEffect(() => {
    if (!canView) return;
    apiFetch(`/api/b2b/quotations/${id}`).then((r: B2bQuote) => {
      apply(r);
      return apiFetch(`/api/b2b/projects/${r.project_id}`).then(setProject);
    }).catch((e) => setLoadError(e instanceof Error ? e.message : "โหลดใบเสนอราคาไม่สำเร็จ"));
  }, [id, canView, apply]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const totals = useMemo(() => (d ? quoteTotals(d) : null), [d]);

  if (activeRoles.length > 0 && !canView) {
    return <div><Header title="ใบเสนอราคา B2B" /><main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">role ที่กำลังใช้งานไม่มีสิทธิ์เปิดหน้านี้</div></main></div>;
  }
  if (loadError) return <div><Header title="ใบเสนอราคา B2B" backHref="/b2b/projects" /><main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{loadError}</div></main></div>;
  if (!q || !d || !totals) return <Loading />;

  const editable = canEditRole && q.is_latest && editableStatus(q.status);
  const set = (patch: Partial<Draft>) => { setD((x) => (x ? { ...x, ...patch } : x)); setDirty(true); };
  const setItem = (i: number, patch: Partial<Draft["items"][number]>) => set({ items: d.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
  const boq = project?.boqs.find((b) => b.id === d.boq_id);
  const cost = boq?.id === q.boq_id && q.boq_snapshot ? q.boq_snapshot.total_cost : boq?.total_cost ?? q.boq.total_cost;
  const margin = cost != null && totals.subtotal > 0 ? ((totals.subtotal - cost) / totals.subtotal) * 100 : null;
  const instSum = Math.round(d.installments.reduce((s, x) => s + (Number(x.pct) || 0), 0) * 100) / 100;

  const run = async (label: string, fn: () => Promise<void>) => {
    setError(""); setBusy(label);
    try { await fn(); } catch (e) { setError(e instanceof Error && e.message ? e.message : "ไม่สำเร็จ"); } finally { setBusy(""); }
  };
  const save = () => run("save", async () => {
    const r = await apiFetch(`/api/b2b/quotations/${q.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: d, boq_id: d.boq_id, expected_updated_at: q.updated_at }),
    });
    apply(r);
    toast({ message: "บันทึกใบเสนอราคาแล้ว", variant: "success" });
  });
  const action = (act: string, text: { title: string; message: string; ok: string; done: string }) => async () => {
    if (dirty) { setError("บันทึกการแก้ไขก่อน"); return; }
    if (!(await confirm({ title: text.title, message: text.message, confirmText: text.ok }))) return;
    await run(act, async () => {
      const r = await apiFetch(`/api/b2b/quotations/${q.id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: act }) }) as B2bQuote;
      if (r.id !== q.id) { router.push(`/b2b/quotations/${r.id}`); return; }
      apply(r);
      toast({ message: text.done, variant: "success" });
    });
  };
  const pdf = () => run("pdf", () => openQuotePdf(q.id));

  const field = "w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-gray-50 disabled:text-gray-600";
  const area = "w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-gray-50 disabled:text-gray-600";
  const label = "block text-xs font-semibold text-gray-500 mb-1";
  const sec = "rounded-xl border border-gray-300 bg-white p-4";
  const h2 = "text-sm font-bold text-gray-900 mb-3";
  const small = "h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50";
  const del = "h-9 w-9 shrink-0 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200";

  return (
    <div>
      <Header title={`ใบเสนอราคา ${q.doc_no}`} subtitle={`Rev ${q.revision} · ${QUOTE_KIND_LABEL[q.kind]}`} backHref={`/b2b/projects/${q.project_id}`}
        rightContent={q.revisions.length > 1 ? (
          <Dropdown className="w-36" value={String(q.id)} onChange={(v) => { if (v && v !== String(q.id)) router.push(`/b2b/quotations/${v}`); }}
            options={q.revisions.map((r) => ({ value: String(r.id), label: `Rev ${r.revision}${r.is_latest ? " (ล่าสุด)" : ""}` }))} />
        ) : undefined} />

      <div className="p-3 md:p-6 space-y-4 pb-24">
        <section className={sec}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${QUOTE_STATUS_TONE[q.status]}`}>{QUOTE_STATUS_LABEL[q.status]}</span>
            {project && <span className="text-sm text-gray-600">โครงการ <Link href={`/b2b/projects/${project.id}`} className="font-semibold text-primary hover:underline">{project.code} · {project.name}</Link> · {project.customer.name}</span>}
            {!q.is_latest && <span className="text-sm text-amber-700">Rev เก่า — อ่านอย่างเดียว</span>}
          </div>
          <div className="mt-3"><TierTracker q={q} /></div>
          {q.status === "changes_required" && q.returned && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <b>ส่งกลับแก้</b>{q.returned.by ? ` โดย ${q.returned.by}` : ""} — {q.returned.note}
            </div>
          )}
          {q.status === "sent" && q.sent_at && <p className="mt-2 text-sm text-blue-700">ส่งลูกค้าแล้ว{q.sent_by_name ? ` โดย ${q.sent_by_name}` : ""}</p>}
        </section>

        <fieldset disabled={!editable} className="space-y-4 min-w-0">
          <section className={sec}>
            <h2 className={h2}>เสนอจาก BOQ</h2>
            <div className="grid gap-3 md:grid-cols-12 items-end">
              <div className="md:col-span-6"><label className={label}>BOQ ตัวเลือก (Rev ล่าสุด)</label>
                <Dropdown disabled={!editable} value={String(d.boq_id)} onChange={(v) => { if (v) set({ boq_id: Number(v) }); }}
                  options={[
                    ...(project?.boqs ?? []).map((b) => ({ value: String(b.id), label: `${b.option_label || b.doc_no} · ${b.doc_no} Rev ${b.revision}` })),
                    ...(project?.boqs.some((b) => b.id === q.boq_id) ? [] : [{ value: String(q.boq_id), label: `${q.boq.option_label || q.boq.doc_no} · ${q.boq.doc_no} Rev ${q.boq.revision} (Rev เก่า)` }]),
                  ]} /></div>
              <dl className="md:col-span-6 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-xs text-gray-400">ขนาด</dt><dd className="font-medium tabular-nums">{(boq?.capacity_wp ?? q.boq.capacity_wp) ? `${formatTHB((boq?.capacity_wp ?? q.boq.capacity_wp)! / 1000, { decimals: 2 })} kWp` : "—"}</dd></div>
                <div><dt className="text-xs text-gray-400">ต้นทุน BOQ</dt><dd className="font-medium tabular-nums">{cost != null ? formatTHB(cost, { decimals: 0 }) : "—"}</dd></div>
                <div><dt className="text-xs text-gray-400">ราคาขาย BOQ</dt><dd className="font-medium tabular-nums">{(boq?.total_sale ?? q.boq.total_sale) != null ? formatTHB((boq?.total_sale ?? q.boq.total_sale)!, { decimals: 0 }) : "—"}</dd></div>
              </dl>
            </div>
            {(boq?.pending_lines ?? q.boq.pending_lines) > 0 && (
              <p className="mt-2 text-sm font-semibold text-red-600">BOQ ยังมีบรรทัดรอราคา {boq?.pending_lines ?? q.boq.pending_lines} — ส่งอนุมัติไม่ได้จนกว่า Purchase ใส่ราคาครบ</p>
            )}
          </section>

          <section className={sec}>
            <div className="flex items-center gap-2 mb-3"><h2 className="text-sm font-bold text-gray-900">รายการ</h2>
              {editable && <button type="button" className={`ml-auto ${small}`} onClick={() => set({ items: [...d.items, { title: "", kwp: null, amount: 0, bullets: [] }] })}>+ รายการ</button>}</div>
            <div className="space-y-4">
              {d.items.map((it, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
                  <div className="grid gap-2 md:grid-cols-12 items-end">
                    <div className="md:col-span-7"><label className={label}>{i + 1}. ชื่องาน</label>
                      <input className={field} value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} /></div>
                    <div className="md:col-span-2"><label className={label}>kWp</label>
                      <input type="number" step="0.01" className={`${field} text-right`} value={it.kwp ?? ""} onChange={(e) => setItem(i, { kwp: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                    <div className="md:col-span-3 flex gap-2 items-end">
                      <div className="flex-1"><label className={label}>จำนวนเงิน (บาท)</label>
                        <input type="number" step="1" className={`${field} text-right`} value={it.amount} onChange={(e) => setItem(i, { amount: Number(e.target.value) || 0 })} /></div>
                      {editable && d.items.length > 1 && <button type="button" className={del} title="ลบรายการ" onClick={() => set({ items: d.items.filter((_, k) => k !== i) })}>✕</button>}
                    </div>
                  </div>
                  {editable && i === 0 && boq?.total_sale != null && it.amount !== roundUpHundreds(boq.total_sale) && (
                    <button type="button" className="text-xs font-semibold text-primary hover:underline" style={{ minHeight: 0 }}
                      onClick={() => setItem(0, { amount: roundUpHundreds(boq.total_sale!) })}>ใช้ราคาขาย BOQ ปัดขึ้นหลักร้อย ({formatTHB(roundUpHundreds(boq.total_sale), { decimals: 0 })})</button>
                  )}
                  <div><label className={label}>รายละเอียด (บรรทัดละข้อ — ขึ้นในใบเป็น &quot;- …&quot;)</label>
                    <textarea rows={Math.max(3, it.bullets.length + 1)} className={area} value={it.bullets.join("\n")}
                      onChange={(e) => setItem(i, { bullets: e.target.value.split("\n") })} /></div>
                </div>
              ))}
            </div>
          </section>

          <section className={sec}>
            <div className="flex items-center gap-2 mb-3"><h2 className="text-sm font-bold text-gray-900">เงื่อนไขการชำระเงิน</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${instSum === 100 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>รวม {instSum}%</span>
              {editable && <button type="button" className={`ml-auto ${small}`} onClick={() => set({ installments: [...d.installments, { pct: 0, condition: "" }] })}>+ งวด</button>}</div>
            <div className="max-w-[12rem] mb-3"><label className={label}>ชำระภายใน (วัน)</label>
              <input type="number" className={`${field} text-right`} value={d.payment_days} onChange={(e) => set({ payment_days: Number(e.target.value) || 0 })} /></div>
            <div className="space-y-2">
              {d.installments.map((x, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="w-14 shrink-0 text-sm text-gray-500">งวด {i + 1}</span>
                  <input type="number" step="0.01" className={`${field} w-20 text-right`} value={x.pct} aria-label={`งวด ${i + 1} %`}
                    onChange={(e) => set({ installments: d.installments.map((y, k) => (k === i ? { ...y, pct: Number(e.target.value) } : y)) })} />
                  <span className="text-sm text-gray-500">%</span>
                  <input className={field} value={x.condition} placeholder="เมื่อ…" aria-label={`งวด ${i + 1} เงื่อนไข`}
                    onChange={(e) => set({ installments: d.installments.map((y, k) => (k === i ? { ...y, condition: e.target.value } : y)) })} />
                  {editable && d.installments.length > 1 && <button type="button" className={del} title="ลบงวด" onClick={() => set({ installments: d.installments.filter((_, k) => k !== i) })}>✕</button>}
                </div>
              ))}
            </div>
          </section>

          <section className={sec}>
            <h2 className={h2}>ยอดเงิน</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="max-w-[10rem]"><label className={label}>VAT (%)</label>
                <input type="number" step="0.01" className={`${field} text-right`} value={d.vat_pct} onChange={(e) => set({ vat_pct: Number(e.target.value) || 0 })} /></div>
              <dl className="text-sm space-y-1">
                <div className="flex justify-between"><dt className="text-gray-500">ราคาก่อน VAT</dt><dd className="tabular-nums font-medium">{formatTHB(totals.subtotal, { decimals: 2 })}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">VAT {d.vat_pct}%</dt><dd className="tabular-nums">{formatTHB(totals.vat, { decimals: 2 })}</dd></div>
                <div className="flex justify-between border-t border-gray-200 pt-1"><dt className="font-bold">รวมเงิน</dt><dd className="tabular-nums font-bold">{formatTHB(totals.total, { decimals: 2 })}</dd></div>
                <div className="text-right text-xs text-gray-500">( {bahtText(totals.total)} )</div>
                {margin != null && <div className="flex justify-between text-xs"><dt className="text-gray-500">margin จากราคาในใบเทียบต้นทุน BOQ</dt><dd className={`tabular-nums font-semibold ${margin < 10 ? "text-red-600" : "text-gray-700"}`}>{margin.toFixed(1)}%</dd></div>}
              </dl>
            </div>
          </section>

          <section className={sec}>
            <div className="flex items-center gap-2 mb-3"><h2 className="text-sm font-bold text-gray-900">รายละเอียดการรับประกัน</h2>
              {editable && <button type="button" className={`ml-auto ${small}`} onClick={() => set({ warranty: [...d.warranty, { label: "", value: "" }] })}>+ ข้อ</button>}</div>
            <div className="space-y-2">
              {d.warranty.map((w, i) => (
                <div key={i} className="flex gap-2">
                  <input className={`${field} md:w-80`} value={w.label} placeholder="การประกัน …" aria-label="หัวข้อรับประกัน"
                    onChange={(e) => set({ warranty: d.warranty.map((y, k) => (k === i ? { ...y, label: e.target.value } : y)) })} />
                  <input className={field} value={w.value} placeholder="ระยะเวลา / เงื่อนไข" aria-label="รายละเอียดรับประกัน"
                    onChange={(e) => set({ warranty: d.warranty.map((y, k) => (k === i ? { ...y, value: e.target.value } : y)) })} />
                  {editable && <button type="button" className={del} title="ลบข้อ" onClick={() => set({ warranty: d.warranty.filter((_, k) => k !== i) })}>✕</button>}
                </div>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-12 mt-3">
              <div className="md:col-span-3"><label className={label}>ยืนยันราคา (วันนับจากวันที่ในใบ)</label>
                <input type="number" className={`${field} text-right`} value={d.validity_days} onChange={(e) => set({ validity_days: Number(e.target.value) || 0 })} /></div>
              <div className="md:col-span-9"><label className={label}>รับประกันการติดตั้ง เป็นระยะเวลา</label>
                <input className={field} value={d.install_warranty} onChange={(e) => set({ install_warranty: e.target.value })} /></div>
            </div>
          </section>

          <section className={sec}>
            <div className="flex items-center gap-2 mb-3"><h2 className="text-sm font-bold text-gray-900">หมายเหตุ</h2>
              {editable && <button type="button" className={`ml-auto ${small}`} onClick={() => set({ remarks: [...d.remarks, ""] })}>+ ข้อ</button>}</div>
            <div className="space-y-2">
              {d.remarks.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <span className="w-6 shrink-0 pt-2 text-sm text-gray-500">{i + 1})</span>
                  <textarea rows={2} className={area} value={r} aria-label={`หมายเหตุข้อ ${i + 1}`}
                    onChange={(e) => set({ remarks: d.remarks.map((y, k) => (k === i ? e.target.value : y)) })} />
                  {editable && <button type="button" className={del} title="ลบข้อ" onClick={() => set({ remarks: d.remarks.filter((_, k) => k !== i) })}>✕</button>}
                </div>
              ))}
            </div>
          </section>

          <section className={sec}>
            <h2 className={h2}>O&amp;M ที่รวมในราคา <span className="font-normal text-xs text-gray-400">— เก็บไว้ให้โมดูล O&amp;M B2B ภายหลัง · ข้อความในใบแก้ที่รายการ/หมายเหตุ</span></h2>
            <div className="grid gap-3 grid-cols-2 max-w-sm">
              <div><label className={label}>จำนวนปี</label>
                <input type="number" className={`${field} text-right`} value={d.om_years ?? ""} onChange={(e) => set({ om_years: e.target.value === "" ? null : Number(e.target.value) })} /></div>
              <div><label className={label}>ครั้งต่อปี</label>
                <input type="number" className={`${field} text-right`} value={d.om_visits_per_year ?? ""} onChange={(e) => set({ om_visits_per_year: e.target.value === "" ? null : Number(e.target.value) })} /></div>
            </div>
          </section>
        </fieldset>
      </div>

      {/* แถบท้าย — แบบหน้าทำ BOQ (sticky bottom-0) */}
      <div className="sticky bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur px-3 md:px-6 py-3">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <span className={`text-sm ${dirty ? "font-semibold text-amber-700" : "text-gray-500"}`}>
            {editable ? (dirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "บันทึกแล้ว") : QUOTE_STATUS_LABEL[q.status]}
          </span>
          {error && <span className="text-sm text-red-600">{error}</span>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void pdf()} disabled={busy === "pdf"}
              className="h-9 whitespace-nowrap rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">{busy === "pdf" ? "กำลังสร้าง…" : "ดู PDF"}</button>
            {canEditRole && q.is_latest && (q.status === "approved" || q.status === "sent") && (
              <button type="button" disabled={!!busy} onClick={action("revise", { title: "ออก Revision ใหม่", message: `คัดลอกใบนี้เป็น Rev ${q.revision + 1} (ร่าง) เพื่อแก้ราคา/เงื่อนไขตามที่ลูกค้าต่อรอง — Rev ${q.revision} คงไว้ตามที่ส่งไปแล้ว`, ok: "ออก Rev ใหม่", done: "" })}
                className="h-9 whitespace-nowrap rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-600 hover:bg-gray-50">ออก Rev ใหม่</button>
            )}
            {canEditRole && q.status === "approved" && (
              <button type="button" disabled={!!busy} onClick={action("send", { title: "บันทึกว่าส่งลูกค้าแล้ว", message: "ใช้ PDF ที่อนุมัติครบ 3 ชั้นส่งลูกค้า — ระบบบันทึกเวลาส่ง", ok: "ส่งลูกค้าแล้ว", done: "บันทึกส่งลูกค้าแล้ว" })}
                className="h-9 whitespace-nowrap rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">ส่งลูกค้าแล้ว</button>
            )}
            {editable && (
              <>
                <button type="button" onClick={() => void save()} disabled={!!busy || !dirty}
                  className="h-9 whitespace-nowrap rounded-lg border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-40">{busy === "save" ? "กำลังบันทึก…" : "บันทึก"}</button>
                <button type="button" disabled={!!busy || dirty} title={dirty ? "บันทึกก่อนส่งอนุมัติ" : undefined}
                  onClick={action("submit", { title: "ส่งอนุมัติ", message: "แช่เนื้อหาใบ + ตัวเลข BOQ ณ ตอนนี้ แล้วส่งให้ผู้ตรวจสอบ 1 → 2 → 3 ตามลำดับ — แก้ใบไม่ได้จนกว่าจะถูกส่งกลับ", ok: "ส่งอนุมัติ", done: "ส่งอนุมัติแล้ว — รอผู้ตรวจสอบ 1" })}
                  className="h-9 whitespace-nowrap rounded-lg bg-active px-5 text-sm font-semibold text-white hover:bg-active-dark disabled:opacity-40">ส่งอนุมัติ</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
