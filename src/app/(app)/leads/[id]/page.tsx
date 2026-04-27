"use client";

import { apiFetch } from "@/lib/api";
import { stripThaiTitle } from "@/lib/utils/name";
import { useEffect, useState, use, useCallback, useRef } from "react";
import Link from "next/link";
import ActivityTimeline from "@/components/lead/detail/ActivityTimeline";
import AddActivityModal, { ActivityType } from "@/components/lead/detail/AddActivityModal";
import AssignOwnerButton from "@/components/lead/AssignOwnerButton";
import LostModal from "@/components/lead/detail/LostModal";
import ProfileModal from "@/components/lead/detail/ProfileModal";
import LinePickerModal from "@/components/modal/LinePickerModal";
import Header from "@/components/layout/Header";
import { Activity } from "@/components/lead/detail/ActivityItem";
import PreSurveyStep from "@/components/lead/detail/steps/PreSurveyStep";
import SurveyStep from "@/components/lead/detail/steps/SurveyStep";
import QuoteStep from "@/components/lead/detail/steps/QuoteStep";
import OrderStep from "@/components/lead/detail/steps/OrderStep";
import InstallStep from "@/components/lead/detail/steps/InstallStep";
import WarrantyStep from "@/components/lead/detail/steps/WarrantyStep";
import GridTieStep from "@/components/lead/detail/steps/GridTieStep";
import type { Lead, Package, CardStateKind } from "@/components/lead/detail/steps/types";
import { useDialog } from "@/components/ui/Dialog";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

const formatDate = (d: string) =>
  new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

const STEP_ORDER = ["pre_survey", "survey", "quote", "order", "install", "warranty", "gridtie"];

const STEP_TEAMS: Record<number, string> = {
  0: "SMARTIFY",
  1: "SOLAR",
  2: "SOLAR",
  3: "SMARTIFY",
  4: "SOLAR",
  5: "SOLAR",
  6: "SOLAR",
};

function stepIndex(status: string) {
  if (status === "closed") return STEP_ORDER.length;
  return STEP_ORDER.indexOf(status);
}

const InfoRow = ({ label, value, mono = false, accent = false }: { label: string; value: React.ReactNode; mono?: boolean; accent?: boolean }) => (
  <div className="flex flex-col gap-0.5 py-2 border-b border-gray-100 last:border-0">
    <span className="text-xs font-semibold tracking-wider uppercase text-gray-400">{label}</span>
    <span className={`text-sm ${mono ? "font-mono tabular-nums" : ""} ${accent ? "font-bold text-gray-900" : "font-medium text-gray-800"}`}>{value}</span>
  </div>
);

// Top-level stable component: children keep the same React tree position across
// fullscreen toggles, so in-progress form state (textareas, inputs) is preserved.
// Fullscreen is CSS-only (position:fixed) — no portal, no duplication.
function StepCard({
  stepIdx,
  state,
  title,
  doneTitle,
  icon,
  lead,
  isMobile,
  fullscreen,
  setFullscreen,
  onHeaderClick,
  children,
}: {
  stepIdx: number;
  state: CardStateKind;
  title: string;
  doneTitle?: string;
  icon: string;
  lead: Lead;
  isMobile: boolean;
  fullscreen: boolean;
  setFullscreen: (v: boolean) => void;
  onHeaderClick?: () => void;
  children: React.ReactNode;
}) {
  const stepNum = String(stepIdx + 1).padStart(2, "0");
  const team = STEP_TEAMS[stepIdx];

  const container = state === "active"
    ? "bg-active-light border border-active shadow-sm shadow-active/10 ring-1 ring-active/20"
    : state === "done"
    ? "bg-white border border-gray-300"
    : "bg-gray-50 border border-dashed border-gray-200 pointer-events-none";

  const iconBox = state === "active"
    ? "bg-active text-white"
    : state === "done"
    ? "bg-emerald-500 text-white"
    : "bg-white text-gray-300 ring-1 ring-inset ring-gray-200";

  const inlineClick = fullscreen
    ? undefined
    : state === "active" && isMobile
      ? () => setFullscreen(true)
      : onHeaderClick;
  const headerClickable = !!inlineClick;

  const header = (
    <div
      className={`flex items-center gap-3 px-5 py-4 ${headerClickable ? "cursor-pointer" : ""}`}
      onClick={inlineClick}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBox}`}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold tracking-wider uppercase leading-none ${state === "locked" ? "text-gray-300" : "text-gray-400"}`}>
          Step {stepNum} · {team}
        </div>
        <div className={`text-base font-bold leading-tight tracking-tight mt-1 ${state === "locked" ? "text-gray-400" : "text-gray-900"}`}>
          {state === "done" && doneTitle ? doneTitle : title}
        </div>
      </div>
      {state === "active" && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setFullscreen(!fullscreen); }}
            aria-label={fullscreen ? "ปิดเต็มจอ" : "เปิดเต็มจอ"}
            className="md:hidden w-7 h-7 rounded-md text-gray-500 hover:text-active hover:bg-active/5 flex items-center justify-center transition-colors"
            title={fullscreen ? "ปิดเต็มจอ" : "เปิดเต็มจอ"}
            style={{ minHeight: 0 }}
          >
            {fullscreen ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-active">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-active opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-active" />
            </span>
            Active
          </span>
        </div>
      )}
      {state === "done" && (() => {
        const paidStep =
          (stepIdx === 0 && (lead.payment_confirmed || lead.pre_slip_url)) ||
          (stepIdx === 3 && lead.order_before_paid) ||
          (stepIdx === 4 && lead.order_after_paid);
        return (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider shrink-0 ${paidStep ? "text-blue-600" : "text-teal-600"}`}>
            ✓ {paidStep ? "Paid" : "Done"}
          </span>
        );
      })()}
    </div>
  );

  const rootCls = fullscreen
    ? "fixed inset-0 z-[9999] bg-white flex flex-col safe-top"
    : `group relative rounded-2xl overflow-hidden transition-all ${container}`;
  const bodyCls = fullscreen
    ? "flex-1 overflow-y-auto p-4 safe-bottom"
    : "px-5 pb-5 pt-3 border-t border-gray-100";
  const headerWrapCls = fullscreen ? "shrink-0 border-b border-gray-100" : "";

  return (
    <div data-step-active={state === "active" ? "" : undefined} className={rootCls}>
      <div className={headerWrapCls}>{header}</div>
      {state !== "locked" && <div className={bodyCls}>{children}</div>}
    </div>
  );
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const dialog = useDialog();
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loadingLead, setLoadingLead] = useState(true);
  const [loadingAct, setLoadingAct] = useState(true);
  const [modalType, setModalType] = useState<ActivityType | null>(null);
  const [showLostModal, setShowLostModal] = useState(false);
  const [tab, setTab] = useState<"info" | "log">("info");
  const [showLineModal, setShowLineModal] = useState(false);
  const [showUnmapLine, setShowUnmapLine] = useState(false);
  const [unmapping, setUnmapping] = useState(false);
  // Which step is expanded to full-screen on mobile (null = none).
  const [fullscreenStep, setFullscreenStep] = useState<number | null>(null);
  const isMobile = useIsMobile();
  useEffect(() => {
    if (fullscreenStep === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [fullscreenStep]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [preSurveyExpanded, setPreSurveyExpanded] = useState(false);
  const [surveyExpanded, setSurveyExpanded] = useState(false);
  const [quoteExpanded, setQuoteExpanded] = useState(false);
  const [orderExpanded, setOrderExpanded] = useState(false);
  const [installExpanded, setInstallExpanded] = useState(false);
  const [warrantyExpanded, setWarrantyExpanded] = useState(false);
  const [gridTieExpanded, setGridTieExpanded] = useState(false);

  const fetchLead = useCallback(() => {
    return apiFetch(`/api/leads/${id}`)
      .then(setLead)
      .catch((e: unknown) => {
        // 404 = deleted lead — fall through to "Not found" UI silently.
        const msg = e instanceof Error ? e.message : String(e);
        if (!/API error: 404/.test(msg)) console.error(e);
      })
      .finally(() => setLoadingLead(false));
  }, [id]);
  const fetchActivities = useCallback(() => {
    setLoadingAct(true);
    return apiFetch(`/api/leads/${id}/activities`)
      .then(setActivities)
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/API error: 404/.test(msg)) console.error(e);
      })
      .finally(() => setLoadingAct(false));
  }, [id]);

  useEffect(() => {
    fetchLead();
    fetchActivities();
    apiFetch("/api/packages").then(setPackages).catch(console.error);
  }, [fetchLead, fetchActivities]);

  const refresh = useCallback(() => {
    return Promise.all([fetchLead(), fetchActivities()]);
  }, [fetchLead, fetchActivities]);

  // Refresh lead data whenever fullscreen card closes so the underlying
  // inline card reflects edits made inside the portal.
  const prevFullscreenStep = useRef<number | null>(null);
  useEffect(() => {
    if (prevFullscreenStep.current !== null && fullscreenStep === null) {
      refresh();
    }
    prevFullscreenStep.current = fullscreenStep;
  }, [fullscreenStep, refresh]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active step when lead status changes or on first load
  const hasScrolled = useRef(false);
  useEffect(() => {
    if (!lead || tab !== "info" || hasScrolled.current) return;
    const t = setTimeout(() => {
      const el = document.querySelector("[data-step-active]") as HTMLElement | null;
      if (el) {
        hasScrolled.current = true;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [lead, tab]);

  if (loadingLead) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!lead) return <div className="text-center py-12 text-gray-500">Not found</div>;

  const isLost = lead.status === "lost" || lead.status === "returned";
  const isUpgrade = lead.customer_type?.includes("Upgrade") || lead.customer_type?.includes("เดิม");
  // pre_survey is only "done" if we've actually moved past it into a real
  // downstream step. Terminal states (lost/returned) don't imply completion —
  // the lead was exited before finishing.
  const hasPreSurveyDone = STEP_ORDER.indexOf(lead.status) > 0 || lead.status === "closed";
  const currentStep = stepIndex(lead.status);

  const cardState = (stepIdx: number): CardStateKind => {
    if (isLost) return "locked";
    if (stepIdx === 0) return hasPreSurveyDone ? "done" : "active";
    if (stepIdx < currentStep) return "done";
    if (stepIdx === currentStep) return "active";
    return "locked";
  };

  const stepProps = (stepIdx: number) => ({
    stepIdx,
    state: cardState(stepIdx),
    lead: lead!,
    isMobile,
    fullscreen: fullscreenStep === stepIdx,
    setFullscreen: (v: boolean) => setFullscreenStep(v ? stepIdx : null),
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header — subtle primary tint */}
      <div className="bg-gradient-to-b from-primary via-primary/50 to-white safe-top sticky top-0 z-10">
        {/* Top row: back + name + call */}
        <div className="pl-3 pr-5 pt-3 flex items-center gap-2">
          <button type="button" onClick={() => window.history.back()} className="p-2 rounded-full text-gray-700 hover:bg-white/40 transition-colors shrink-0" style={{ minHeight: 0 }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-1">
            <h1 className="text-2xl font-bold tracking-tight leading-tight text-gray-900 truncate">{stripThaiTitle(lead.full_name)}</h1>
            <button type="button" onClick={() => setShowProfileModal(true)} className="shrink-0 w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-primary transition-colors" style={{ minHeight: 0 }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          {/* LINE link button — connected: open unmap modal; not connected: open picker */}
          <button
            type="button"
            onClick={() => {
              if (lead.line_id) setShowUnmapLine(true);
              else setShowLineModal(true);
            }}
            title={lead.line_id ? "คลิกเพื่อยกเลิกการเชื่อม LINE" : "เชื่อมกับ LINE ลูกค้า"}
            style={{ minHeight: 0 }}
            className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition-all ${
              lead.line_id
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/40 hover:bg-emerald-600"
                : "bg-white text-gray-500 shadow border border-gray-200 hover:border-active/40 hover:text-active"
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.44 3.317V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>
          </button>
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              className="shrink-0 w-11 h-11 rounded-full bg-primary text-white shadow-lg shadow-primary/40 flex items-center justify-center hover:bg-primary-dark active:scale-95 transition-all"
              aria-label="โทร"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.05-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.24 1.05l-2.21 2.17z" />
              </svg>
            </a>
          )}
        </div>

        {/* Meta — order: project (under name), source/upgrade badges, phone */}
        <div className="px-5 pb-3 pt-1 space-y-1">
          {(lead.project_name || lead.installation_address || lead.contact_date) && (
            <div className="text-xs text-gray-600 leading-tight flex items-center gap-1.5 min-w-0">
              <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">
                {lead.installation_address && <span className="font-bold text-gray-900">{lead.installation_address}</span>}
                {lead.installation_address && lead.project_name && <span className="text-gray-300"> · </span>}
                {lead.project_name}
                {lead.contact_date && (() => {
                  const aging = Math.floor((Date.now() - new Date(lead.contact_date).getTime()) / 86400000);
                  const toneText = aging >= 14 ? "text-red-600" : aging >= 7 ? "text-amber-600" : "text-emerald-600";
                  return (
                    <>
                      <span className="text-gray-300 mx-1.5">·</span>
                      ติดต่อ {formatDate(lead.contact_date)}
                      {aging > 0 && <span className={`ml-1 font-semibold ${toneText}`}>({aging} วัน)</span>}
                    </>
                  );
                })()}
              </span>
            </div>
          )}
          <div className="text-xs text-gray-600 leading-tight flex items-center gap-1.5 flex-wrap">
            {lead.phone && (
              <>
                <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.05-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.24 1.05l-2.21 2.17z" />
                </svg>
                <span className="font-mono tabular-nums">{lead.phone}</span>
                <span className="text-gray-300">·</span>
              </>
            )}
            <span className="inline-flex items-center gap-1">
              {lead.source === "event" ? (
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                </svg>
              )}
              {lead.source === "event" ? "Event" : "Walk-in"}
            </span>
            {isUpgrade && (
              <>
                <span className="text-gray-300">·</span>
                <span className="inline-flex items-center gap-1 font-semibold text-purple-600">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                  </svg>
                  Upgrade
                </span>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-5 gap-1">
          <button
            onClick={() => setTab("info")}
            className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors ${tab === "info" ? "text-active border-active" : "text-gray-500 border-transparent hover:text-gray-700"}`}
          >
            Info
          </button>
          <button
            onClick={() => setTab("log")}
            className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors ${tab === "log" ? "text-active border-active" : "text-gray-500 border-transparent hover:text-gray-700"}`}
          >
            Activity Log <span className="text-xs text-gray-400 ml-1 normal-case">{activities.length}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-20 relative" style={{ overscrollBehaviorY: "contain" }}>
        {tab === "info" ? (
          <div className="p-4 space-y-3">
            {/* Latest Contact — ข้อมูลการติดต่อล่าสุด */}
            {(() => {
              // DB-first: every contact event lives in lead_activities (including register/walk-in)
              const latest = activities[0];
              const typeMap: Record<string, { label: string; color: string }> = {
                note: { label: "โน้ต", color: "bg-emerald-500" },
                call: { label: "โทร", color: "bg-emerald-500" },
                visit: { label: "เยี่ยม", color: "bg-emerald-500" },
                follow_up: { label: "ติดตาม", color: "bg-emerald-500" },
                lead_created: { label: "ลงทะเบียน", color: "bg-emerald-500" },
                status_change: { label: "สถานะ", color: "bg-emerald-500" },
                presurvey_doc_created: { label: "เปิดเลขเอกสาร", color: "bg-emerald-500" },
              };

              const headerLabel = latest
                ? `${typeMap[latest.activity_type]?.label || "บันทึก"} · ${formatDate(latest.created_at)}`
                : "";
              const bodyText = latest ? (latest.note || latest.title) : null;
              const createdBy = latest?.created_by_name ?? null;
              const accentColor = latest
                ? (typeMap[latest.activity_type]?.color || "bg-gray-500") + " text-white"
                : "bg-gray-50 text-gray-400 ring-1 ring-inset ring-gray-200";
              const isEmpty = !bodyText;

              return (
                <div
                  onClick={() => setModalType("note")}
                  className="relative w-full text-left rounded-2xl bg-white border border-gray-300 hover:border-gray-400 hover:shadow-sm transition-all cursor-pointer"
                >
                  <div className="p-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accentColor}`}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.28 3.238.37 1.083.088 1.953.823 2.306 1.794l1.499 4.125 1.5-4.125c.353-.97 1.222-1.706 2.305-1.793a48.68 48.68 0 003.238-.371c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold tracking-wider uppercase text-gray-400 leading-none">Latest Contact</div>
                        {!isEmpty && <div className="text-sm font-semibold text-gray-900 mt-1">{headerLabel}</div>}
                        {isEmpty && <div className="text-sm text-gray-400 mt-1">ยังไม่มีการติดต่อ · แตะเพื่อเพิ่ม</div>}
                      </div>
                      <span className="text-primary text-sm font-semibold shrink-0">+ เพิ่ม</span>
                    </div>
                    {!isEmpty && (
                      <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mt-3 pt-3 border-t border-gray-100">
                        {bodyText}
                        {createdBy && (
                          <div className="text-xs text-gray-400 mt-2">โดย {createdBy}</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="absolute bottom-3 right-3" onClick={(e) => e.stopPropagation()}>
                    <AssignOwnerButton
                      leadId={lead.id}
                      assignedUserId={lead.assigned_user_id}
                      assignedName={lead.assigned_name}
                      onChanged={refresh}
                      size="md"
                    />
                  </div>
                </div>
              );
            })()}

            {/* Step 01: Pre-Survey */}
            <StepCard
              {...stepProps(0)}
              title="Pre-Survey"
              icon="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.333 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
              onHeaderClick={cardState(0) === "done" ? () => setPreSurveyExpanded(!preSurveyExpanded) : undefined}
            >
              <PreSurveyStep lead={lead} state={cardState(0)} refresh={refresh} packages={packages} expanded={preSurveyExpanded} onToggle={() => setPreSurveyExpanded(!preSurveyExpanded)} />
            </StepCard>

            {/* Step 02: Survey */}
            <StepCard
              {...stepProps(1)}
              title="Survey"
              doneTitle="Survey Done"
              icon="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
              onHeaderClick={cardState(1) === "done" ? () => setSurveyExpanded(!surveyExpanded) : undefined}
            >
              <SurveyStep lead={lead} state={cardState(1)} refresh={refresh} onAddActivity={t => setModalType(t as ActivityType)} packages={packages} expanded={surveyExpanded} onToggle={() => setSurveyExpanded(!surveyExpanded)} />
            </StepCard>

            {/* Step 03: Quotation */}
            <StepCard
              {...stepProps(2)}
              title="Quotation"
              doneTitle="Quotation Done"
              icon="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            >
              <QuoteStep lead={lead} state={cardState(2)} refresh={refresh} packages={packages} expanded={quoteExpanded} onToggle={() => setQuoteExpanded(!quoteExpanded)} />
            </StepCard>

            {/* Step 04: Purchased */}
            <StepCard
              {...stepProps(3)}
              title="Approval & Payment"
              doneTitle="Approved & Paid"
              icon="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            >
              <OrderStep lead={lead} state={cardState(3)} refresh={refresh} expanded={orderExpanded} onToggle={() => setOrderExpanded(!orderExpanded)} />
            </StepCard>

            {/* Step 05: Installed */}
            <StepCard
              {...stepProps(4)}
              title="Install"
              doneTitle="Install Done"
              icon="M11.42 15.17l-5.658-5.66a2.122 2.122 0 010-3l1.532-1.532a2.122 2.122 0 013 0L15.953 10.637a2.122 2.122 0 010 3l-1.532 1.532a2.122 2.122 0 01-3 0z"
            >
              <InstallStep lead={lead} state={cardState(4)} refresh={refresh} expanded={installExpanded} onToggle={() => setInstallExpanded(!installExpanded)} />
            </StepCard>

            {/* Step 06: Warranty */}
            <StepCard
              {...stepProps(5)}
              title="Warranty"
              doneTitle="Warranty Issued"
              icon="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.333 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
              onHeaderClick={cardState(5) === "done" ? () => setWarrantyExpanded(!warrantyExpanded) : undefined}
            >
              <WarrantyStep lead={lead} state={cardState(5)} refresh={refresh} packages={packages} expanded={warrantyExpanded} onToggle={() => setWarrantyExpanded(!warrantyExpanded)} />
            </StepCard>

            {/* Step 07: Grid-Tie (ขอขนานไฟ) */}
            <StepCard
              {...stepProps(6)}
              title="ขอขนานไฟ"
              doneTitle="ขนานไฟสำเร็จ"
              icon="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
              onHeaderClick={cardState(6) === "done" ? () => setGridTieExpanded(!gridTieExpanded) : undefined}
            >
              <GridTieStep lead={lead} state={cardState(6)} refresh={refresh} expanded={gridTieExpanded} onToggle={() => setGridTieExpanded(!gridTieExpanded)} />
            </StepCard>

            {/* Lost banner */}
            {isLost && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                <div className="text-sm font-bold text-red-700 mb-1">Closed Lost</div>
                {lead.lost_reason && <div className="text-xs text-red-600">{lead.lost_reason}</div>}
                {lead.revisit_date && (
                  <div className="text-xs text-red-600 mt-1">Revisit: {formatDate(lead.revisit_date)}</div>
                )}
                <button
                  onClick={() => setModalType("follow_up")}
                  className="mt-3 w-full h-10 rounded-lg text-xs font-semibold text-white bg-blue-500"
                >
                  Set Revisit Date
                </button>
              </div>
            )}

            {/* Lost action */}
            {!isLost && lead.status !== "install" && lead.status !== "warranty" && lead.status !== "gridtie" && lead.status !== "closed" && (
              <button
                onClick={() => setShowLostModal(true)}
                className="w-full py-3 rounded-xl text-sm text-red-400 border border-red-200 bg-white"
              >
                Mark as Lost
              </button>
            )}
          </div>
        ) : (
          <div className="p-4">
            <ActivityTimeline activities={activities} loading={loadingAct} />
          </div>
        )}
      </div>

      {/* Footer quick actions */}
      {tab === "info" && !isLost && (
        <div className="fixed left-0 right-0 md:left-64 above-nav bg-white border-t border-gray-100 z-40 px-3 py-2 flex gap-2">
          <button
            onClick={() => setModalType("follow_up")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-sm font-semibold active:bg-amber-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Follow-up
          </button>
          <button
            onClick={() => setModalType("note")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-100 text-sm font-semibold active:bg-gray-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
            Note
          </button>
        </div>
      )}

      {modalType && (
        <AddActivityModal
          activityType={modalType}
          leadId={lead.id}
          canSendBack={!!lead.from_prospect && lead.status === "pre_survey" && !lead.payment_confirmed}
          onClose={() => setModalType(null)}
          onSaved={refresh}
        />
      )}
      {showLostModal && <LostModal leadId={lead.id} onClose={() => setShowLostModal(false)} onSaved={refresh} />}

      {/* LINE map modal */}
      {showLineModal && (
        <LinePickerModal
          target={{ type: "lead", id: lead.id, label: lead.full_name }}
          onClose={() => setShowLineModal(false)}
          onLinked={() => refresh()}
        />
      )}

      {/* LINE unmap confirm modal */}
      {showUnmapLine && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => !unmapping && setShowUnmapLine(false)} />
          <div className="relative bg-white rounded-2xl w-[85%] max-w-sm p-5 animate-slide-up text-center">
            <button
              type="button"
              onClick={() => !unmapping && setShowUnmapLine(false)}
              disabled={unmapping}
              className="absolute top-3 right-3 w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100 flex items-center justify-center disabled:opacity-40"
              aria-label="ปิด"
              style={{ minHeight: 0 }}
            >
              ✕
            </button>
            <div className="text-base font-bold mb-3">ยกเลิกการเชื่อม LINE?</div>
            <div className="flex flex-col items-center gap-2 mb-3">
              {lead.line_picture_url ? (
                <img src={lead.line_picture_url} alt="" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg className="w-7 h-7 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.44 3.317V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                  </svg>
                </div>
              )}
              <div className="text-sm font-bold text-gray-900">{lead.line_display_name || "LINE user"}</div>
              <div className="text-xs text-gray-400 font-mono break-all max-w-[200px] truncate">{lead.line_id}</div>
            </div>
            <div className="text-xs text-gray-500 mb-3">ลูกค้า: <span className="font-semibold text-gray-700">{lead.full_name}</span></div>
            <div className="text-xs text-gray-400 mb-3">หลังยกเลิก จะส่ง LINE ให้ลูกค้ารายนี้ไม่ได้จนกว่าจะเชื่อมใหม่</div>
            <button
              type="button"
              onClick={async () => {
                setUnmapping(true);
                try {
                  await apiFetch(`/api/leads/${lead.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ line_id: null }),
                  });
                  await refresh();
                  setShowUnmapLine(false);
                } catch (e) {
                  dialog.alert({ title: "ยกเลิกไม่สำเร็จ", message: e instanceof Error ? e.message : "เกิดข้อผิดพลาด", variant: "danger" });
                } finally {
                  setUnmapping(false);
                }
              }}
              disabled={unmapping}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {unmapping ? "กำลังยกเลิก…" : "ยกเลิกการเชื่อม"}
            </button>
          </div>
        </div>
      )}

      {showProfileModal && (
        <ProfileModal leadId={lead.id} onClose={() => setShowProfileModal(false)} onSaved={refresh} />
      )}
    </div>
  );
}
