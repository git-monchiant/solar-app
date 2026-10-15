"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import { useDialog } from "@/components/ui/Dialog";
import { apiFetch, getUserContextHeaders } from "@/lib/api";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatThaiDate, formatTHB } from "@/lib/utils/formatters";
import type { MilestoneFile } from "@/lib/b2b/execution";
import StageBadge from "@/components/b2b/project/StageBadge";
import { MilestoneModal } from "@/components/b2b/project/ExecutionModals";
import { openAuthedFile } from "@/components/b2b/openAuthedFile";

// จัดซื้อโครงการ B2B (แผน 20261015-07 เฟส 4) — โครงการที่รับเงินงวด 1 แล้ว + งบต้นทุนจาก BOQ ที่ได้งาน
//   Purchase เห็นเฉพาะต้นทุน (ไม่มีราคาขาย/มูลค่าสัญญา) · สั่งของครบ → บันทึก milestone "procured" แนบใบสั่งซื้อได้
//   ยกเลิกการบันทึกทำที่หน้าโครงการ (Solar B2B) — หน้านี้แก้วันที่/หมายเหตุได้

type Line = { name: string; brand: string | null; model: string | null; unit: string; qty: number; unit_cost: number; cost: number };
type Row = {
  id: number; code: string; name: string; stage: number; location: string | null; customer_name: string;
  boq: { id: number; doc_no: string; revision: number; option_label: string | null; capacity_wp: number };
  total_cost: number;
  categories: { id: number; name: string; cost: number; lines: Line[] }[];
  procured: { id: number; date: string; note: string | null; by: string | null; files: MilestoneFile[] } | null;
  arrived_date: string | null;
};

const ROLES = ["purchase", "b2b", "admin"] as const;

export default function B2bProcurementPage() {
  const { toast } = useDialog();
  const { activeRoles } = useActiveRoles();
  const canUse = hasRole(activeRoles, ...ROLES);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [onlyPending, setOnlyPending] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [record, setRecord] = useState<{ row: Row; edit: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    apiFetch("/api/b2b/procurement").then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => { if (canUse) load(); }, [canUse, load]);

  if (activeRoles.length > 0 && !canUse) {
    return (
      <div>
        <Header title="จัดซื้อ" subtitle="COMMERCIAL (B2B)" />
        <main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">role ที่กำลังใช้งานไม่มีสิทธิ์เปิดหน้านี้</div></main>
      </div>
    );
  }
  if (!rows) return <Loading />;

  const pending = rows.filter((r) => !r.procured);
  const shown = onlyPending ? pending : rows;

  const save = async (v: { done_date: string; note: string; files: File[] }) => {
    if (!record) return;
    setError(""); setSaving(true);
    try {
      if (record.edit && record.row.procured) {
        await apiFetch(`/api/b2b/milestones/${record.row.procured.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done_date: v.done_date, note: v.note }) });
      } else {
        const fd = new FormData();
        fd.append("kind", "procured"); fd.append("done_date", v.done_date); fd.append("note", v.note);
        for (const f of v.files) fd.append("files", f);
        const res = await fetch(`/api/b2b/projects/${record.row.id}/milestones`, { method: "POST", headers: { ...getUserContextHeaders() }, body: fd });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `HTTP ${res.status}`);
      }
      toast({ message: record.edit ? "แก้ไขแล้ว" : `บันทึกสั่งของครบ ${record.row.code} แล้ว`, variant: "success" });
      setRecord(null); load();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };
  const viewFile = (r: Row, f: MilestoneFile) => {
    void openAuthedFile(`/api/b2b/milestones/${r.procured!.id}/files/${encodeURIComponent(f.file)}`).catch((e) => toast({ message: e.message, variant: "danger" }));
  };

  const chip = (on: boolean) => `h-8 px-3 rounded-full text-sm font-semibold ${on ? "bg-active text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`;
  return (
    <div>
      <Header title="จัดซื้อ" subtitle={`COMMERCIAL (B2B) · รอสั่งของ ${pending.length} โครงการ`} />
      <main className="p-3 md:p-6 space-y-3 max-w-5xl">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={chip(onlyPending)} onClick={() => setOnlyPending(true)}>รอสั่งของ ({pending.length})</button>
          <button type="button" className={chip(!onlyPending)} onClick={() => setOnlyPending(false)}>ทั้งหมด ({rows.length})</button>
          <span className="text-xs text-gray-400">โครงการที่รับเงินงวด 1 แล้ว · งบ = ต้นทุนใน BOQ ที่ได้งาน (ไม่รวมส่วนเสริมแบบทางเลือก และรายการที่คิดเป็น % ของยอดขาย เช่น ประกันภัย)</span>
        </div>
        {shown.length === 0 && <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">{onlyPending ? "ไม่มีโครงการที่รอสั่งของ" : "ยังไม่มีโครงการในขั้นจัดซื้อ"}</div>}
        {shown.map((r) => (
          <section key={r.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex flex-wrap items-start gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-400">{r.code}</span>
                  <h2 className="text-base font-bold text-gray-900">{r.name}</h2>
                  <StageBadge stage={r.stage} sub={null} surveyDate={null} />
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{r.customer_name}{r.location ? ` · ${r.location}` : ""}</div>
                <div className="text-xs text-gray-500">BOQ {r.boq.doc_no} Rev {r.boq.revision}{r.boq.option_label ? ` · ${r.boq.option_label}` : ""} · {formatTHB(r.boq.capacity_wp / 1000, { decimals: 2 })} kWp</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400">งบต้นทุน (ก่อน VAT)</div>
                <div className="text-lg font-bold text-gray-900 tabular-nums">{formatTHB(r.total_cost, { decimals: 2 })}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-4 py-2.5">
              {r.procured ? (
                <div className="flex-1 min-w-0 text-sm">
                  <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">สั่งของครบ {formatThaiDate(r.procured.date)}</span>
                  <span className="ml-2 text-xs text-gray-500">โดย {r.procured.by ?? "—"}{r.arrived_date ? ` · ของเข้าหน้างาน ${formatThaiDate(r.arrived_date)}` : ""}</span>
                  {r.procured.note && <div className="text-xs text-gray-600 mt-0.5">{r.procured.note}</div>}
                  {r.procured.files.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {r.procured.files.map((f) => (
                        <button key={f.file} type="button" onClick={() => viewFile(r, f)} style={{ minHeight: 0 }}
                          className="max-w-[14rem] truncate rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-primary hover:bg-gray-100">📄 {f.name}</button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span className="flex-1 text-sm"><span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">รอสั่งของ</span></span>
              )}
              <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)}
                className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">{open === r.id ? "ซ่อนรายการ" : "ดูรายการวัสดุ"}</button>
              {r.procured ? (
                <button type="button" onClick={() => { setError(""); setRecord({ row: r, edit: true }); }}
                  className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">แก้</button>
              ) : (
                <button type="button" onClick={() => { setError(""); setRecord({ row: r, edit: false }); }}
                  className="h-8 px-3 rounded-lg bg-active text-white text-xs font-semibold hover:bg-active-dark">บันทึกสั่งของครบ</button>
              )}
            </div>
            {open === r.id && (
              <div className="overflow-x-auto border-t border-gray-100">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 bg-gray-50">
                      <th className="px-3 py-2 font-semibold">รายการ</th>
                      <th className="px-3 py-2 font-semibold text-right">จำนวน</th>
                      <th className="px-3 py-2 font-semibold text-right">ต้นทุน/หน่วย</th>
                      <th className="px-3 py-2 font-semibold text-right">ต้นทุนรวม</th>
                    </tr>
                  </thead>
                  {r.categories.map((c) => (
                    <tbody key={c.id}>
                      <tr className="border-t border-gray-200 bg-gray-50/60">
                        <td className="px-3 py-1.5 font-semibold text-gray-800" colSpan={3}>{c.name}</td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{formatTHB(c.cost, { decimals: 2 })}</td>
                      </tr>
                      {c.lines.map((l, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-1.5 text-gray-700">{l.name}{l.brand || l.model ? <span className="text-gray-400"> · {[l.brand, l.model].filter(Boolean).join(" ")}</span> : null}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{formatTHB(l.qty, { decimals: l.qty % 1 ? 2 : 0 })} {l.unit}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatTHB(l.unit_cost, { decimals: 2 })}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatTHB(l.cost, { decimals: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            )}
          </section>
        ))}
      </main>

      {record && (
        <MilestoneModal edit={record.edit} title={`${record.edit ? "แก้" : "บันทึก"}สั่งของครบ · ${record.row.code}`}
          subtitle={record.edit ? "แก้วันที่/หมายเหตุ — ยกเลิกการบันทึกทำที่หน้าโครงการ" : "สั่งวัสดุตามงบ BOQ ครบแล้ว · แนบใบสั่งซื้อได้"}
          initial={record.edit && record.row.procured ? { done_date: record.row.procured.date, note: record.row.procured.note } : undefined}
          saving={saving} error={error} onClose={() => setRecord(null)} onConfirm={(v) => void save(v)} />
      )}
    </div>
  );
}
