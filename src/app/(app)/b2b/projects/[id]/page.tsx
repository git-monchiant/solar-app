"use client";

import { use, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import { useDialog } from "@/components/ui/Dialog";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { apiFetch } from "@/lib/api";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatThaiDate, formatTHB } from "@/lib/utils/formatters";
import {
  B2B_FLOW, B2B_LOSABLE_MAX_STAGE, B2B_PROJECT_ROLES, B2B_STAGE, isClosedStage, stageLabel,
  type B2bProject, type B2bUserOption,
} from "@/lib/b2b/project";
import StageBadge from "@/components/b2b/project/StageBadge";
import ProjectStepCard, { type StepState } from "@/components/b2b/project/ProjectStepCard";
import BoqOptionsTable from "@/components/b2b/project/BoqOptionsTable";
import ActivityList from "@/components/b2b/project/ActivityList";
import ProjectFormModal from "@/components/b2b/project/ProjectFormModal";
import { CustomerEditModal, NewBoqModal, ReasonModal, RecordSurveyModal, ScheduleSurveyModal } from "@/components/b2b/project/ActionModals";

// หน้าโครงการ B2B — โครงเดียวกับหน้ารายละเอียดลีด (header ติดบน · แท็บ · รางขั้นซ้าย · การ์ดขั้น · Activity Log ขวา)
// แผน docs/plan/20261015-07-b2b-project-flow.md เฟส 1: เดินได้ 01–04 · 05–09 ล็อกไว้จนเฟส 2–4
// ขั้นเปลี่ยนผ่าน /actions ที่เดียว (server ตรวจกติกา) · ทุกครั้งได้โครงการทั้งก้อนกลับมาแทนค่าเดิม

type Tab = "workflow" | "info" | "boq" | "timeline";
type Modal = null | "edit" | "customer" | "lost" | "cancel" | "reopen" | "back_survey" | "schedule" | "record" | "new_boq";

const LOCKED_HINT: Record<number, string> = {
  3500: "ปลดเมื่อมีใบเสนอราคาที่ผ่านอนุมัติ 3 ชั้นและส่งลูกค้าแล้ว (เฟส 2–3)",
  3600: "ปลดเมื่อบัญชียืนยันเงินงวด 1 (เฟส 3)",
  3700: "milestone หน้างาน + งวด 2–3 (เฟส 4)",
  3800: "ผลพิจารณาการไฟฟ้า · วันจ่ายไฟ (เฟส 4)",
  3900: "ใบส่งมอบงาน + Training · งวด 4 (เฟส 4)",
};

export default function B2bProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { confirm, toast } = useDialog();
  const { activeRoles } = useActiveRoles();
  const canUse = hasRole(activeRoles, ...B2B_PROJECT_ROLES);
  const [p, setP] = useState<B2bProject | null>(null);
  const [loadError, setLoadError] = useState("");
  const [users, setUsers] = useState<B2bUserOption[]>([]);
  const [tab, setTab] = useState<Tab>("workflow");
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
  const at = closed ? (p.stage_before_close ?? B2B_STAGE.lead) : p.stage;
  const stateOf = (step: number): StepState => (step < at ? "done" : step > at ? "locked" : closed ? "stopped" : "active");

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
  const canEditBoq = !closed && p.stage <= B2B_STAGE.confirm;
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

  // ── การ์ดขั้น ──
  const steps: Record<number, { summary?: ReactNode; body?: ReactNode }> = {
    3100: {
      summary: `${p.customer.name}${p.contact_name ? ` · ${p.contact_name}` : ""}${p.location ? ` · ${p.location}` : ""}`,
      body: (
        <>
          {infoGrid}
          {stateOf(3100) === "active" && (
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" className={btn} onClick={() => openModal("schedule")}>ข้ามไปนัดสำรวจ</button>
              <button type="button" className={btnPrimary} onClick={() => void moveTo(B2B_STAGE.estimate, "เริ่มทำ BOQ ราคาประมาณการ (Google Maps) — เพิ่มได้หลายขนาด")}>เริ่มทำราคาประมาณการ</button>
            </div>
          )}
        </>
      ),
    },
    3200: {
      summary: p.boqs.length ? `BOQ ${p.boqs.length} ตัวเลือก` : "ข้ามขั้นนี้",
      body: (
        <>
          <BoqOptionsTable boqs={p.boqs} canAdd={canEditBoq} onAdd={() => openModal("new_boq")} />
          {stateOf(3200) === "active" && (
            <>
              {phaseNote("ใบเสนอราคา (ผัง SSE) + อนุมัติ 3 ชั้น เปิดใช้ในเฟส 2 — ตอนนี้ส่งราคาจากไฟล์ Excel ของ BOQ ไปก่อน")}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={btnGhost} style={{ minHeight: 0 }} onClick={() => void moveTo(B2B_STAGE.confirm, "ข้ามการสำรวจ ไปขั้นราคายืนยัน — ใช้เมื่อมีข้อมูลหน้างานพอแล้ว (เช่น ลูกค้าส่งแบบหลังคา)")}>ข้ามสำรวจ</button>
                <button type="button" className={btnPrimary} onClick={() => openModal("schedule")}>ลูกค้าสนใจ · นัดสำรวจ</button>
              </div>
            </>
          )}
        </>
      ),
    },
    3300: {
      summary: p.survey_done_at
        ? `สำรวจ ${formatThaiDate(p.survey_date)}${p.surveyor_name ? ` โดย ${p.surveyor_name}` : ""}${p.survey_note ? ` · ${p.survey_note}` : ""}`
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
          {stateOf(3300) === "active" && (
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" className={btn} onClick={() => openModal("schedule")}>{p.survey_date ? "เลื่อนนัด" : "นัดสำรวจ"}</button>
              <button type="button" className={btnPrimary} disabled={!p.survey_date} title={p.survey_date ? undefined : "นัดวันสำรวจก่อน"} onClick={() => openModal("record")}>บันทึกผลสำรวจ</button>
            </div>
          )}
        </>
      ),
    },
    3400: {
      summary: `BOQ ${p.boqs.length} ตัวเลือก`,
      body: (
        <>
          <BoqOptionsTable boqs={p.boqs} canAdd={canEditBoq} onAdd={() => openModal("new_boq")} />
          {stateOf(3400) === "active" && (
            <>
              {phaseNote("ทำ BOQ Rev ใหม่ตามผลสำรวจในหน้าทำ BOQ · ใบเสนอราคา + อนุมัติ 3 ชั้น (เฟส 2) · ปุ่มได้งาน (เฟส 3)")}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={btnGhost} style={{ minHeight: 0 }} onClick={() => openModal("back_survey")}>ถอยไปสำรวจซ้ำ</button>
                <button type="button" className={btnPrimary} disabled title="เปิดใช้ในเฟส 3 — ต้องมีใบเสนอราคาที่ส่งลูกค้าแล้ว">ได้งาน</button>
              </div>
            </>
          )}
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
          <button type="button" onClick={() => router.push("/b2b/projects")} style={{ minHeight: 0 }}
            className="md:hidden self-center ml-1 p-1.5 rounded-full text-gray-600 hover:bg-gray-200 shrink-0" aria-label="กลับ">
            <ChevronLeftIcon className="w-5 h-5" strokeWidth={2.5} />
          </button>
          <div className="max-md:hidden w-20 shrink-0 border-r border-gray-200 flex items-center justify-center py-2">
            <span className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center text-2xl">🏭</span>
          </div>
          <div className="flex-1 min-w-0 px-3 md:px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href="/b2b/projects" className="max-md:hidden text-gray-400 hover:text-gray-600" aria-label="กลับ"><ChevronLeftIcon className="w-5 h-5" strokeWidth={2.5} /></Link>
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
            {closed ? (
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
          {closed && (
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
                  {!closed && <button type="button" className={`ml-auto ${btn}`} onClick={() => openModal("customer")}>แก้ข้อมูลบริษัท</button>}
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
                  {!closed && <button type="button" className={`ml-auto ${btn}`} onClick={() => openModal("edit")}>แก้ข้อมูลโครงการ</button>}
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
              <div className="flex gap-2 md:hidden">
                {!closed && p.stage <= B2B_LOSABLE_MAX_STAGE && <button type="button" className={btn} onClick={() => openModal("lost")}>แพ้งาน</button>}
                {!closed && <button type="button" className={btn} onClick={() => openModal("cancel")}>ยกเลิกโครงการ</button>}
              </div>
            </div>
          )}

          {tab === "boq" && <BoqOptionsTable boqs={p.boqs} canAdd={canEditBoq} onAdd={() => openModal("new_boq")} />}

          {tab === "timeline" && (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden lg:hidden">
              <ActivityList activities={p.activities} onNote={addNote} />
            </div>
          )}
        </main>

        {/* Activity Log ขวา (จอใหญ่) — จอเล็กดูที่แท็บ Timeline */}
        <aside className="hidden lg:block w-80 shrink-0 border-l border-gray-200 bg-white">
          <div className="sticky overflow-y-auto" style={{ top: hdrH, maxHeight: `calc(100vh - ${hdrH}px)` }}>
            <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">Activity Log</div>
            <ActivityList activities={p.activities} onNote={addNote} />
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
      {modal === "new_boq" && <NewBoqModal saving={saving} error={error} onClose={() => setModal(null)} onConfirm={(v) => void createBoq(v)} />}
      {modal === "schedule" && (
        <ScheduleSurveyModal initialDate={p.survey_done_at ? null : p.survey_date} initialSurveyor={p.surveyor_id} users={users}
          saving={saving} error={error} onClose={() => setModal(null)}
          onConfirm={(v) => void act({ action: "schedule_survey", ...v }, "บันทึกนัดสำรวจแล้ว")} />
      )}
      {modal === "record" && (
        <RecordSurveyModal initialDate={p.survey_date} saving={saving} error={error} onClose={() => setModal(null)}
          onConfirm={(v) => void act({ action: "record_survey", ...v }, "บันทึกผลสำรวจแล้ว — ไปขั้นราคายืนยัน")} />
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
      {modal === "reopen" && (
        <ReasonModal title="เปิดโครงการกลับ" subtitle={`กลับไปขั้น ${stageLabel(at)}`} label="เหตุผล" required={false} placeholder="เช่น ลูกค้ากลับมาขอราคาใหม่"
          confirmText="เปิดกลับ" saving={saving} error={error} onClose={() => setModal(null)}
          onConfirm={(reason) => void act({ action: "reopen", reason }, "เปิดโครงการกลับแล้ว")} />
      )}
    </div>
  );
}
