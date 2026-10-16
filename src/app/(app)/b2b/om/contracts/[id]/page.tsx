"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import { useDialog } from "@/components/ui/Dialog";
import { apiFetch, getUserContextHeaders } from "@/lib/api";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatThaiDate } from "@/lib/utils/formatters";
import type { B2bUserOption } from "@/lib/b2b/project";
import {
  B2B_OM_ROLES, CONTRACT_STATUS_LABEL, CONTRACT_STATUS_TONE, thaiMonth, visitStepLabel, visitStepTone,
  type B2bOmContractDetail, type B2bOmVisit, type VisitFile,
} from "@/lib/b2b/om";
import ModalShell, { areaCls, fieldCls, labelCls } from "@/components/b2b/project/ModalShell";
import { ReasonModal } from "@/components/b2b/project/ActionModals";
import { CloseVisitModal, ScheduleVisitModal } from "@/components/b2b/om/VisitModals";
import { openAuthedFile } from "@/components/b2b/openAuthedFile";

// สัญญา O&M B2B 1 ฉบับ (แผน 20261015-09 เฟส 1) — ข้อมูลสัญญา · ตารางครั้ง 1..M (นัด/เลื่อน/ปิดงาน/ข้าม/เปิดกลับ) · timeline
//   ?visit= ไฮไลต์ครั้งที่กดมาจากหน้ารายการ · ข้ามครั้ง = ใช้สิทธิ์แล้ว (เคาะ 15 ต.ค.)
type Modal = null | "schedule" | "close" | "unschedule" | "skip" | "reopen" | "contact";
const KIND: Record<string, string> = {
  created: "สร้างสัญญา", scheduled: "นัดเข้างาน", rescheduled: "เลื่อนนัด", unscheduled: "ยกเลิกนัด", skipped: "ข้ามครั้ง",
  closed: "ปิดงาน", reopened: "เปิดกลับ", edited: "แก้ข้อมูลสัญญา",
};

export default function B2bOmContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const focus = Number(searchParams.get("visit")) || null;
  const { toast } = useDialog();
  const { activeRoles } = useActiveRoles();
  const canUse = hasRole(activeRoles, ...B2B_OM_ROLES);
  const [c, setC] = useState<B2bOmContractDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [users, setUsers] = useState<B2bUserOption[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [visit, setVisit] = useState<B2bOmVisit | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [contact, setContact] = useState({ name: "", phone: "", note: "" });

  const load = useCallback(() => {
    apiFetch(`/api/b2b/om/contracts/${id}`).then(setC).catch((e) => setLoadError(e instanceof Error ? e.message : "โหลดสัญญาไม่สำเร็จ"));
  }, [id]);
  useEffect(() => {
    if (!canUse) return;
    load();
    apiFetch("/api/b2b/projects/options").then((r) => setUsers(r.users)).catch(() => {});
  }, [canUse, load]);
  const loaded = c != null;
  useEffect(() => {
    if (!loaded || !focus) return;
    const t = setTimeout(() => document.getElementById(`visit-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    return () => clearTimeout(t);
  }, [loaded, focus]);

  if (activeRoles.length > 0 && !canUse) {
    return (
      <div>
        <Header title="สัญญา O&M" subtitle="O&M B2B" />
        <main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">role ที่กำลังใช้งานไม่มีสิทธิ์เปิดหน้านี้</div></main>
      </div>
    );
  }
  if (loadError) return <div><Header title="สัญญา O&M" backHref="/b2b/om/contracts" /><main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{loadError}</div></main></div>;
  if (!c) return <Loading />;

  const live = c.status !== "cancelled";
  const openModal = (m: Modal, v?: B2bOmVisit) => { setError(""); if (v) setVisit(v); setModal(m); };
  const run = async (fn: () => Promise<void>, done: string) => {
    setError(""); setSaving(true);
    try { await fn(); setModal(null); load(); toast({ message: done, variant: "success" }); }
    catch (e) { setError(e instanceof Error && e.message ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  const act = (body: Record<string, unknown>, done: string) => run(async () => {
    if (!visit) return;
    await apiFetch(`/api/b2b/om/visits/${visit.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }, done);
  const closeVisit = (v: { done_date: string; note: string; files: File[] }) => run(async () => {
    if (!visit) return;
    if (v.files.length === 0) throw new Error("แนบรายงานหรือรูปหน้างานอย่างน้อย 1 ไฟล์");
    const fd = new FormData();
    fd.append("done_date", v.done_date); fd.append("note", v.note);
    for (const f of v.files) fd.append("files", f);
    const res = await fetch(`/api/b2b/om/visits/${visit.id}/close`, { method: "POST", headers: { ...getUserContextHeaders() }, body: fd });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `HTTP ${res.status}`);
  }, `ปิดครั้งที่ ${visit?.seq_no} แล้ว`);
  const saveContact = () => run(async () => {
    await apiFetch(`/api/b2b/om/contracts/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_name: contact.name, contact_phone: contact.phone, note: contact.note }) });
  }, "บันทึกแล้ว");
  const viewFile = (v: B2bOmVisit, f: VisitFile) => {
    void openAuthedFile(`/api/b2b/om/visits/${v.id}/files/${encodeURIComponent(f.file)}`).catch((e) => toast({ message: e.message, variant: "danger" }));
  };

  const btn = "h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap";
  const dt = "text-xs text-gray-400";
  const mapLink = c.latitude != null && c.longitude != null ? `https://www.google.com/maps?q=${c.latitude},${c.longitude}` : null;

  const visitRow = (v: B2bOmVisit) => (
    <li key={v.id} id={`visit-${v.id}`} className={`flex flex-wrap gap-3 px-4 py-3 scroll-mt-24 ${focus === v.id ? "bg-active-light/60 ring-1 ring-inset ring-active/40" : ""}`}>
      <div className="w-14 shrink-0 text-center">
        <div className="text-lg font-bold tabular-nums text-gray-900 leading-none">{v.seq_no}</div>
        <div className="text-[10px] text-gray-400">/ {c.visits_total}</div>
      </div>
      <div className="flex-1 min-w-[14rem] space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${visitStepTone(v.step)}`}>{visitStepLabel(v.step)}</span>
          <span className="text-xs text-gray-500">กำหนด {thaiMonth(v.due_date)}</span>
        </div>
        {v.scheduled_date && v.status !== "skipped" && (
          <div className="text-sm text-gray-800">นัด {formatThaiDate(v.scheduled_date, { weekday: true })}{v.days && v.days > 1 ? ` · ${v.days} วัน` : ""}{v.lead_name ? ` · ${v.lead_name}` : ""}</div>
        )}
        {v.schedule_note && v.status === "scheduled" && <div className="text-xs text-gray-500">{v.schedule_note}</div>}
        {v.status === "done" && (
          <>
            <div className="text-sm text-gray-800">เข้างาน {formatThaiDate(v.done_date)} · ปิดโดย {v.closed_by_name ?? "—"}</div>
            {v.result_note && <div className="text-xs text-gray-600 whitespace-pre-line">{v.result_note}</div>}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {v.files.map((f) => (
                <button key={f.file} type="button" onClick={() => viewFile(v, f)} style={{ minHeight: 0 }}
                  className="max-w-[14rem] truncate rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-primary hover:bg-gray-100">
                  {f.mime === "application/pdf" ? "📄" : "🖼"} {f.name}
                </button>
              ))}
            </div>
          </>
        )}
        {v.status === "skipped" && <div className="text-sm text-gray-600">ข้าม (นับว่าใช้สิทธิ์แล้ว) — {v.skip_reason}</div>}
      </div>
      {live && (
        <div className="flex flex-wrap items-start justify-end gap-1.5 ml-auto">
          {v.status === "planned" && <button type="button" onClick={() => openModal("schedule", v)} className={`${btn} bg-active text-white hover:bg-active-dark`}>นัด</button>}
          {v.status === "scheduled" && (
            <>
              <button type="button" onClick={() => openModal("schedule", v)} className={`${btn} border border-gray-200 text-gray-600 hover:bg-gray-50`}>เลื่อนนัด</button>
              <button type="button" onClick={() => openModal("unschedule", v)} className={`${btn} border border-gray-200 text-gray-600 hover:bg-gray-50`}>ยกเลิกนัด</button>
              <button type="button" onClick={() => openModal("close", v)} className={`${btn} bg-emerald-500 text-white hover:bg-emerald-600`}>ปิดงาน</button>
            </>
          )}
          {(v.status === "planned" || v.status === "scheduled") && (
            <button type="button" onClick={() => openModal("skip", v)} style={{ minHeight: 0 }} className="h-8 px-1 text-xs font-semibold text-gray-500 hover:underline">ข้ามครั้งนี้</button>
          )}
          {(v.status === "done" || v.status === "skipped") && (
            <button type="button" onClick={() => openModal("reopen", v)} style={{ minHeight: 0 }} className="h-8 px-1 text-xs font-semibold text-red-600 hover:underline">เปิดกลับ</button>
          )}
        </div>
      )}
    </li>
  );

  return (
    <div>
      <Header title={c.project_name} subtitle={`สัญญา O&M · ${c.project_code} · ${c.customer_name}`} backHref="/b2b/om/contracts" />
      <div className="p-3 md:p-6 grid gap-4 lg:grid-cols-[1fr_20rem] items-start">
        <div className="space-y-4 min-w-0">
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <h2 className="text-sm font-bold text-gray-900">สัญญา</h2>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${CONTRACT_STATUS_TONE[c.status]}`}>{CONTRACT_STATUS_LABEL[c.status]}</span>
              <div className="ml-auto flex gap-2">
                <Link href={`/b2b/projects/${c.project_id}`} className="h-8 px-3 inline-flex items-center rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">หน้าโครงการ</Link>
                {live && <button type="button" onClick={() => { setContact({ name: c.contact_name ?? "", phone: c.contact_phone ?? "", note: c.note ?? "" }); openModal("contact"); }}
                  className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">แก้ผู้ประสานงาน</button>}
              </div>
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
              <div><dt className={dt}>อายุสัญญา</dt><dd className="text-gray-800">{formatThaiDate(c.start_date)} – {formatThaiDate(c.end_date)} · {c.years} ปี</dd></div>
              <div><dt className={dt}>ครั้งเข้างาน</dt><dd className="text-gray-800">ปีละ {c.visits_per_year} ครั้ง · ใช้ไป <b>{c.used}</b> / {c.visits_total}</dd></div>
              <div><dt className={dt}>ผู้ประสานงานฝั่งลูกค้า</dt><dd className="text-gray-800">{c.contact_name ?? "—"}{c.contact_phone ? ` · ${c.contact_phone}` : ""}</dd></div>
              <div><dt className={dt}>ที่ตั้ง</dt><dd className="text-gray-800">{c.location ?? "—"}{mapLink && <> · <a href={mapLink} target="_blank" rel="noreferrer" className="text-primary hover:underline">แผนที่</a></>}</dd></div>
              <div className="md:col-span-2"><dt className={dt}>งานแต่ละครั้ง</dt><dd className="text-gray-800">ล้างแผง + ตรวจระบบ</dd></div>
              {c.note && <div className="md:col-span-2"><dt className={dt}>หมายเหตุ</dt><dd className="text-gray-800 whitespace-pre-line">{c.note}</dd></div>}
            </dl>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2">
              <h2 className="text-sm font-bold text-gray-900">ตารางเข้างาน</h2>
              <span className="ml-auto text-xs text-gray-500 max-md:hidden">สร้างล่วงหน้าทั้งสัญญา · เลื่อนวันได้ทีละครั้ง</span>
            </div>
            <ul className="divide-y divide-gray-100">{c.visits.map(visitRow)}</ul>
          </section>
        </div>

        <aside className="rounded-xl border border-gray-200 bg-white overflow-hidden lg:sticky lg:top-4">
          <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Activity Log</div>
          <ul className="max-h-[70vh] overflow-y-auto">
            {c.activities.map((a) => (
              <li key={a.id} className="px-4 py-2.5 border-b border-gray-100 text-sm">
                <div className="text-xs text-gray-400">{formatThaiDate(a.created_at, { time: true })}{a.created_by_name ? ` · ${a.created_by_name}` : ""}</div>
                <div className="font-semibold text-gray-800">{KIND[a.kind] ?? a.kind}</div>
                {a.message && <div className="text-gray-600 break-words">{a.message}</div>}
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {modal === "schedule" && visit && (
        <ScheduleVisitModal title={`${visit.status === "scheduled" ? "เลื่อนนัด" : "นัด"}ครั้งที่ ${visit.seq_no}/${c.visits_total} · กำหนด ${thaiMonth(visit.due_date)}`}
          initial={visit} minDate={c.start_date} maxDate={c.end_date} users={users} reschedule={visit.status === "scheduled"}
          saving={saving} error={error} onClose={() => setModal(null)}
          onConfirm={(v) => void act({ action: "schedule", ...v }, visit.status === "scheduled" ? "เลื่อนนัดแล้ว" : "บันทึกนัดแล้ว")} />
      )}
      {modal === "close" && visit && (
        <CloseVisitModal title={`ปิดครั้งที่ ${visit.seq_no}/${c.visits_total}`} initialDate={visit.scheduled_date}
          saving={saving} error={error} onClose={() => setModal(null)} onConfirm={(v) => void closeVisit(v)} />
      )}
      {modal === "unschedule" && visit && (
        <ReasonModal title={`ยกเลิกนัดครั้งที่ ${visit.seq_no}`} subtitle="กลับเป็นรอนัด — นัดวันใหม่ได้ภายหลัง" label="เหตุผล" placeholder="เช่น ลูกค้ายังไม่สะดวก รอแจ้งวันใหม่"
          confirmText="ยกเลิกนัด" saving={saving} error={error} onClose={() => setModal(null)} onConfirm={(reason) => void act({ action: "unschedule", reason }, "ยกเลิกนัดแล้ว")} />
      )}
      {modal === "skip" && visit && (
        <ReasonModal title={`ข้ามครั้งที่ ${visit.seq_no}`} subtitle="ลูกค้าขอข้าม = นับว่าใช้สิทธิ์ครั้งนี้แล้ว" label="เหตุผล" danger
          placeholder="เช่น ลูกค้าขอข้ามรอบนี้ — โรงงานหยุดซ่อมบำรุงใหญ่" confirmText="ข้ามครั้งนี้" saving={saving} error={error}
          onClose={() => setModal(null)} onConfirm={(reason) => void act({ action: "skip", reason }, `ข้ามครั้งที่ ${visit.seq_no} แล้ว`)} />
      )}
      {modal === "reopen" && visit && (
        <ReasonModal title={`เปิดครั้งที่ ${visit.seq_no} กลับมา`} subtitle={visit.files.length ? `ไฟล์รายงานเดิม ${visit.files.length} ไฟล์จะถูกลบ` : "ใช้เมื่อปิด/ข้ามผิด"}
          label="เหตุผล" danger placeholder="เช่น ปิดผิดครั้ง" confirmText="เปิดกลับ" saving={saving} error={error}
          onClose={() => setModal(null)} onConfirm={(reason) => void act({ action: "reopen", reason }, `เปิดครั้งที่ ${visit.seq_no} กลับมาแล้ว`)} />
      )}
      {modal === "contact" && (
        <ModalShell title="ผู้ประสานงาน / หมายเหตุสัญญา" confirmText="บันทึก" saving={saving} error={error} onClose={() => setModal(null)} onConfirm={() => void saveContact()}>
          <div className="grid gap-3 md:grid-cols-2">
            <div><label className={labelCls}>ผู้ประสานงานฝั่งลูกค้า</label>
              <input className={fieldCls} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder="เช่น คุณสมชาย ฝ่ายซ่อมบำรุง" /></div>
            <div><label className={labelCls}>เบอร์โทร</label>
              <input className={fieldCls} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></div>
          </div>
          <div><label className={labelCls}>หมายเหตุสัญญา</label>
            <textarea rows={3} className={areaCls} value={contact.note} onChange={(e) => setContact({ ...contact, note: e.target.value })} placeholder="เช่น เข้าได้เฉพาะเสาร์ · ต้องอบรมความปลอดภัยก่อนเข้าไซต์" /></div>
        </ModalShell>
      )}
    </div>
  );
}
