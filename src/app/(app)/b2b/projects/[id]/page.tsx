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
  B2B_FLOW, B2B_LOSABLE_MAX_STAGE, B2B_PROJECT_ROLES, B2B_PROJECT_VIEW_ROLES, B2B_STAGE, B2B_SURVEY_SUB, INSTALLMENT_STATUS_LABEL,
  isClosedStage, listHrefOf, stageLabel,
  type B2bInstallment, type B2bProject, type B2bProjectFile, type B2bProjectQuote, type B2bUserOption,
} from "@/lib/b2b/project";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_TONE, editableStatus, tierOfStatus } from "@/lib/b2b/quotation";
import { reviewedTiers, stageEnteredAt, stepPassedAt, stepSkipped } from "@/lib/b2b/project-view";
import StageBadge from "@/components/b2b/project/StageBadge";
import ProjectStepper, { StepProgressMobile, type StepState, type StepView } from "@/components/b2b/project/ProjectStepper";
import NextStepCard, { TierBar, type NextItem } from "@/components/b2b/project/NextStepCard";
import StepHistoryCard from "@/components/b2b/project/StepHistoryCard";
import ExecutionBoard from "@/components/b2b/project/ExecutionBoard";
import MoreMenu, { type MoreItem } from "@/components/b2b/project/MoreMenu";
import BoqOptionsTable from "@/components/b2b/project/BoqOptionsTable";
import ActivityList from "@/components/b2b/project/ActivityList";
import ProjectFormModal from "@/components/b2b/project/ProjectFormModal";
import { AttachFilesModal, ContractModal, CustomerEditModal, EvidenceModal, NewBoqModal, NewQuoteModal, ReasonModal, RecordSurveyModal, ScheduleSurveyModal, WonModal } from "@/components/b2b/project/ActionModals";
import ProjectFileList from "@/components/b2b/project/ProjectFileList";
import InstallmentTable from "@/components/b2b/project/InstallmentTable";
import { openAuthedFile } from "@/components/b2b/openAuthedFile";
import QuoteList from "@/components/b2b/project/QuoteList";
import { MilestoneModal, PermitModal } from "@/components/b2b/project/ExecutionModals";
import { CreateContractModal } from "@/components/b2b/om/VisitModals";
import {
  MILESTONES, PERMITS, PERMIT_STATUS_LABEL, milestoneDef,
  type B2bMilestone, type B2bPermit, type MilestoneFile, type MilestoneKind,
} from "@/lib/b2b/execution";

// หน้าโครงการ B2B — แผน docs/plan/20261016-01-b2b-project-page-redesign.md (แบบ A + C · เฉพาะ B2B ไม่แตะหน้าลีด B2C)
//   header ติดบน: ชื่อ + ตัวเลขหลัก + เมนู ⋯ · แถบขั้นแนวนอน (ขาย 01–05 / ดำเนินโครงการ 06–09) · แท็บ
//   เนื้อหา: การ์ด "ขั้นต่อไป" (เช็กลิสต์ว่ายังขาดอะไร) + ของที่ใช้ทำงานขั้นนั้น · กดขั้นที่เสร็จบนแถบ = ดูย้อนหลัง
//   ช่วง 06–09 ใช้ตารางงานคู่ขนาน (หน้างาน / ขออนุญาต / งวดเงิน) · มือถือ: แถบความคืบหน้า + ปุ่มหลักแถบท้ายจอ
// โครงเดิม (รางขั้นซ้าย + การ์ดขั้นเรียงลงมา) อยู่ใน git ก่อน commit นี้ · ขั้นเปลี่ยนผ่าน /actions ที่เดียว (server ตรวจกติกา)

type Tab = "workflow" | "info" | "boq" | "installments" | "timeline";
type Modal = null | "edit" | "customer" | "lost" | "cancel" | "reopen" | "back_survey" | "schedule" | "record" | "new_boq" | "new_quote"
  | "won" | "contract" | "evidence" | "reject_inst" | "milestone" | "milestone_edit" | "permit" | "om_contract" | "survey_files";

/** ชี้ขั้นที่ยังล็อกบนแถบขั้น → บอกว่าปลดเมื่อไร */
const LOCKED_HINT: Record<number, string> = {
  3200: "เริ่มเมื่อกด \"เริ่มทำราคาประมาณการ\"",
  3300: "เริ่มเมื่อนัดวันสำรวจ",
  3400: "เริ่มเมื่อบันทึกผลสำรวจ",
  3500: "ปลดเมื่อกด \"ได้งาน\" — เลือกใบเสนอราคาที่ส่งลูกค้าแล้ว",
  3600: "ปลดเมื่อบัญชียืนยันเงินงวด 1",
  3700: "ปลดเมื่อบันทึก \"ของเข้าหน้างาน\"",
  3800: "ปลดเมื่อติดตั้งเสร็จ 100% แล้วบันทึกยื่นขนานไฟ",
  3900: "ปลดเมื่อได้วันจ่ายไฟ (COD) แล้วกด \"เข้าขั้นส่งมอบ\"",
};

const btn = "inline-flex items-center justify-center h-9 px-4 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed";
const btnPrimary = "inline-flex items-center justify-center h-9 px-4 rounded-lg bg-active text-white text-sm font-semibold hover:bg-active-dark whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed";
const btnSm = "inline-flex items-center h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap disabled:opacity-40";
const dl = "grid gap-x-6 gap-y-2 text-sm md:grid-cols-2";
const dt = "text-xs text-gray-400";

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} style={{ minHeight: 0 }} className="text-xs font-bold text-active hover:underline whitespace-nowrap">{children}</Link>;
}

/** ส่วนของขั้นปัจจุบัน — การ์ดขั้นต่อไป (title…inner) + เนื้อหาใต้การ์ด (body) */
type Current = {
  title: ReactNode; sub?: ReactNode; items?: NextItem[]; note?: ReactNode; actions?: ReactNode;
  /** ปุ่มหลัก — จอใหญ่อยู่ท้ายการ์ด · มือถืออยู่แถบท้ายจอ */
  primary?: ReactNode;
  inner?: ReactNode; body?: ReactNode;
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
  // ขั้นที่กำลังดูย้อนหลัง — ผูกกับขั้นของโครงการตอนกด ⇒ โครงการขยับขั้นแล้วกลับมาที่ขั้นปัจจุบันเอง
  const [sel, setSel] = useState<{ stage: number; step: number } | null>(null);
  const [inst, setInst] = useState<B2bInstallment | null>(null);
  const [instBusy, setInstBusy] = useState<number | null>(null);
  const [msKind, setMsKind] = useState<MilestoneKind | null>(null);
  const [msEdit, setMsEdit] = useState<B2bMilestone | null>(null);
  const [permit, setPermit] = useState<B2bPermit | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // ความสูง header ติดบน — วัดสด (ตัดบรรทัดตามความยาวชื่อ/จอ) ใช้กับ Activity Log · scroll-mt ของเนื้อหา
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
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
  // ขั้นที่ใช้วาดแถบขั้น — แพ้/ยกเลิก ใช้ขั้นก่อนปิด: ขั้นนั้น = "หยุดที่ขั้นนี้" (ไม่ใช่ Done) · ไม่มีขั้นไหน active
  //   ปิดโครงการ (3950) = ทำครบทุกขั้น → ทุกขั้น Done
  const stopped = closed && p.stage !== B2B_STAGE.closed;
  const at = stopped ? (p.stage_before_close ?? B2B_STAGE.lead) : p.stage;
  const stateOf = (step: number): StepState => (step < at ? "done" : step > at ? "locked" : stopped ? "stopped" : "active");
  const noOf = (step: number) => B2B_FLOW.findIndex((s) => s.step === step) + 1;
  // ช่วง 06–09 ดูจากตารางงานคู่ขนานในหน้าขั้นปัจจุบัน (ไม่มีหน้าย้อนหลังแยก)
  const boardInCurrent = at >= B2B_STAGE.permit;
  const view = sel && sel.stage === p.stage ? sel.step : null;

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

  // กดขั้นบนแถบ: ขั้นที่เสร็จ = ดูย้อนหลัง · ขั้นปัจจุบัน = กลับ · ขั้น 06–09 = เลื่อนไปตารางงานคู่ขนาน
  const selectStep = (step: number) => {
    setTab("workflow");
    if (step >= B2B_STAGE.permit && boardInCurrent) {
      setSel(null);
      requestAnimationFrame(() => document.getElementById("exec-board")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    setSel(stateOf(step) === "done" ? { stage: p.stage, step } : null);
    requestAnimationFrame(() => contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const canEditBoq = canEdit && !closed && p.stage <= B2B_STAGE.confirm;
  const mapLink = p.latitude != null && p.longitude != null ? `https://www.google.com/maps?q=${p.latitude},${p.longitude}` : null;
  const latestBoq = [...p.boqs].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] ?? null;

  const infoGrid = (
    <dl className={dl}>
      <div><dt className={dt}>บริษัทลูกค้า</dt><dd className="text-gray-800">{p.customer.name}{p.customer.branch ? ` (${p.customer.branch})` : ""}</dd></div>
      <div><dt className={dt}>ผู้ติดต่อ</dt><dd className="text-gray-800">{p.contact_name ?? "—"}{p.contact_phone ? ` · ${p.contact_phone}` : ""}{p.contact_email ? ` · ${p.contact_email}` : ""}</dd></div>
      <div><dt className={dt}>ที่ตั้ง</dt><dd className="text-gray-800">{p.location ?? "—"}{mapLink && <> · <a href={mapLink} target="_blank" rel="noreferrer" className="text-primary hover:underline">แผนที่</a></>}</dd></div>
      <div><dt className={dt}>ผู้ดูแล</dt><dd className="text-gray-800">{p.owner_name ?? "—"}</dd></div>
    </dl>
  );

  // ใบประมาณการ = ขั้น 02 · ใบยืนยัน = ขั้น 04
  const estimateQuotes = p.quotes.filter((q) => q.kind === "estimate");
  const confirmQuotes = p.quotes.filter((q) => q.kind === "confirmed");
  // ── งวดเงิน ──
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
  const attachEvidence = (it: B2bInstallment) => { setInst(it); openModal("evidence"); };
  const rejectEvidence = (it: B2bInstallment) => { setInst(it); openModal("reject_inst"); };
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
      onDue={(it) => void markDue(it)} onAttach={attachEvidence}
      onConfirm={(it) => void confirmPaid(it)} onReject={rejectEvidence} onView={viewEvidence} />
  );
  // ── ดำเนินโครงการ ──
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
  // บันทึกผล (ขยับขั้น) ก่อน แล้วค่อยอัปโหลดไฟล์ — ไฟล์ไม่ผ่าน ผลสำรวจยังอยู่ แนบซ้ำที่ขั้น 03 ได้
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

  const wonButton = (primary: boolean) => (
    <button type="button" className={primary ? btnPrimary : btn} disabled={sentQuotes.length === 0}
      title={sentQuotes.length ? undefined : "ต้องมีใบเสนอราคาที่อนุมัติครบ 3 ชั้นและส่งลูกค้าแล้ว"} onClick={() => openModal("won")}>ได้งาน</button>
  );
  const newBoqButton = canEditBoq && <button type="button" className={btnPrimary} onClick={() => openModal("new_boq")}>+ BOQ ขนาดใหม่</button>;

  const createQuote = (boqId: number) => run(async () => {
    if (!boqId) throw new Error("กรุณาเลือก BOQ");
    const r = await apiFetch("/api/b2b/quotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: p.id, boq_id: boqId }) }) as { id: number };
    router.push(`/b2b/quotations/${r.id}`);
  });

  // ── เช็กลิสต์ใบเสนอราคา (ขั้น 02 ใบประมาณการ · ขั้น 04 ใบยืนยัน) — ใบที่ขยับล่าสุดแทนความคืบหน้า (API เรียงใหม่ก่อน) ──
  const quoteFlow = (quotes: B2bProjectQuote[], kindLabel: string) => {
    const q = quotes[0] ?? null;
    const tier = q ? tierOfStatus(q.status) : null;
    const passed = q ? reviewedTiers(q.status) : 0;
    const sent = quotes.some((x) => x.status === "sent");
    const open = (text: string) => q && <Link href={`/b2b/quotations/${q.id}`} className={btnPrimary}>{text}</Link>;
    const items: NextItem[] = [
      {
        key: "quote", state: !q || editableStatus(q.status) ? "todo" : "ok", title: `ออกใบ${kindLabel}`,
        detail: q
          ? <>{q.doc_no} Rev {q.revision} <span className={`ml-1 inline-flex rounded-full px-2 text-xxs font-bold ${QUOTE_STATUS_TONE[q.status]}`}>{QUOTE_STATUS_LABEL[q.status]}</span>{quotes.length > 1 ? ` · ทั้งหมด ${quotes.length} ใบ` : ""}</>
          : "เลือก BOQ ตัวเลือกที่จะเสนอ",
        action: q ? <TextLink href={`/b2b/quotations/${q.id}`}>เปิดใบ</TextLink> : undefined,
      },
      {
        key: "review", state: passed === 3 ? "ok" : tier ? "pending" : "wait", title: "ผู้ตรวจสอบ 3 ชั้นอนุมัติ",
        detail: tier ? `รอผู้ตรวจสอบชั้น ${tier}` : q?.status === "changes_required" ? "ส่งกลับแก้ — แก้ใบแล้วส่งอนุมัติใหม่" : undefined,
        action: <TierBar done={passed} />,
      },
      { key: "sent", state: sent ? "ok" : "wait", title: "ส่งลูกค้า", detail: sent ? "ส่งแล้ว — รอลูกค้าตอบรับ" : "อนุมัติครบแล้วส่งจากหน้าใบเสนอราคา" },
    ];
    const title = sent ? null
      : !q ? `ต่อไป: ออกใบ${kindLabel}`
      : q.status === "changes_required" ? `ต่อไป: แก้ใบ${kindLabel}ที่ถูกส่งกลับ แล้วส่งอนุมัติใหม่`
      : q.status === "draft" ? `ต่อไป: ส่งใบ${kindLabel}ให้ผู้ตรวจสอบอนุมัติ`
      : tier ? `รอผู้ตรวจสอบชั้น ${tier} อนุมัติใบ${kindLabel}`
      : q.status === "approved" ? `ต่อไป: ส่งใบ${kindLabel}ให้ลูกค้า` : null;
    const primary = !canEdit || sent ? null
      : !q ? (p.boqs.length > 0 && <button type="button" className={btnPrimary} onClick={() => openModal("new_quote")}>+ สร้างใบเสนอราคา</button>)
      : editableStatus(q.status) ? open("เปิดใบเพื่อส่งอนุมัติ")
      : q.status === "approved" ? open("เปิดใบเพื่อส่งลูกค้า") : null;
    return { items, title, primary };
  };
  const boqItem = (title: string, emptyHint: string): NextItem => latestBoq
    ? {
      key: "boq", state: "ok", title,
      detail: `${p.boqs.length > 1 ? `${p.boqs.length} ตัวเลือก · ล่าสุด ` : ""}${latestBoq.doc_no} Rev ${latestBoq.revision}${latestBoq.capacity_wp ? ` · ${formatTHB(latestBoq.capacity_wp / 1000, { decimals: 2 })} kWp` : ""}`,
      action: <TextLink href={`/b2b/boq/${latestBoq.id}`}>เปิด BOQ</TextLink>,
    }
    : { key: "boq", state: "todo", title, detail: emptyHint };
  /** ยังไม่มี BOQ — ข้อของใบเสนอราคายังไม่ถึง */
  const afterBoq = (items: NextItem[]) => (latestBoq ? items : items.map((it) => ({ ...it, state: "wait" as const })));

  // ── เนื้อหาย้อนหลังของขั้นขาย (กดจากแถบขั้น) + บรรทัดสรุป ──
  const surveyInfo = (
    <>
      <dl className={dl}>
        <div><dt className={dt}>วันนัดสำรวจ</dt><dd className="text-gray-800">{p.survey_date ? formatThaiDate(p.survey_date, { weekday: true }) : "ยังไม่ได้นัด"}</dd></div>
        <div><dt className={dt}>ผู้สำรวจ</dt><dd className="text-gray-800">{p.surveyor_name ?? "—"}</dd></div>
      </dl>
      {p.survey_done_at && p.survey_note && (
        <div><div className={dt}>ผลสำรวจ</div><p className="text-sm text-gray-800 whitespace-pre-line">{p.survey_note}</p></div>
      )}
    </>
  );
  const surveyFileList = (
    <ProjectFileList title="รูป/ไฟล์ผลสำรวจ" files={surveyFiles} canEdit={canEdit && !closed}
      onAdd={() => openModal("survey_files")} onView={viewProjectFile} onRemove={(f) => void removeProjectFile(f)} />
  );
  const wonQuote = p.quotes.find((x) => x.id === p.won_quote_id) ?? null;
  const contractInfo = (withButton: boolean) => (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <dl className={dl}>
        <div><dt className={dt}>ใบที่ได้งาน</dt><dd className="text-gray-800">{wonQuote ? <Link href={`/b2b/quotations/${wonQuote.id}`} className="text-primary hover:underline">{wonQuote.doc_no} Rev {wonQuote.revision}</Link> : "—"}</dd></div>
        <div><dt className={dt}>มูลค่าสัญญา</dt><dd className="text-gray-800 tabular-nums">{p.contract_value != null ? `${formatTHB(p.contract_value, { decimals: 2 })} บาท (ก่อน VAT)` : "—"}</dd></div>
        <div><dt className={dt}>เลข PO / สัญญา</dt><dd className="text-gray-800">{p.contract_no ?? "—"}</dd></div>
        <div><dt className={dt}>วันลงนาม</dt><dd className={p.contract_date ? "text-gray-800" : "text-amber-700 font-semibold"}>{p.contract_date ? formatThaiDate(p.contract_date) : "ยังไม่ได้บันทึก"}</dd></div>
        {p.om_years != null && <div><dt className={dt}>O&amp;M ที่รวมในราคา</dt><dd className="text-gray-800">{p.om_years} ปี · ปีละ {p.om_visits_per_year ?? "—"} ครั้ง</dd></div>}
      </dl>
      {withButton && canEdit && !closed && (
        <div className="flex justify-end">
          <button type="button" className={btn} onClick={() => openModal("contract")}>{p.contract_date ? "แก้สัญญา / PO" : "บันทึกสัญญา / PO"}</button>
        </div>
      )}
    </div>
  );
  const steps: Record<number, { summary?: ReactNode; history?: ReactNode }> = {
    3100: {
      summary: `${p.customer.name}${p.contact_name ? ` · ${p.contact_name}` : ""}${p.location ? ` · ${p.location}` : ""}`,
      history: infoGrid,
    },
    3200: {
      summary: p.boqs.length ? `BOQ ${p.boqs.length} ตัวเลือก${estimateQuotes.length ? ` · ใบประมาณการ ${estimateQuotes.length} ใบ` : ""}` : "ข้ามขั้นนี้",
      history: <><BoqOptionsTable boqs={p.boqs} canAdd={canEditBoq} onAdd={() => openModal("new_boq")} /><QuoteList title="ใบประมาณการ" quotes={estimateQuotes} canAdd={false} /></>,
    },
    3300: {
      summary: p.survey_done_at
        ? `สำรวจ ${formatThaiDate(p.survey_date)}${p.surveyor_name ? ` โดย ${p.surveyor_name}` : ""}${surveyFiles.length ? ` · ไฟล์ ${surveyFiles.length}` : ""}${p.survey_note ? ` · ${p.survey_note}` : ""}`
        : "ข้ามขั้นนี้",
      history: <>{surveyInfo}{surveyFileList}</>,
    },
    3400: {
      summary: `BOQ ${p.boqs.length} ตัวเลือก${confirmQuotes.length ? ` · ใบยืนยัน ${confirmQuotes.length} ใบ` : ""}`,
      history: <><BoqOptionsTable boqs={p.boqs} canAdd={canEditBoq} onAdd={() => openModal("new_boq")} /><QuoteList title="ใบเสนอราคายืนยัน" quotes={confirmQuotes} canAdd={false} /></>,
    },
    3500: {
      summary: p.contract_value != null
        ? `สัญญา${p.contract_no ? ` ${p.contract_no}` : ""} · ${formatTHB(p.contract_value, { decimals: 0 })} บาท (ก่อน VAT)${p.contract_date ? ` · ลงนาม ${formatThaiDate(p.contract_date)}` : ""}`
        : undefined,
      history: contractInfo(true),
    },
    3600: { summary: `${doneOn("procured", "สั่งของครบ") ?? "ยังไม่บันทึกสั่งของครบ"} · ขออนุญาตเรียบร้อย ${permitsOk}/${PERMITS.length}` },
    3700: { summary: doneOn("install_done", "ติดตั้งเสร็จ") },
    3800: { summary: doneOn("cod", "จ่ายไฟ (COD)") },
    3900: { summary: doneOn("handover", "ส่งมอบ") },
  };

  // ── ขั้นปัจจุบัน: การ์ดขั้นต่อไป + เนื้อหา ──
  type ExecNext = { kind: MilestoneKind | null; toHandover?: boolean };
  const execNext = (): ExecNext => {
    if (p.stage === B2B_STAGE.permit) return { kind: msOf("materials_arrived") ? null : "materials_arrived" };
    if (p.stage === B2B_STAGE.install) {
      const k = MILESTONES.find((d) => d.step === B2B_STAGE.install && !msOf(d.kind))?.kind;
      return { kind: k ?? (msOf("gridtie_submitted") ? null : "gridtie_submitted") };
    }
    if (p.stage === B2B_STAGE.gridtie) return msOf("cod") ? { kind: null, toHandover: true } : { kind: msOf("gridtie_submitted") ? "cod" : "gridtie_submitted" };
    if (p.stage === B2B_STAGE.handover) return { kind: msOf("handover") ? null : "handover" };
    return { kind: null };
  };
  const exec: ExecNext = p.stage >= B2B_STAGE.permit && p.stage <= B2B_STAGE.handover ? execNext() : { kind: null };
  const board = (
    <ExecutionBoard p={p} stateOf={stateOf} dateOf={(s) => stepPassedAt(p, s)} nextKind={exec.kind}
      canExec={canExec} canPermit={canPermit} canEdit={canEdit && !closed} canConfirm={canConfirm && !closed} busyId={instBusy}
      onRecord={openRecord} onEditMilestone={(m) => { setMsEdit(m); openModal("milestone_edit"); }} onUndoMilestone={(m) => void undoMilestone(m)}
      onMilestoneFile={viewMilestoneFile} onPermit={(x) => { setPermit(x); openModal("permit"); }} onPermitFile={viewPermitFile}
      onAttach={attachEvidence} onConfirm={(it) => void confirmPaid(it)} onReject={rejectEvidence} onViewEvidence={viewEvidence}
      onAllInstallments={p.installments.length > 0 ? () => setTab("installments") : undefined} />
  );

  const current = ((): Current | null => {
    if (closed) return null;
    switch (p.stage) {
      case B2B_STAGE.lead:
        return {
          title: "ต่อไป: ทำราคาประมาณการ หรือนัดสำรวจ",
          sub: "ลูกค้าให้เข้าดูหน้างานได้เลย → ข้ามไปนัดสำรวจ",
          inner: infoGrid,
          actions: canEdit && <button type="button" className={btn} onClick={() => openModal("schedule")}>ข้ามไปนัดสำรวจ</button>,
          primary: canEdit && <button type="button" className={btnPrimary} onClick={() => void moveTo(B2B_STAGE.estimate, "เริ่มทำ BOQ ราคาประมาณการ (Google Maps) — เพิ่มได้หลายขนาด")}>เริ่มทำราคาประมาณการ</button>,
        };
      case B2B_STAGE.estimate: {
        const qf = quoteFlow(estimateQuotes, "ประมาณการ");
        const scheduleIsPrimary = !!latestBoq && !qf.primary;
        const schedule = (primary: boolean) => <button type="button" className={primary ? btnPrimary : btn} onClick={() => openModal("schedule")}>ลูกค้าสนใจ · นัดสำรวจ</button>;
        return {
          title: !latestBoq ? "ต่อไป: ทำ BOQ ราคาประมาณการ" : qf.title ?? "ต่อไป: ลูกค้าสนใจ → นัดสำรวจเพื่อยืนยันราคา",
          sub: "ลูกค้าสนใจแล้วนัดสำรวจได้เลย ไม่ต้องรอครบทุกข้อ",
          items: [boqItem("BOQ ราคาประมาณการ", "ทำจาก Google Maps · เพิ่มได้หลายขนาด"), ...afterBoq(qf.items)],
          actions: canEdit && (sentQuotes.length > 0 || !scheduleIsPrimary) && <>
            {sentQuotes.length > 0 && <button type="button" className={btn} onClick={() => openModal("won")}>ได้งานจากใบประมาณการ</button>}
            {!scheduleIsPrimary && schedule(false)}
          </>,
          primary: canEdit && (!latestBoq ? newBoqButton : scheduleIsPrimary ? schedule(true) : qf.primary),
          body: <>
            <BoqOptionsTable boqs={p.boqs} canAdd={canEditBoq} onAdd={() => openModal("new_boq")} />
            <QuoteList title="ใบประมาณการ" quotes={estimateQuotes} canAdd={canEdit} onAdd={() => openModal("new_quote")} />
          </>,
        };
      }
      case B2B_STAGE.survey: {
        const hasDate = !!p.survey_date;
        const future = p.sub === B2B_SURVEY_SUB.scheduled;
        return {
          title: !hasDate ? "ต่อไป: นัดวันสำรวจ" : future ? `นัดสำรวจ ${formatThaiDate(p.survey_date, { weekday: true })}` : "ต่อไป: บันทึกผลสำรวจ",
          sub: hasDate ? "สำรวจแล้วบันทึกผล แนบรูป/ไฟล์ไปพร้อมกันได้ → ไปขั้นราคายืนยัน" : undefined,
          items: [
            { key: "date", state: hasDate ? "ok" : "todo", title: "นัดวันสำรวจ",
              detail: hasDate ? `${formatThaiDate(p.survey_date, { weekday: true })}${p.surveyor_name ? ` · ${p.surveyor_name}` : ""}` : "เลือกวัน + ผู้สำรวจ" },
            { key: "record", state: hasDate && !future ? "todo" : "wait", title: "สำรวจหน้างาน แล้วบันทึกผล",
              detail: future ? "ถึงวันนัดแล้วบันทึกผล" : !hasDate ? undefined : p.survey_note ? `ผลครั้งก่อน: ${p.survey_note}` : undefined },
          ],
          actions: canEdit && hasDate && <button type="button" className={btn} onClick={() => openModal("schedule")}>เลื่อนนัด</button>,
          primary: canEdit && (hasDate
            ? <button type="button" className={btnPrimary} onClick={() => openModal("record")}>บันทึกผลสำรวจ</button>
            : <button type="button" className={btnPrimary} onClick={() => openModal("schedule")}>นัดสำรวจ</button>),
          body: surveyFileList,
        };
      }
      case B2B_STAGE.confirm: {
        const qf = quoteFlow(confirmQuotes, "เสนอราคายืนยัน");
        const canWin = sentQuotes.length > 0;
        return {
          title: canWin ? "ต่อไป: ลูกค้าตอบรับ → กด \"ได้งาน\"" : !latestBoq ? "ต่อไป: ทำ BOQ ตามผลสำรวจ" : qf.title ?? "ต่อไป: ออกใบเสนอราคายืนยัน",
          sub: "ลูกค้าต่อรอง = ออก Rev ใหม่ของใบ",
          items: [
            p.survey_done_at
              ? { key: "survey", state: "ok", title: "บันทึกผลสำรวจ", detail: `${formatThaiDate(p.survey_date)}${p.survey_note ? ` · ${p.survey_note}` : ""}` }
              : { key: "survey", state: "skip", title: "ข้ามสำรวจ" },
            boqItem("BOQ ตามผลสำรวจ", "ทำ BOQ Rev ใหม่ตามผลสำรวจ"),
            ...afterBoq(qf.items),
          ],
          note: canWin ? undefined : "🔒 กด \"ได้งาน\" ได้เมื่อมีใบที่อนุมัติครบ 3 ชั้นและส่งลูกค้าแล้ว",
          actions: canEdit && !canWin && wonButton(false),
          primary: canEdit && (canWin ? wonButton(true) : !latestBoq ? newBoqButton : qf.primary),
          body: <>
            <BoqOptionsTable boqs={p.boqs} canAdd={canEditBoq} onAdd={() => openModal("new_boq")} />
            <QuoteList title="ใบเสนอราคายืนยัน" quotes={confirmQuotes} canAdd={canEdit} onAdd={() => openModal("new_quote")} />
            {estimateQuotes.length > 0 && <QuoteList title="ใบประมาณการ (ขั้น 02)" quotes={estimateQuotes} canAdd={false} />}
          </>,
        };
      }
      case B2B_STAGE.won: {
        const i1 = p.installments.find((x) => x.no === 1) ?? null;
        return {
          title: !p.contract_date ? "ต่อไป: บันทึกสัญญา / PO" : i1?.status === "due" ? "ต่อไป: แนบหลักฐานรับเงินงวด 1"
            : i1?.status === "submitted" ? "รอบัญชียืนยันเงินงวด 1" : "รอรับเงินงวด 1",
          sub: "บัญชียืนยันเงินงวด 1 แล้ว โครงการเข้าขั้นขออนุญาต + จัดซื้อเอง",
          items: [
            { key: "won", state: "ok", title: "ได้งาน",
              detail: `${wonQuote ? `${wonQuote.doc_no} Rev ${wonQuote.revision} · ` : ""}${p.contract_value != null ? `${formatTHB(p.contract_value, { decimals: 2 })} บาท (ก่อน VAT)` : ""}`,
              action: wonQuote ? <TextLink href={`/b2b/quotations/${wonQuote.id}`}>เปิดใบ</TextLink> : undefined },
            { key: "contract", state: p.contract_date ? "ok" : "todo", title: "บันทึกสัญญา / PO",
              detail: p.contract_date ? `${p.contract_no ?? "ไม่มีเลข PO"} · ลงนาม ${formatThaiDate(p.contract_date)}` : "เลข PO / สัญญา + วันลงนาม" },
            ...(i1 ? [{
              key: "i1", state: i1.status === "paid" ? "ok" : i1.status === "submitted" ? "pending" : p.contract_date ? "todo" : "wait",
              title: `รับเงินงวด 1 · ${i1.pct}%`,
              detail: `${formatTHB(i1.total, { decimals: 2 })} บาท (รวม VAT) · ${INSTALLMENT_STATUS_LABEL[i1.status]}${i1.status === "due" && i1.reject_note ? ` · บัญชีตีกลับ: ${i1.reject_note}` : ""}`,
            } satisfies NextItem] : []),
          ],
          actions: ((canConfirm && i1?.status === "submitted") || (canEdit && p.contract_date)) && <>
            {canConfirm && i1?.status === "submitted" && <button type="button" className={btn} onClick={() => rejectEvidence(i1)}>ตีกลับ…</button>}
            {canEdit && p.contract_date && <button type="button" className={btn} onClick={() => openModal("contract")}>แก้สัญญา / PO</button>}
          </>,
          primary: canEdit && !p.contract_date ? <button type="button" className={btnPrimary} onClick={() => openModal("contract")}>บันทึกสัญญา / PO</button>
            : canEdit && i1?.status === "due" ? <button type="button" className={btnPrimary} onClick={() => attachEvidence(i1)}>แนบหลักฐานรับเงินงวด 1</button>
            : canConfirm && i1?.status === "submitted" ? <button type="button" className={btnPrimary} disabled={instBusy === i1.id} onClick={() => void confirmPaid(i1)}>ยืนยันรับเงินงวด 1</button>
            : null,
          body: <>{contractInfo(false)}{installmentTable}</>,
        };
      }
      case B2B_STAGE.permit: case B2B_STAGE.install: case B2B_STAGE.gridtie: case B2B_STAGE.handover: {
        const def = exec.kind ? milestoneDef(exec.kind)! : null;
        const inst = def?.trigger ? p.installments.find((i) => i.trigger_key === def.trigger) : undefined;
        const items: NextItem[] = [];
        if (!msOf("procured")) {
          items.push({ key: "procured", state: "pending", title: "รอ Purchase บันทึก \"สั่งของครบ\"", detail: "Purchase เห็นงบต้นทุนจาก BOQ ที่ได้งานในเมนูจัดซื้อ",
            action: canExec && <button type="button" className={`${btnSm} border border-gray-200 text-gray-600 hover:bg-gray-50`} onClick={() => openRecord("procured")}>บันทึกเอง</button> });
        }
        for (const it of p.installments) {
          if (it.status === "due") {
            items.push({ key: `i${it.id}`, state: "todo", title: `งวด ${it.no} ถึงกำหนดวางบิล`,
              detail: `${formatTHB(it.total, { decimals: 2 })} บาท (รวม VAT)${it.reject_note ? ` · บัญชีตีกลับ: ${it.reject_note}` : ""}`,
              action: canEdit && <button type="button" className={`${btnSm} bg-active text-white hover:bg-active-dark`} onClick={() => attachEvidence(it)}>แนบหลักฐาน</button> });
          } else if (it.status === "submitted") {
            items.push({ key: `i${it.id}`, state: "pending", title: `รอบัญชียืนยันเงินงวด ${it.no}`,
              detail: `${formatTHB(it.total, { decimals: 2 })} บาท · แนบหลักฐาน ${formatThaiDate(it.submitted_at)}`,
              action: canConfirm && <button type="button" className={`${btnSm} bg-emerald-500 text-white hover:bg-emerald-600`} disabled={instBusy === it.id} onClick={() => void confirmPaid(it)}>ยืนยันรับเงิน</button> });
          }
        }
        const outstanding = p.permits.filter((x) => x.status === "pending" || x.status === "submitted");
        if (outstanding.length) {
          items.push({ key: "permits", state: outstanding.some((x) => x.status === "submitted") ? "pending" : "wait", title: `ขออนุญาตเรียบร้อย ${permitsOk}/${PERMITS.length}`,
            detail: outstanding.map((x) => `${PERMITS.find((d) => d.kind === x.kind)!.short}: ${PERMIT_STATUS_LABEL[x.status]}`).join(" · ") });
        }
        const sub = def
          ? [def.moveTo && def.moveTo > p.stage && `บันทึกแล้วโครงการเข้าขั้น${stageLabel(def.moveTo)}`,
            inst && `งวด ${inst.no} (${inst.pct}% · ${formatTHB(inst.total, { decimals: 2 })} บาท รวม VAT) ถึงกำหนดวางบิลเอง`, def.hint].filter(Boolean).join(" · ")
          : exec.toHandover ? "ขนานไฟเรียบร้อย — นัดส่งมอบงาน + Training ลูกค้า"
          : "รับเงินครบทุกงวดแล้วโครงการปิดเอง · สัญญา O&M + ตารางเข้างานสร้างตอนปิด";
        return {
          title: def ? `ต่อไป: บันทึก "${def.label}"` : exec.toHandover ? "ต่อไป: เข้าขั้นส่งมอบ" : "รอรับเงินงวดที่เหลือ",
          sub,
          items,
          primary: canExec && (def ? <button type="button" className={btnPrimary} onClick={() => openRecord(def.kind)}>บันทึก{def.label}</button>
            : exec.toHandover ? <button type="button" className={btnPrimary} onClick={() => void toHandover()}>เข้าขั้นส่งมอบ</button> : null),
          body: <>
            {board}
            {p.stage === B2B_STAGE.handover && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                <dl className={dl}>
                  <div><dt className={dt}>รับประกันงานติดตั้ง</dt><dd className="text-gray-800">{msOf("handover") ? `เริ่มนับ ${formatThaiDate(msOf("handover")!.done_date)}` : "เริ่มนับจากวันส่งมอบ"}</dd></div>
                  {p.om_years != null && <div><dt className={dt}>O&amp;M ที่รวมในราคา</dt><dd className="text-gray-800">{p.om_years} ปี · ปีละ {p.om_visits_per_year ?? "—"} ครั้ง</dd></div>}
                </dl>
                {omBlock}
              </div>
            )}
          </>,
        };
      }
    }
    return null;
  })();

  const stepViews: StepView[] = B2B_FLOW.map((s, i) => {
    const state = stateOf(s.step);
    return {
      step: s.step, no: i + 1, label: s.label, short: s.short, state,
      date: state === "done" ? stepPassedAt(p, s.step) : null,
      skipped: state === "done" && stepSkipped(p, s.step),
      hint: LOCKED_HINT[s.step],
      summary: steps[s.step]?.summary,
    };
  });
  const historyCard = (step: number, opts: { stoppedHere?: boolean } = {}) => {
    const v = stepViews[noOf(step) - 1];
    return (
      <StepHistoryCard no={v.no} label={v.label} stopped={opts.stoppedHere} date={v.date} skipped={v.skipped} summary={steps[step]?.summary}
        onBack={opts.stoppedHere ? undefined : () => selectStep(at)}>
        {steps[step]?.history}
      </StepHistoryCard>
    );
  };

  // ── ตัวเลขหลักบน header — ช่วงขาย: BOQ ล่าสุด · หลังได้งาน: BOQ ที่ได้งาน + มูลค่าสัญญา + เงินที่รับแล้ว ──
  const kpiBoq = p.boqs.find((b) => b.id === p.won_boq_id) ?? latestBoq;
  const paid = p.installments.filter((i) => i.status === "paid");
  const kpis: { k: string; v: ReactNode; tone?: string }[] = [];
  if (kpiBoq?.capacity_wp) kpis.push({ k: "ขนาดระบบ", v: <>{formatTHB(kpiBoq.capacity_wp / 1000, { decimals: 2 })} <small>kWp</small></> });
  if (p.contract_value != null) {
    kpis.push({ k: "มูลค่าสัญญา (ก่อน VAT)", v: formatTHB(p.contract_value, { decimals: 2 }) });
    if (p.installments.length) {
      kpis.push({ k: "รับเงินแล้ว", tone: "text-emerald-600", v: <>{+paid.reduce((s, i) => s + i.pct, 0).toFixed(2)}% <small>{paid.length}/{p.installments.length} งวด</small></> });
    }
  } else if (kpiBoq) {
    if (kpiBoq.total_sale) kpis.push({ k: p.boqs.length > 1 ? "ราคาขาย · BOQ ล่าสุด" : "ราคาขาย (ก่อน VAT)", v: formatTHB(kpiBoq.total_sale, { decimals: 2 }) });
    kpis.push({ k: "Margin", v: `${kpiBoq.margin_pct}%` });
  }
  const kpiValue = "tabular-nums whitespace-nowrap [&_small]:text-xxs [&_small]:font-normal [&_small]:text-gray-500";

  const moreGroups: MoreItem[][] = !canEdit || closed ? [] : [
    [
      { key: "edit", label: "แก้ข้อมูลโครงการ", onClick: () => openModal("edit") },
      ...(p.stage === B2B_STAGE.estimate ? [{ key: "skip_survey", label: "ข้ามสำรวจ", hint: "ไปขั้นราคายืนยันเลย — มีข้อมูลหน้างานพอแล้ว",
        onClick: () => void moveTo(B2B_STAGE.confirm, "ข้ามการสำรวจ ไปขั้นราคายืนยัน — ใช้เมื่อมีข้อมูลหน้างานพอแล้ว (เช่น ลูกค้าส่งแบบหลังคา)") }] : []),
      ...(p.stage === B2B_STAGE.confirm ? [{ key: "back_survey", label: "ถอยไปสำรวจซ้ำ", hint: "กลับขั้นสำรวจแล้วนัดวันใหม่", onClick: () => openModal("back_survey") }] : []),
    ],
    [
      ...(p.stage <= B2B_LOSABLE_MAX_STAGE ? [{ key: "lost", label: "แพ้งาน", danger: true, onClick: () => openModal("lost") }] : []),
      { key: "cancel", label: "ยกเลิกโครงการ", danger: true, onClick: () => openModal("cancel") },
    ],
  ];

  const tabBtn = (t: Tab, label: string, extra = "") => (
    <button key={t} type="button" onClick={() => setTab(t)}
      className={`py-3 px-3 md:px-4 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === t ? "text-active border-active" : "text-gray-500 border-transparent hover:text-gray-700"} ${extra}`}>
      {label}
    </button>
  );

  return (
    <div className="min-h-full flex flex-col bg-gray-50" style={{ "--hdr": `${hdrH}px` } as CSSProperties}>
      {/* header ติดบน: ชื่อ + ป้ายขั้น + ข้อมูลย่อ | ตัวเลขหลัก | ⋯ · แถบขั้น · แท็บ */}
      <div ref={headerRef} className="bg-white border-b border-gray-200 sticky top-0 z-40" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center gap-2 md:gap-3 px-1 md:px-5 py-2.5">
          <button type="button" onClick={() => router.push(listHrefOf(p.stage, moduleKey))} style={{ minHeight: 0 }}
            className="md:hidden p-1.5 rounded-full text-gray-600 hover:bg-gray-200 shrink-0" aria-label="กลับ">
            <ChevronLeftIcon className="w-5 h-5" strokeWidth={2.5} />
          </button>
          <span className="max-md:hidden w-11 h-11 shrink-0 rounded-full bg-teal-50 flex items-center justify-center text-2xl">🏭</span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={listHrefOf(p.stage, moduleKey)} className="max-md:hidden text-gray-400 hover:text-gray-600" aria-label="กลับ"><ChevronLeftIcon className="w-5 h-5" strokeWidth={2.5} /></Link>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">{p.name}</h1>
              {/* มือถือดูขั้นจากแถบความคืบหน้าแทน */}
              <StageBadge stage={p.stage} sub={p.sub} surveyDate={p.survey_date} className="max-md:hidden" />
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
              <span>{p.code}</span>
              <span>{p.customer.name}</span>
              {p.contract_no && <span className="max-md:hidden">สัญญา <b className="font-medium text-gray-700">{p.contract_no}</b></span>}
              {p.owner_name && <span>ผู้ดูแล <b className="font-medium text-gray-700">{p.owner_name}</b></span>}
            </div>
          </div>
          {kpis.length > 0 && (
            <div className="max-lg:hidden flex shrink-0 rounded-xl border border-gray-200 divide-x divide-gray-200">
              {kpis.map((x) => (
                <div key={x.k} className="px-4 py-1 leading-tight">
                  <div className="text-xxs text-gray-500 whitespace-nowrap">{x.k}</div>
                  <div className={`text-base font-medium ${x.tone ?? "text-gray-900"} ${kpiValue}`}>{x.v}</div>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 shrink-0 pr-2 md:pr-0">
            {canEdit && stopped && <button type="button" className={btnPrimary} onClick={() => openModal("reopen")}>เปิดกลับ</button>}
            <MoreMenu groups={moreGroups} />
          </div>
        </div>
        <div className="md:hidden px-3 pb-2">
          <StepProgressMobile steps={stepViews} onSelect={selectStep}
            caption={p.stage === B2B_STAGE.closed ? "ปิดโครงการแล้ว" : stopped ? `${stageLabel(p.stage)} · ตอนขั้น ${stageLabel(at)}` : undefined} />
        </div>
        {kpis.length > 0 && (
          <div className="lg:hidden flex gap-2 overflow-x-auto px-3 md:px-5 pb-2.5">
            {kpis.map((x) => (
              <div key={x.k} className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-0.5 leading-tight">
                <div className="text-xxs text-gray-500 whitespace-nowrap">{x.k}</div>
                <div className={`text-sm font-medium ${x.tone ?? "text-gray-900"} ${kpiValue}`}>{x.v}</div>
              </div>
            ))}
          </div>
        )}
        <ProjectStepper steps={stepViews} selected={view} onSelect={selectStep} />
        <div className="flex overflow-x-auto border-t border-gray-100 md:px-2">
          {tabBtn("workflow", "Workflow")}
          {tabBtn("info", "ข้อมูลโครงการ")}
          {tabBtn("boq", `BOQ (${p.boqs.length})`)}
          {p.installments.length > 0 && tabBtn("installments", "งวดเงิน")}
          {tabBtn("timeline", "Timeline", "lg:hidden")}
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <main ref={contentRef} className="flex-1 min-w-0 p-3 md:p-4 space-y-3 pb-6 scroll-mt-[calc(var(--hdr,124px)+12px)]">
          {tab === "workflow" && p.stage === B2B_STAGE.closed && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <b>ปิดโครงการแล้ว</b> — ส่งมอบงานและรับเงินครบทุกงวด{p.closed_at ? ` · ${formatThaiDate(p.closed_at)}` : ""}
              {p.om_contract_id != null && <> · <Link href={`/b2b/om/contracts/${p.om_contract_id}`} className="font-semibold underline">สัญญา O&amp;M →</Link></>}
            </div>
          )}
          {tab === "workflow" && stopped && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${p.stage === B2B_STAGE.lost ? "border-red-200 bg-red-50 text-red-700" : "border-gray-200 bg-white text-gray-600"}`}>
              <b>{stageLabel(p.stage)}</b> ตอนอยู่ขั้น {stageLabel(at)}{p.closed_at ? ` · ${formatThaiDate(p.closed_at)}` : ""}
              {p.close_reason && <div className="mt-0.5">{p.close_reason}</div>}
            </div>
          )}

          {tab === "workflow" && (view != null ? historyCard(view) : current ? (
            <>
              <NextStepCard no={noOf(p.stage)} label={stageLabel(p.stage)} enteredAt={stageEnteredAt(p)} title={current.title} sub={current.sub}
                items={current.items} note={current.note} actions={current.actions} primary={current.primary}>
                {current.inner}
              </NextStepCard>
              {current.body}
            </>
          ) : boardInCurrent ? (
            <>{board}{p.stage === B2B_STAGE.closed && omBlock}</>
          ) : stopped ? historyCard(at, { stoppedHere: true }) : null)}

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

      {/* มือถือ: ปุ่มหลักของขั้นติดท้ายจอ (sticky bottom-0 = ลอยเหนือแถบล่างพอดี เพราะ main ของ layout เผื่อ pb-20 ไว้แล้ว) */}
      {tab === "workflow" && view == null && current?.primary && (
        <div className="md:hidden sticky bottom-0 z-30 flex border-t border-gray-200 bg-white px-3 py-2 *:h-11 *:flex-1">
          {current.primary}
        </div>
      )}

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
