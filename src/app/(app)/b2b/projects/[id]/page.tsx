"use client";

import { use, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import { useDialog } from "@/components/ui/Dialog";
import { useActiveModuleKey } from "@/lib/hooks/useActiveModule";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { apiFetch, getUserContextHeaders } from "@/lib/api";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatThaiDate, formatTHB } from "@/lib/utils/formatters";
import {
  B2B_FLOW, B2B_LOSABLE_MAX_STAGE, B2B_PROJECT_ROLES, B2B_PROJECT_VIEW_ROLES, B2B_STAGE, isClosedStage, listHrefOf, stageLabel,
  type B2bInstallment, type B2bProject, type B2bProjectFile, type B2bUserOption,
} from "@/lib/b2b/project";
import StageBadge from "@/components/b2b/project/StageBadge";
import ProjectStepCard, { type StepState } from "@/components/b2b/project/ProjectStepCard";
import BoqOptionsTable from "@/components/b2b/project/BoqOptionsTable";
import ActivityList from "@/components/b2b/project/ActivityList";
import ProjectFormModal from "@/components/b2b/project/ProjectFormModal";
import { AttachFilesModal, ContractModal, CustomerEditModal, EvidenceModal, NewBoqModal, NewQuoteModal, ReasonModal, RecordSurveyModal, ScheduleSurveyModal, WonModal } from "@/components/b2b/project/ActionModals";
import ProjectFileList from "@/components/b2b/project/ProjectFileList";
import InstallmentTable from "@/components/b2b/project/InstallmentTable";
import { openAuthedFile } from "@/components/b2b/openAuthedFile";
import QuoteList from "@/components/b2b/project/QuoteList";
import MilestoneList from "@/components/b2b/project/MilestoneList";
import PermitChecklist from "@/components/b2b/project/PermitChecklist";
import { MilestoneModal, PermitModal } from "@/components/b2b/project/ExecutionModals";
import { CreateContractModal } from "@/components/b2b/om/VisitModals";
import { PERMITS, milestoneDef, type B2bMilestone, type B2bPermit, type MilestoneFile, type MilestoneKind } from "@/lib/b2b/execution";

// หน้าโครงการ B2B — โครงเดียวกับหน้ารายละเอียดลีด (header ติดบน · แท็บ · รางขั้นซ้าย · การ์ดขั้น · Activity Log ขวา)
// แผน docs/plan/20261015-07-b2b-project-flow.md · 01–05 ขาย/ได้งาน · 06–09 ดำเนินโครงการ (milestone + ขออนุญาต — เฟส 4)
// ขั้นเปลี่ยนผ่าน /actions ที่เดียว (server ตรวจกติกา) · ทุกครั้งได้โครงการทั้งก้อนกลับมาแทนค่าเดิม

type Tab = "workflow" | "info" | "boq" | "installments" | "timeline";
type Modal = null | "edit" | "customer" | "lost" | "cancel" | "reopen" | "back_survey" | "schedule" | "record" | "new_boq" | "new_quote"
  | "won" | "contract" | "evidence" | "reject_inst" | "milestone" | "milestone_edit" | "permit" | "om_contract" | "survey_files";

const LOCKED_HINT: Record<number, string> = {
  3500: "ปลดเมื่อกด \"ได้งาน\" — เลือกใบเสนอราคาที่ส่งลูกค้าแล้ว",
  3600: "ปลดเมื่อบัญชียืนยันเงินงวด 1",
  3700: "ปลดเมื่อบันทึก \"ของเข้าหน้างาน\"",
  3800: "ปลดเมื่อติดตั้งเสร็จ 100% แล้วบันทึกยื่นขนานไฟ",
  3900: "ปลดเมื่อได้วันจ่ายไฟ (COD) แล้วกด \"เข้าขั้นส่งมอบ\"",
};

export default function B2bProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { confirm, toast } = useDialog();
  const { activeRoles } = useActiveRoles();
  const moduleKey = useActiveModuleKey();
  const canUse = hasRole(activeRoles, ...B2B_PROJECT_VIEW_ROLES);
  // ผู้ตรวจสอบเปิดดูได้อย่างเดียว — ปุ่มเปลี่ยนขั้น/แก้ข้อมูลเห็นเฉพาะ Solar B2B + admin (API ตรวจซ้ำ)
  const canEdit = hasRole(activeRoles, ...B2B_PROJECT_ROLES);
  // บัญชียืนยัน/ตีกลับงวดเงินในหน้านี้ (เข้าจากหน้ารอยืนยันรับเงิน ?tab=installments) — แบบหน้าลีด/งานบริการ O&M
  const canConfirm = hasRole(activeRoles, "account", "admin");
  const searchParams = useSearchParams();
  const [p, setP] = useState<B2bProject | null>(null);
  const [loadError, setLoadError] = useState("");
  const [users, setUsers] = useState<B2bUserOption[]>([]);
  const [tab, setTab] = useState<Tab>(() => (searchParams.get("tab") === "installments" ? "installments" : "workflow"));
  const [inst, setInst] = useState<B2bInstallment | null>(null);
  const [instBusy, setInstBusy] = useState<number | null>(null);
  const [msKind, setMsKind] = useState<MilestoneKind | null>(null);
  const [msEdit, setMsEdit] = useState<B2bMilestone | null>(null);
  const [permit, setPermit] = useState<B2bPermit | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // ความสูง header ติดบน — วัดสด (ตัดบรรทัดตามความยาวชื่อ/จอ) ใช้กับรางขั้น · Activity Log · scroll-mt ของการ์ด
  const headerRef = useRef<HTMLDivElement>(null);
  const [hdrH, setHdrH] = useState(124);

  const load = useCallback(() => {
    apiFetch(`/api/b2b/projects/${id}`).then(setP).catch((e) => setLoadError(e instanceof Error ? e.message : "โหลดโครงการไม่สำเร็จ"));
  }, [id]);
  useEffect(() => {
    if (!canUse) return;
    load();
    apiFetch("/api/b2b/projects/options").then((r) => setUsers(r.users)).catch(() => {});
  }, [canUse, load]);

  const loaded = p != null;
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHdrH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  // เปิดหน้ามา → เลื่อนไปการ์ดขั้นปัจจุบัน (เผื่อความสูง header ติดบนด้วย scroll-mt ของการ์ด)
  const activeStage = p?.stage;
  useEffect(() => {
    if (activeStage == null) return;
    const t = setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    return () => clearTimeout(t);
  }, [activeStage]);

  if (activeRoles.length > 0 && !canUse) {
    return (
      <div>
        <Header title="โครงการ B2B" subtitle="COMMERCIAL (B2B)" />
        <main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">role ที่กำลังใช้งานไม่มีสิทธิ์เปิดหน้านี้</div></main>
      </div>
    );
  }
  if (loadError) return <div><Header title="โครงการ B2B" backHref="/b2b/projects" /><main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{loadError}</div></main></div>;
  if (!p) return <Loading />;

  const closed = isClosedStage(p.stage);
  // ขั้นที่ใช้วาดราง/การ์ด — แพ้/ยกเลิก ใช้ขั้นก่อนปิด: ขั้นนั้น = "หยุดที่ขั้นนี้" (ไม่ใช่ Done) · ไม่มีขั้นไหน active
  //   ปิดโครงการ (3950) = ทำครบทุกขั้น → ทุกการ์ด Done
  const stopped = closed && p.stage !== B2B_STAGE.closed;
  const at = stopped ? (p.stage_before_close ?? B2B_STAGE.lead) : p.stage;
  const stateOf = (step: number): StepState => (step < at ? "done" : step > at ? "locked" : stopped ? "stopped" : "active");

  const openModal = (m: Modal) => { setError(""); setModal(m); };
  const run = async (fn: () => Promise<void>) => {
    setError(""); setSaving(true);
    try { await fn(); setModal(null); }
    catch (e) { setError(e instanceof Error && e.message ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  const act = (body: Record<string, unknown>, done?: string) => run(async () => {
    const r = await apiFetch(`/api/b2b/projects/${p.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setP(r);
    if (done) toast({ message: done, variant: "success" });
  });
  const moveTo = async (to: number, text: string) => {
    const ok = await confirm({ title: `ไปขั้น "${stageLabel(to)}"`, message: text, confirmText: "ยืนยัน" });
    if (ok) await act({ action: "move", to_stage: to }, `โครงการอยู่ขั้น ${stageLabel(to)} แล้ว`);
  };
  const createBoq = (v: { option_label: string; margin_pct: string }) => run(async () => {
    const r = await apiFetch("/api/b2b/boqs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: p.id, ...v }) }) as { id: number };
    router.push(`/b2b/boq/${r.id}`);
  });
  const addNote = async (message: string) => {
    try {
      const r = await apiFetch(`/api/b2b/projects/${p.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "note", message }) });
      setP(r); return true;
    } catch (e) {
      toast({ message: e instanceof Error && e.message ? e.message : "บันทึกไม่สำเร็จ", variant: "danger" }); return false;
    }
  };

  const btn = "h-9 px-4 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 whitespace-nowrap";
  const btnPrimary = "h-9 px-4 rounded-lg bg-active text-white text-sm font-semibold hover:bg-active-dark whitespace-nowrap disabled:opacity-40";
  const btnGhost = "h-9 px-2 text-sm font-semibold text-active hover:underline whitespace-nowrap";
  const dl = "grid gap-x-6 gap-y-2 text-sm md:grid-cols-2";
  const dt = "text-xs text-gray-400";
  const canEditBoq = canEdit && !closed && p.stage <= B2B_STAGE.confirm;
  const mapLink = p.latitude != null && p.longitude != null ? `https://www.google.com/maps?q=${p.latitude},${p.longitude}` : null;

  const infoGrid = (
    <dl className={dl}>
      <div><dt className={dt}>บริษัทลูกค้า</dt><dd className="text-gray-800">{p.customer.name}{p.customer.branch ? ` (${p.customer.branch})` : ""}</dd></div>
      <div><dt className={dt}>ผู้ติดต่อ</dt><dd className="text-gray-800">{p.contact_name ?? "—"}{p.contact_phone ? ` · ${p.contact_phone}` : ""}{p.contact_email ? ` · ${p.contact_email}` : ""}</dd></div>
      <div><dt className={dt}>ที่ตั้ง</dt><dd className="text-gray-800">{p.location ?? "—"}{mapLink && <> · <a href={mapLink} target="_blank" rel="noreferrer" className="text-primary hover:underline">แผนที่</a></>}</dd></div>
      <div><dt className={dt}>ผู้ดูแล</dt><dd className="text-gray-800">{p.owner_name ?? "—"}</dd></div>
    </dl>
  );
  const phaseNote = (text: string) => (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white/60 px-3 py-2 text-xs text-gray-500">{text}</div>
  );

  // ใบประมาณการอยู่การ์ดขั้น 02 · ใบยืนยันอยู่การ์ดขั้น 04
  const estimateQuotes = p.quotes.filter((q) => q.kind === "estimate");
  const confirmQuotes = p.quotes.filter((q) => q.kind === "confirmed");
  // ── งวดเงิน (เฟส 3) ──
  const sentQuotes = p.quotes.filter((q) => q.status === "sent");
  const instAction = async (it: B2bInstallment, action: "due" | "confirm" | "reject", reason?: string) => {
    setError(""); setInstBusy(it.id);
    try {
      await apiFetch(`/api/b2b/installments/${it.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }) });
      load(); setModal(null);
      toast({ message: action === "confirm" ? `ยืนยันรับเงินงวด ${it.no} แล้ว` : action === "reject" ? "ตีกลับหลักฐานแล้ว" : `งวด ${it.no} ถึงกำหนดแล้ว`, variant: "success" });
    } catch (e) {
      const m = e instanceof Error && e.message ? e.message : "บันทึกไม่สำเร็จ";
      if (action === "reject") setError(m); else toast({ message: m, variant: "danger" });
    } finally { setInstBusy(null); }
  };
  const confirmPaid = async (it: B2bInstallment) => {
    const lastUnpaid = p.installments.every((x) => x.id === it.id || x.status === "paid");
    const closing = lastUnpaid && p.stage === B2B_STAGE.handover && p.milestones.some((m) => m.kind === "handover");
    const ok = await confirm({ title: `ยืนยันรับเงินงวด ${it.no}`, message: `${formatTHB(it.total, { decimals: 2 })} บาท (รวม VAT) — ตรวจหลักฐานแล้ว${it.no === 1 && p.stage === B2B_STAGE.won ? " · โครงการจะขยับเข้าขั้นขออนุญาต + จัดซื้อ" : ""}${closing ? " · งวดสุดท้าย — โครงการจะปิดเอง" : ""}`, confirmText: "ยืนยันรับเงิน" });
    if (ok) await instAction(it, "confirm");
  };
  const markDue = async (it: B2bInstallment) => {
    const ok = await confirm({ title: `งวด ${it.no} ถึงกำหนดวางบิล`, message: "ปกติงวดถึงกำหนดเองเมื่อบันทึกเหตุการณ์หน้างาน — ใช้ปุ่มนี้เมื่อเหตุการณ์ของงวดเกิดแล้วแต่ไม่ได้บันทึกในระบบ", confirmText: "ถึงกำหนด" });
    if (ok) await instAction(it, "due");
  };
  const uploadEvidence = (v: { file: File | null; received_date: string; note: string }) => run(async () => {
    if (!inst) return;
    if (!v.file) throw new Error("กรุณาเลือกไฟล์หลักฐาน");
    const fd = new FormData();
    fd.append("file", v.file); fd.append("received_date", v.received_date); fd.append("note", v.note);
    const res = await fetch(`/api/b2b/installments/${inst.id}/evidence`, { method: "POST", headers: { ...getUserContextHeaders() }, body: fd });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `HTTP ${res.status}`);
    load();
    toast({ message: `ส่งหลักฐานงวด ${inst.no} ให้บัญชีแล้ว`, variant: "success" });
  });
  const viewEvidence = (it: B2bInstallment) => { void openAuthedFile(`/api/b2b/installments/${it.id}/evidence`).catch((e) => toast({ message: e.message, variant: "danger" })); };
  const installmentTable = (
    <InstallmentTable items={p.installments} contractValue={p.contract_value} vatPct={p.contract_vat_pct}
      canEdit={canEdit && !closed} canConfirm={canConfirm && !closed} busyId={instBusy}
      onDue={(it) => void markDue(it)} onAttach={(it) => { setInst(it); openModal("evidence"); }}
      onConfirm={(it) => void confirmPaid(it)} onReject={(it) => { setInst(it); openModal("reject_inst"); }} onView={viewEvidence} />
  );
  // ── ดำเนินโครงการ (เฟส 4) ──
  const canExec = canEdit && !closed;
  const canPermit = canExec && p.stage >= B2B_STAGE.won;
  const msOf = (k: MilestoneKind) => p.milestones.find((m) => m.kind === k);
  const sendForm = async (url: string, fd: FormData, method = "POST") => {
    const res = await fetch(url, { method, headers: { ...getUserContextHeaders() }, body: fd });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `HTTP ${res.status}`);
  };
  const openRecord = (k: MilestoneKind) => { setMsKind(k); openModal("milestone"); };
  const recordMilestone = (v: { done_date: string; note: string; files: File[] }) => run(async () => {
    if (!msKind) return;
    const fd = new FormData();
    fd.append("kind", msKind); fd.append("done_date", v.done_date); fd.append("note", v.note);
    for (const f of v.files) fd.append("files", f);
    await sendForm(`/api/b2b/projects/${p.id}/milestones`, fd);
    load();
    toast({ message: `บันทึก "${milestoneDef(msKind)!.label}" แล้ว`, variant: "success" });
  });
  const editMilestone = (v: { done_date: string; note: string }) => run(async () => {
    if (!msEdit) return;
    await apiFetch(`/api/b2b/milestones/${msEdit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
    load();
    toast({ message: "แก้ไขแล้ว", variant: "success" });
  });
  const undoMilestone = async (m: B2bMilestone) => {
    const d = milestoneDef(m.kind)!;
    const ok = await confirm({
      title: `ยกเลิกการบันทึก "${d.label}"`, variant: "danger", confirmText: "ยกเลิกการบันทึก",
      message: [m.stage_after !== m.stage_before && `โครงการกลับไปขั้น ${stageLabel(m.stage_before)}`, d.trigger && "งวดที่ถึงกำหนดเพราะเหตุการณ์นี้กลับเป็นยังไม่ถึง",
        m.files.length > 0 && `ไฟล์ที่แนบ ${m.files.length} ไฟล์จะถูกลบ`].filter(Boolean).join(" · ") || "ใช้เมื่อบันทึกผิด",
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/b2b/milestones/${m.id}`, { method: "DELETE" });
      load();
      toast({ message: `ยกเลิก "${d.label}" แล้ว`, variant: "success" });
    } catch (e) { toast({ message: e instanceof Error && e.message ? e.message : "ยกเลิกไม่สำเร็จ", variant: "danger" }); }
  };
  const viewMilestoneFile = (m: B2bMilestone, f: MilestoneFile) => {
    void openAuthedFile(`/api/b2b/milestones/${m.id}/files/${encodeURIComponent(f.file)}`).catch((e) => toast({ message: e.message, variant: "danger" }));
  };
  const savePermit = (v: { status: string; submitted_date: string; approved_date: string; note: string; file: File | null }) => run(async () => {
    if (!permit) return;
    const fd = new FormData();
    fd.append("status", v.status); fd.append("submitted_date", v.submitted_date); fd.append("approved_date", v.approved_date); fd.append("note", v.note);
    if (v.file) fd.append("file", v.file);
    await sendForm(`/api/b2b/projects/${p.id}/permits/${permit.kind}`, fd, "PUT");
    load();
    toast({ message: "บันทึกเรื่องขออนุญาตแล้ว", variant: "success" });
  });
  const viewPermitFile = (x: B2bPermit) => {
    void openAuthedFile(`/api/b2b/projects/${p.id}/permits/${x.kind}`).catch((e) => toast({ message: e.message, variant: "danger" }));
  };
  const toHandover = async () => {
    const ok = await confirm({ title: "เข้าขั้นส่งมอบ", message: "ขนานไฟเรียบร้อยแล้ว — ต่อไปนัดส่งมอบงาน + Training ลูกค้า", confirmText: "เข้าขั้นส่งมอบ" });
    if (ok) await act({ action: "to_handover" }, "โครงการอยู่ขั้นส่งมอบแล้ว");
  };
  const milestoneList = (step: number) => (
    <MilestoneList step={step} milestones={p.milestones} stage={p.stage} canEdit={canExec} onRecord={openRecord}
      onEdit={(m) => { setMsEdit(m); openModal("milestone_edit"); }} onUndo={(m) => void undoMilestone(m)} onFile={viewMilestoneFile} />
  );
  const permitList = (only?: B2bPermit["kind"][]) => (
    <PermitChecklist permits={p.permits} only={only} canEdit={canPermit} onEdit={(x) => { setPermit(x); openModal("permit"); }} onFile={viewPermitFile} />
  );
  const doneOn = (k: MilestoneKind, label: string) => { const m = msOf(k); return m ? `${label} ${formatThaiDate(m.done_date)}` : undefined; };
  const permitsOk = p.permits.filter((x) => x.status === "approved" || x.status === "not_required").length;
  // สัญญา O&M (แผน 20261015-09) — สร้างเองตอนปิดโครงการ · กดสร้างเองได้หลังบันทึกส่งมอบ (ใบไม่มี O&M / งวดสุดท้ายยังค้าง)
  const canCreateOm = canEdit && p.om_contract_id == null && (p.stage === B2B_STAGE.closed || (p.stage === B2B_STAGE.handover && !!msOf("handover")));
  const createOm = (v: { years: number; visits_per_year: number; start_date: string }) => run(async () => {
    const r = await apiFetch("/api/b2b/om/contracts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: p.id, ...v }) }) as { id: number };
    router.push(`/b2b/om/contracts/${r.id}`);
  });
  const omBlock = (p.om_contract_id != null || canCreateOm) && (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50/60 px-3 py-2 text-sm">
      <span className="text-gray-700">⚡ O&amp;M B2B</span>
      {p.om_contract_id != null
        ? <Link href={`/b2b/om/contracts/${p.om_contract_id}`} className="ml-auto font-semibold text-primary hover:underline">ดูสัญญา O&amp;M + ตารางเข้างาน →</Link>
        : <button type="button" className={`ml-auto ${btn}`} onClick={() => openModal("om_contract")}>สร้างสัญญา O&amp;M</button>}
    </div>
  );

  // ── รูป/ไฟล์ผลสำรวจ (แผน 20261015-10) ──
  const surveyFiles = p.files.filter((f) => f.kind === "survey");
  const uploadFiles = async (kind: string, files: File[], note = "") => {
    const fd = new FormData();
    fd.append("kind", kind); fd.append("note", note);
    for (const f of files) fd.append("files", f);
    await sendForm(`/api/b2b/projects/${p.id}/files`, fd);
  };
  const attachSurvey = (v: { files: File[]; note: string }) => run(async () => {
    if (v.files.length === 0) throw new Error("กรุณาเลือกไฟล์");
    await uploadFiles("survey", v.files, v.note);
    load();
    toast({ message: `แนบไฟล์สำรวจ ${v.files.length} ไฟล์แล้ว`, variant: "success" });
  });
  // บันทึกผล (ขยับขั้น) ก่อน แล้วค่อยอัปโหลดไฟล์ — ไฟล์ไม่ผ่าน ผลสำรวจยังอยู่ แนบซ้ำที่การ์ดขั้น 03 ได้
  const recordSurvey = (v: { survey_date: string; note: string; files: File[] }) => run(async () => {
    const r = await apiFetch(`/api/b2b/projects/${p.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "record_survey", survey_date: v.survey_date, note: v.note }) });
    setP(r);
    if (v.files.length) {
      try { await uploadFiles("survey", v.files); load(); }
      catch (e) { toast({ message: `บันทึกผลสำรวจแล้ว แต่แนบไฟล์ไม่สำเร็จ — ${e instanceof Error ? e.message : ""} แนบใหม่ที่ขั้นสำรวจ`, variant: "danger" }); return; }
    }
    toast({ message: "บันทึกผลสำรวจแล้ว — ไปขั้นราคายืนยัน", variant: "success" });
  });
  const viewProjectFile = (f: B2bProjectFile) => {
    void openAuthedFile(`/api/b2b/projects/${p.id}/files/${f.id}`).catch((e) => toast({ message: e.message, variant: "danger" }));
  };
  const removeProjectFile = async (f: B2bProjectFile) => {
    const ok = await confirm({ title: "ลบไฟล์", message: `"${f.label}" จะถูกลบถาวร`, confirmText: "ลบไฟล์", variant: "danger" });
    if (!ok) return;
    try { await apiFetch(`/api/b2b/projects/${p.id}/files/${f.id}`, { method: "DELETE" }); load(); toast({ message: "ลบไฟล์แล้ว", variant: "success" }); }
    catch (e) { toast({ message: e instanceof Error && e.message ? e.message : "ลบไม่สำเร็จ", variant: "danger" }); }
  };

  const wonButton = (
    <button type="button" className={btnPrimary} disabled={sentQuotes.length === 0}
      title={sentQuotes.length ? undefined : "ต้องมีใบเสนอราคาที่อนุมัติครบ 3 ชั้นและส่งลูกค้าแล้ว"} onClick={() => openModal("won")}>ได้งาน</button>
  );

  const createQuote = (boqId: number) => run(async () => {
    if (!boqId) throw new Error("กรุณาเลือก BOQ");
    const r = await apiFetch("/api/b2b/quotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: p.id, boq_id: boqId }) }) as { id: number };
    router.push(`/b2b/quotations/${r.id}`);
  });

  // ── การ์ดขั้น ──
  const steps: Record<number, { summary?: ReactNode; body?: ReactNode }> = {
    3100: {
      summary: `${p.customer.name}${p.contact_name ? ` · ${p.contact_name}` : ""}${p.location ? ` · ${p.location}` : ""}`,
      body: (
        <>
          {infoGrid}
          {canEdit && stateOf(3100) === "active" && (
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" className={btn} onClick={() => openModal("schedule")}>ข้ามไปนัดสำรวจ</button>
              <button type="button" className={btnPrimary} onClick={() => void moveTo(B2B_STAGE.estimate, "เริ่มทำ BOQ ราคาประมาณการ (Google Maps) — เพิ่มได้หลายขนาด")}>เริ่มทำราคาประมาณการ</button>
            </div>
          )}
        </>
      ),
    },
    3200: {
      summary: p.boqs.length ? `BOQ ${p.boqs.length} ตัวเลือก${estimateQuotes.length ? ` · ใบประมาณการ ${estimateQuotes.length} ใบ` : ""}` : "ข้ามขั้นนี้",
      body: (
        <>
          <BoqOptionsTable boqs={p.boqs} canAdd={canEditBoq} onAdd={() => openModal("new_boq")} />
          <QuoteList quotes={estimateQuotes} canAdd={canEdit && stateOf(3200) === "active"} onAdd={() => openModal("new_quote")} />
          {canEdit && stateOf(3200) === "active" && (
            <>
              {phaseNote("ใบประมาณการต้องผ่านผู้ตรวจสอบ 3 ชั้นก่อนส่งลูกค้า · ลูกค้าสนใจแล้ว → นัดสำรวจเพื่อยืนยันราคา")}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={btnGhost} style={{ minHeight: 0 }} onClick={() => void moveTo(B2B_STAGE.confirm, "ข้ามการสำรวจ ไปขั้นราคายืนยัน — ใช้เมื่อมีข้อมูลหน้างานพอแล้ว (เช่น ลูกค้าส่งแบบหลังคา)")}>ข้ามสำรวจ</button>
                {sentQuotes.length > 0 && <button type="button" className={btn} onClick={() => openModal("won")}>ได้งานจากใบประมาณการ</button>}
                <button type="button" className={btnPrimary} onClick={() => openModal("schedule")}>ลูกค้าสนใจ · นัดสำรวจ</button>
              </div>
            </>
          )}
        </>
      ),
    },
    3300: {
      summary: p.survey_done_at
        ? `สำรวจ ${formatThaiDate(p.survey_date)}${p.surveyor_name ? ` โดย ${p.surveyor_name}` : ""}${surveyFiles.length ? ` · ไฟล์ ${surveyFiles.length}` : ""}${p.survey_note ? ` · ${p.survey_note}` : ""}`
        : "ข้ามขั้นนี้",
      body: (
        <>
          <dl className={dl}>
            <div><dt className={dt}>วันนัดสำรวจ</dt><dd className="text-gray-800">{p.survey_date ? formatThaiDate(p.survey_date, { weekday: true }) : "ยังไม่ได้นัด"}</dd></div>
            <div><dt className={dt}>ผู้สำรวจ</dt><dd className="text-gray-800">{p.surveyor_name ?? "—"}</dd></div>
          </dl>
          {p.survey_done_at && p.survey_note && (
            <div><div className={dt}>ผลสำรวจ</div><p className="text-sm text-gray-800 whitespace-pre-line">{p.survey_note}</p></div>
          )}
          <ProjectFileList title="รูป/ไฟล์ผลสำรวจ" files={surveyFiles} canEdit={canEdit && !closed}
            onAdd={() => openModal("survey_files")} onView={viewProjectFile} onRemove={(f) => void removeProjectFile(f)} />
          {canEdit && stateOf(3300) === "active" && (
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" className={btn} onClick={() => openModal("schedule")}>{p.survey_date ? "เลื่อนนัด" : "นัดสำรวจ"}</button>
              <button type="button" className={btnPrimary} disabled={!p.survey_date} title={p.survey_date ? undefined : "นัดวันสำรวจก่อน"} onClick={() => openModal("record")}>บันทึกผลสำรวจ</button>
            </div>
          )}
        </>
      ),
    },
    3400: {
      summary: `BOQ ${p.boqs.length} ตัวเลือก${confirmQuotes.length ? ` · ใบยืนยัน ${confirmQuotes.length} ใบ` : ""}`,
      body: (
        <>
          <BoqOptionsTable boqs={p.boqs} canAdd={canEditBoq} onAdd={() => openModal("new_boq")} />
          <QuoteList quotes={confirmQuotes} canAdd={canEdit && stateOf(3400) === "active"} onAdd={() => openModal("new_quote")} />
          {canEdit && stateOf(3400) === "active" && (
            <>
              {phaseNote("ทำ BOQ Rev ใหม่ตามผลสำรวจ แล้วออกใบเสนอราคายืนยัน · ลูกค้าต่อรอง = ออก Rev ใหม่ของใบ · ลูกค้าตอบรับใบที่ส่งแล้ว → ได้งาน")}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={btnGhost} style={{ minHeight: 0 }} onClick={() => openModal("back_survey")}>ถอยไปสำรวจซ้ำ</button>
                {wonButton}
              </div>
            </>
          )}
        </>
      ),
    },
    3500: {
      summary: p.contract_value != null
        ? `สัญญา${p.contract_no ? ` ${p.contract_no}` : ""} · ${formatTHB(p.contract_value, { decimals: 0 })} บาท (ก่อน VAT)${p.contract_date ? ` · ลงนาม ${formatThaiDate(p.contract_date)}` : ""}`
        : undefined,
      body: (
        <>
          <dl className={dl}>
            <div><dt className={dt}>ใบที่ได้งาน</dt><dd className="text-gray-800">{(() => { const q = p.quotes.find((x) => x.id === p.won_quote_id); return q ? <Link href={`/b2b/quotations/${q.id}`} className="text-primary hover:underline">{q.doc_no} Rev {q.revision}</Link> : "—"; })()}</dd></div>
            <div><dt className={dt}>มูลค่าสัญญา</dt><dd className="text-gray-800 tabular-nums">{p.contract_value != null ? `${formatTHB(p.contract_value, { decimals: 2 })} บาท (ก่อน VAT)` : "—"}</dd></div>
            <div><dt className={dt}>เลข PO / สัญญา</dt><dd className="text-gray-800">{p.contract_no ?? "—"}</dd></div>
            <div><dt className={dt}>วันลงนาม</dt><dd className={p.contract_date ? "text-gray-800" : "text-amber-700 font-semibold"}>{p.contract_date ? formatThaiDate(p.contract_date) : "ยังไม่ได้บันทึก"}</dd></div>
            {p.om_years != null && <div><dt className={dt}>O&amp;M ที่รวมในราคา</dt><dd className="text-gray-800">{p.om_years} ปี · ปีละ {p.om_visits_per_year ?? "—"} ครั้ง</dd></div>}
          </dl>
          {stateOf(3500) === "active" && installmentTable}
          {canEdit && !closed && (
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={btn} onClick={() => openModal("contract")}>{p.contract_date ? "แก้สัญญา / PO" : "บันทึกสัญญา / PO"}</button>
            </div>
          )}
        </>
      ),
    },
    // ตารางงวดเงินอยู่การ์ดขั้นปัจจุบันการ์ดเดียว (ดูทั้งหมดได้ที่แท็บงวดเงิน)
    3600: {
      summary: `${doneOn("procured", "สั่งของครบ") ?? "ยังไม่บันทึกสั่งของครบ"} · ขออนุญาตเรียบร้อย ${permitsOk}/${PERMITS.length}`,
      body: (
        <>
          {permitList()}
          {milestoneList(3600)}
          {stateOf(3600) === "active" && installmentTable}
          {canExec && stateOf(3600) === "active" && (
            <>
              {phaseNote("Purchase บันทึก \"สั่งของครบ\" ได้จากเมนูจัดซื้อ (เห็นงบต้นทุนจาก BOQ ที่ได้งาน) · ขออนุญาตทำคู่ขนานไปได้จนส่งมอบ · ของถึงหน้างานแล้ว → เข้าขั้นติดตั้ง")}
              <div className="flex justify-end">
                <button type="button" className={btnPrimary} onClick={() => openRecord("materials_arrived")}>ของเข้าหน้างาน</button>
              </div>
            </>
          )}
        </>
      ),
    },
    3700: {
      summary: doneOn("install_done", "ติดตั้งเสร็จ"),
      body: (
        <>
          {milestoneList(3700)}
          {stateOf(3700) === "active" && installmentTable}
          {canExec && stateOf(3700) === "active" && (
            <>
              {phaseNote("\"แผงส่งครบ 100%\" กับ \"ติดตั้งเสร็จ 100%\" ทำให้งวดที่ผูกไว้ถึงกำหนดวางบิลเอง · ติดตั้งเสร็จแล้ว → ยื่นขนานไฟ")}
              <div className="flex justify-end">
                <button type="button" className={btnPrimary} disabled={!msOf("install_done")} title={msOf("install_done") ? undefined : "บันทึกติดตั้งเสร็จ 100% ก่อน"}
                  onClick={() => openRecord("gridtie_submitted")}>ยื่นขนานไฟ</button>
              </div>
            </>
          )}
        </>
      ),
    },
    3800: {
      summary: doneOn("cod", "จ่ายไฟ (COD)"),
      body: (
        <>
          {permitList(["utility"])}
          {milestoneList(3800)}
          {stateOf(3800) === "active" && installmentTable}
          {canExec && stateOf(3800) === "active" && (
            <div className="flex justify-end">
              <button type="button" className={btnPrimary} disabled={!msOf("cod")} title={msOf("cod") ? undefined : "บันทึกวันจ่ายไฟ (COD) ก่อน"}
                onClick={() => void toHandover()}>เข้าขั้นส่งมอบ</button>
            </div>
          )}
        </>
      ),
    },
    3900: {
      summary: doneOn("handover", "ส่งมอบ"),
      body: (
        <>
          {milestoneList(3900)}
          <dl className={dl}>
            <div><dt className={dt}>รับประกันงานติดตั้ง</dt><dd className="text-gray-800">{msOf("handover") ? `เริ่มนับ ${formatThaiDate(msOf("handover")!.done_date)}` : "เริ่มนับจากวันส่งมอบ"}</dd></div>
            {p.om_years != null && <div><dt className={dt}>O&amp;M ที่รวมในราคา</dt><dd className="text-gray-800">{p.om_years} ปี · ปีละ {p.om_visits_per_year ?? "—"} ครั้ง</dd></div>}
          </dl>
          {omBlock}
          {stateOf(3900) === "active" && installmentTable}
          {canExec && stateOf(3900) === "active" && phaseNote("โครงการปิดเองเมื่อบันทึกส่งมอบแล้ว และบัญชียืนยันรับเงินครบทุกงวด — สัญญา O&M + ตารางเข้างานสร้างเองตอนปิด")}
        </>
      ),
    },
  };

  const tabBtn = (t: Tab, label: string, extra = "") => (
    <button key={t} type="button" onClick={() => setTab(t)}
      className={`py-3 px-3 md:px-4 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === t ? "text-active border-active" : "text-gray-500 border-transparent hover:text-gray-700"} ${extra}`}>
      {label}
    </button>
  );

  return (
    <div className="min-h-full flex flex-col bg-gray-50" style={{ "--hdr": `${hdrH}px` } as CSSProperties}>
      {/* header ติดบน — แบบหน้าลีด: คอลัมน์ไอคอนกว้างเท่ารางขั้น (เส้นแนวตั้งต่อกัน) | ชื่อ + ป้ายขั้น + ข้อมูลย่อ | ปุ่ม */}
      <div ref={headerRef} className="bg-white border-b border-gray-200 sticky top-0 z-40" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-stretch">
          <button type="button" onClick={() => router.push(listHrefOf(p.stage, moduleKey))} style={{ minHeight: 0 }}
            className="md:hidden self-center ml-1 p-1.5 rounded-full text-gray-600 hover:bg-gray-200 shrink-0" aria-label="กลับ">
            <ChevronLeftIcon className="w-5 h-5" strokeWidth={2.5} />
          </button>
          <div className="max-md:hidden w-20 shrink-0 border-r border-gray-200 flex items-center justify-center py-2">
            <span className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center text-2xl">🏭</span>
          </div>
          <div className="flex-1 min-w-0 px-3 md:px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={listHrefOf(p.stage, moduleKey)} className="max-md:hidden text-gray-400 hover:text-gray-600" aria-label="กลับ"><ChevronLeftIcon className="w-5 h-5" strokeWidth={2.5} /></Link>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">{p.name}</h1>
              <StageBadge stage={p.stage} sub={p.sub} surveyDate={p.survey_date} />
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
              <span>{p.code}</span>
              <span>{p.customer.name}</span>
              {p.owner_name && <span>ผู้ดูแล <b className="font-medium text-gray-700">{p.owner_name}</b></span>}
              {p.boq_capacity_wp ? <span>BOQ ล่าสุด <b className="font-medium text-gray-700">{formatTHB(p.boq_capacity_wp / 1000, { decimals: 2 })} kWp</b></span> : null}
              {p.boq_total_sale ? <span><b className="font-medium text-gray-700">{formatTHB(p.boq_total_sale, { decimals: 0 })}</b> บาท (ก่อน VAT)</span> : null}
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 md:px-4 shrink-0">
            {!canEdit ? null : closed ? (
              p.stage !== B2B_STAGE.closed && <button type="button" className={btnPrimary} onClick={() => openModal("reopen")}>เปิดกลับ</button>
            ) : (
              <>
                {p.stage <= B2B_LOSABLE_MAX_STAGE && <button type="button" className={`${btn} max-md:hidden`} onClick={() => openModal("lost")}>แพ้งาน</button>}
                <button type="button" className={`${btn} max-md:hidden`} onClick={() => openModal("cancel")}>ยกเลิก</button>
              </>
            )}
          </div>
        </div>
        <div className="flex overflow-x-auto border-t border-gray-100 md:pl-20">
          {tabBtn("workflow", "Workflow")}
          {tabBtn("info", "ข้อมูลโครงการ")}
          {tabBtn("boq", `BOQ (${p.boqs.length})`)}
          {p.installments.length > 0 && tabBtn("installments", "งวดเงิน")}
          {tabBtn("timeline", "Timeline", "lg:hidden")}
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* รางขั้นติดใต้ header ระหว่างเลื่อนการ์ด (self-start ให้ sticky ทำงานในแถว flex) */}
        {tab === "workflow" && (
          <aside className="hidden md:flex w-20 shrink-0 self-start sticky overflow-y-auto border-r border-gray-200 bg-gray-50/40 flex-col py-3 px-1.5 gap-1.5"
            style={{ top: hdrH, maxHeight: `calc(100vh - ${hdrH}px)` }}>
            {B2B_FLOW.map((s, i) => {
              const st = stateOf(s.step);
              const cur = st === "active" || st === "stopped";
              return (
                <button key={s.step} type="button" disabled={st === "locked"}
                  onClick={() => document.getElementById(`step-${i + 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className={`flex flex-col items-center gap-0.5 py-2 rounded-lg transition-colors ${
                    st === "stopped" ? "bg-gray-400 text-white"
                    : cur ? "bg-active text-white"
                    : st === "done" ? "bg-white text-gray-700 border border-gray-200 hover:border-active hover:text-active"
                    : "text-gray-300 cursor-not-allowed"}`}>
                  <span className="text-xxs font-bold tabular-nums leading-none">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-[10px] font-semibold leading-tight text-center px-1">{s.short}</span>
                  {st === "done" && <span className="text-emerald-500 text-xs leading-none">✓</span>}
                </button>
              );
            })}
          </aside>
        )}

        <main className="flex-1 min-w-0 p-3 md:p-4 space-y-3 pb-24 md:pb-6">
          {p.stage === B2B_STAGE.closed && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <b>ปิดโครงการแล้ว</b> — ส่งมอบงานและรับเงินครบทุกงวด{p.closed_at ? ` · ${formatThaiDate(p.closed_at)}` : ""}
              {p.om_contract_id != null && <> · <Link href={`/b2b/om/contracts/${p.om_contract_id}`} className="font-semibold underline">สัญญา O&amp;M →</Link></>}
            </div>
          )}
          {stopped && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${p.stage === B2B_STAGE.lost ? "border-red-200 bg-red-50 text-red-700" : "border-gray-200 bg-white text-gray-600"}`}>
              <b>{stageLabel(p.stage)}</b> ตอนอยู่ขั้น {stageLabel(at)}{p.closed_at ? ` · ${formatThaiDate(p.closed_at)}` : ""}
              {p.close_reason && <div className="mt-0.5">{p.close_reason}</div>}
            </div>
          )}

          {tab === "workflow" && B2B_FLOW.map((s, i) => {
            const st = stateOf(s.step);
            const c = steps[s.step];
            return (
              <ProjectStepCard key={s.step} no={i + 1} title={s.label} state={st} summary={c?.summary} lockedHint={LOCKED_HINT[s.step]}>
                {c?.body}
              </ProjectStepCard>
            );
          })}

          {tab === "info" && (
            <div className="space-y-3">
              <section className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-bold text-gray-900">บริษัทลูกค้า</h2>
                  {canEdit && !closed && <button type="button" className={`ml-auto ${btn}`} onClick={() => openModal("customer")}>แก้ข้อมูลบริษัท</button>}
                </div>
                <dl className={dl}>
                  <div><dt className={dt}>ชื่อบริษัท</dt><dd className="text-gray-800">{p.customer.name}</dd></div>
                  <div><dt className={dt}>เลขประจำตัวผู้เสียภาษี · สาขา</dt><dd className="text-gray-800">{p.customer.tax_id ?? "—"}{p.customer.branch ? ` · ${p.customer.branch}` : ""}</dd></div>
                  <div className="md:col-span-2"><dt className={dt}>ที่อยู่</dt><dd className="text-gray-800">{p.customer.address ?? "—"}</dd></div>
                </dl>
              </section>
              <section className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-bold text-gray-900">โครงการ</h2>
                  {canEdit && !closed && <button type="button" className={`ml-auto ${btn}`} onClick={() => openModal("edit")}>แก้ข้อมูลโครงการ</button>}
                </div>
                <dl className={dl}>
                  <div><dt className={dt}>เลขที่ · ชื่อ</dt><dd className="text-gray-800">{p.code} · {p.name}</dd></div>
                  <div><dt className={dt}>ผู้ติดต่อ</dt><dd className="text-gray-800">{p.contact_name ?? "—"}{p.contact_phone ? ` · ${p.contact_phone}` : ""}{p.contact_email ? ` · ${p.contact_email}` : ""}</dd></div>
                  <div><dt className={dt}>ที่ตั้ง</dt><dd className="text-gray-800">{p.location ?? "—"}</dd></div>
                  <div><dt className={dt}>พิกัด</dt><dd className="text-gray-800">{mapLink ? <a href={mapLink} target="_blank" rel="noreferrer" className="text-primary hover:underline">{p.latitude}, {p.longitude}</a> : "—"}</dd></div>
                  <div><dt className={dt}>ผู้ดูแล</dt><dd className="text-gray-800">{p.owner_name ?? "—"}</dd></div>
                  <div><dt className={dt}>สร้าง</dt><dd className="text-gray-800">{formatThaiDate(p.created_at, { time: true })}{p.created_by_name ? ` · ${p.created_by_name}` : ""}</dd></div>
                  {p.note && <div className="md:col-span-2"><dt className={dt}>หมายเหตุ</dt><dd className="text-gray-800 whitespace-pre-line">{p.note}</dd></div>}
                </dl>
              </section>
              {canEdit && <div className="flex gap-2 md:hidden">
                {!closed && p.stage <= B2B_LOSABLE_MAX_STAGE && <button type="button" className={btn} onClick={() => openModal("lost")}>แพ้งาน</button>}
                {!closed && <button type="button" className={btn} onClick={() => openModal("cancel")}>ยกเลิกโครงการ</button>}
              </div>}
            </div>
          )}

          {tab === "boq" && <BoqOptionsTable boqs={p.boqs} canAdd={canEditBoq} onAdd={() => openModal("new_boq")} />}
          {tab === "installments" && installmentTable}

          {tab === "timeline" && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden lg:hidden">
              <ActivityList activities={p.activities} onNote={canEdit ? addNote : undefined} />
            </div>
          )}
        </main>

        {/* Activity Log ขวา (จอใหญ่) — จอเล็กดูที่แท็บ Timeline */}
        <aside className="hidden lg:block w-80 shrink-0 border-l border-gray-200 bg-white">
          <div className="sticky overflow-y-auto" style={{ top: hdrH, maxHeight: `calc(100vh - ${hdrH}px)` }}>
            <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Activity Log</div>
            <ActivityList activities={p.activities} onNote={canEdit ? addNote : undefined} />
          </div>
        </aside>
      </div>

      {modal === "edit" && <ProjectFormModal initial={p} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); toast({ message: "บันทึกข้อมูลโครงการแล้ว", variant: "success" }); }} />}
      {modal === "customer" && (
        <CustomerEditModal initial={p.customer} saving={saving} error={error} onClose={() => setModal(null)}
          onConfirm={(v) => void run(async () => {
            await apiFetch(`/api/b2b/customers/${p.customer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
            load();
          })} />
      )}
      {modal === "won" && (
        <WonModal quotes={sentQuotes} saving={saving} error={error} onClose={() => setModal(null)}
          onConfirm={(v) => void act({ action: "won", ...v }, "บันทึกได้งานแล้ว — งวด 1 ถึงกำหนดวางบิล")} />
      )}
      {modal === "contract" && (
        <ContractModal initialNo={p.contract_no} initialDate={p.contract_date} saving={saving} error={error} onClose={() => setModal(null)}
          onConfirm={(v) => void act({ action: "contract", ...v }, "บันทึกสัญญาแล้ว")} />
      )}
      {modal === "evidence" && inst && (
        <EvidenceModal title={`แนบหลักฐานรับเงินงวด ${inst.no} · ${formatTHB(inst.total, { decimals: 2 })} บาท`} saving={saving} error={error}
          onClose={() => setModal(null)} onConfirm={(v) => void uploadEvidence(v)} />
      )}
      {modal === "reject_inst" && inst && (
        <ReasonModal title={`ตีกลับหลักฐานงวด ${inst.no}`} subtitle="งวดกลับเป็น &quot;ถึงกำหนด&quot; ให้ Solar B2B แนบใหม่" label="เหตุผล" danger
          placeholder="เช่น ยอดในสลิปไม่ตรง · ยังไม่เห็นเงินเข้าบัญชี" confirmText="ตีกลับ" saving={instBusy === inst.id} error={error}
          onClose={() => setModal(null)} onConfirm={(reason) => void instAction(inst, "reject", reason)} />
      )}
      {modal === "new_quote" && (
        <NewQuoteModal boqs={p.boqs} kindLabel={p.stage === B2B_STAGE.estimate ? "ประมาณการ" : "ยืนยัน"} saving={saving} error={error}
          onClose={() => setModal(null)} onConfirm={(id) => void createQuote(id)} />
      )}
      {modal === "new_boq" && <NewBoqModal saving={saving} error={error} onClose={() => setModal(null)} onConfirm={(v) => void createBoq(v)} />}
      {modal === "schedule" && (
        <ScheduleSurveyModal initialDate={p.survey_done_at ? null : p.survey_date} initialSurveyor={p.surveyor_id} users={users}
          saving={saving} error={error} onClose={() => setModal(null)}
          onConfirm={(v) => void act({ action: "schedule_survey", ...v }, "บันทึกนัดสำรวจแล้ว")} />
      )}
      {modal === "record" && (
        <RecordSurveyModal initialDate={p.survey_date} saving={saving} error={error} onClose={() => setModal(null)}
          onConfirm={(v) => void recordSurvey(v)} />
      )}
      {modal === "back_survey" && (
        <ReasonModal title="ถอยไปสำรวจซ้ำ" subtitle="โครงการกลับไปขั้นสำรวจ แล้วนัดวันใหม่" label="เหตุผล" placeholder="เช่น ลูกค้าเพิ่มอาคาร B · ต้องวัดหลังคาใหม่"
          confirmText="ถอยขั้น" saving={saving} error={error} onClose={() => setModal(null)}
          onConfirm={(reason) => void act({ action: "move", to_stage: B2B_STAGE.survey, reason }, "กลับมาขั้นสำรวจแล้ว — นัดวันใหม่ได้เลย")} />
      )}
      {(modal === "lost" || modal === "cancel") && (
        <ReasonModal title={modal === "lost" ? "แพ้งาน" : "ยกเลิกโครงการ"} danger
          subtitle={modal === "lost" ? "ย้ายไปเมนูแพ้งาน/ยกเลิก — เปิดกลับได้ภายหลัง" : "หยุดโครงการ — เปิดกลับได้ภายหลัง"}
          label="เหตุผล" placeholder={modal === "lost" ? "เช่น ราคาสูงกว่าคู่แข่ง · ลูกค้าเลื่อนงบปีหน้า" : "เช่น ลูกค้ายกเลิกแผนลงทุน"}
          confirmText={modal === "lost" ? "บันทึกแพ้งาน" : "ยกเลิกโครงการ"} saving={saving} error={error} onClose={() => setModal(null)}
          onConfirm={(reason) => void act({ action: modal, reason }, modal === "lost" ? "บันทึกแพ้งานแล้ว" : "ยกเลิกโครงการแล้ว")} />
      )}
      {modal === "milestone" && msKind && (
        <MilestoneModal title={`บันทึก "${milestoneDef(msKind)!.label}"`} subtitle={milestoneDef(msKind)!.hint} saving={saving} error={error}
          onClose={() => setModal(null)} onConfirm={(v) => void recordMilestone(v)} />
      )}
      {modal === "milestone_edit" && msEdit && (
        <MilestoneModal edit title={`แก้ "${milestoneDef(msEdit.kind)!.label}"`} subtitle="แก้วันที่/หมายเหตุ — ไม่เปลี่ยนขั้นหรืองวดเงิน" initial={msEdit}
          saving={saving} error={error} onClose={() => setModal(null)} onConfirm={(v) => void editMilestone({ done_date: v.done_date, note: v.note })} />
      )}
      {modal === "permit" && permit && (
        <PermitModal title={PERMITS.find((x) => x.kind === permit.kind)!.label} initial={permit} hasFile={permit.has_file}
          saving={saving} error={error} onClose={() => setModal(null)} onConfirm={(v) => void savePermit(v)} />
      )}
      {modal === "om_contract" && (
        <CreateContractModal initial={{ years: p.om_years, visits_per_year: p.om_visits_per_year, start_date: msOf("handover")?.done_date ?? null }}
          saving={saving} error={error} onClose={() => setModal(null)} onConfirm={(v) => void createOm(v)} />
      )}
      {modal === "survey_files" && (
        <AttachFilesModal title="แนบรูป/ไฟล์ผลสำรวจ" saving={saving} error={error} onClose={() => setModal(null)} onConfirm={(v) => void attachSurvey(v)} />
      )}
      {modal === "reopen" && (
        <ReasonModal title="เปิดโครงการกลับ" subtitle={`กลับไปขั้น ${stageLabel(at)}`} label="เหตุผล" required={false} placeholder="เช่น ลูกค้ากลับมาขอราคาใหม่"
          confirmText="เปิดกลับ" saving={saving} error={error} onClose={() => setModal(null)}
          onConfirm={(reason) => void act({ action: "reopen", reason }, "เปิดโครงการกลับแล้ว")} />
      )}
    </div>
  );
}
