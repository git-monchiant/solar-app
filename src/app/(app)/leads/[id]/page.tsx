"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState, use, useCallback, useRef } from "react";
import Link from "next/link";
import ActivityTimeline from "@/components/lead-detail/ActivityTimeline";
import AddActivityModal, { ActivityType } from "@/components/lead-detail/AddActivityModal";
import LostModal from "@/components/lead-detail/LostModal";
import Header from "@/components/Header";
import { Activity } from "@/components/lead-detail/ActivityItem";
import PreSurveyStep from "@/components/lead-detail/steps/PreSurveyStep";
import SurveyStep from "@/components/lead-detail/steps/SurveyStep";
import QuotationStep from "@/components/lead-detail/steps/QuotationStep";
import PurchasedStep from "@/components/lead-detail/steps/PurchasedStep";
import InstalledStep from "@/components/lead-detail/steps/InstalledStep";
import type { Lead, Package, CardStateKind } from "@/components/lead-detail/steps/types";

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

const STEP_ORDER = ["booked", "survey", "quoted", "purchased", "installed"];

function stepIndex(status: string) {
  return STEP_ORDER.indexOf(status);
}

const InfoRow = ({ label, value, mono = false, accent = false }: { label: string; value: React.ReactNode; mono?: boolean; accent?: boolean }) => (
  <div className="flex flex-col gap-0.5 py-2 border-b border-gray-100 last:border-0">
    <span className="text-xs font-semibold tracking-wider uppercase text-gray-400">{label}</span>
    <span className={`text-sm ${mono ? "font-mono tabular-nums" : ""} ${accent ? "font-bold text-gray-900" : "font-medium text-gray-800"}`}>{value}</span>
  </div>
);

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loadingLead, setLoadingLead] = useState(true);
  const [loadingAct, setLoadingAct] = useState(true);
  const [modalType, setModalType] = useState<ActivityType | null>(null);
  const [showLostModal, setShowLostModal] = useState(false);
  const [tab, setTab] = useState<"info" | "log">("info");
  const [showLineModal, setShowLineModal] = useState(false);
  const [pendingLineUsers, setPendingLineUsers] = useState<{ id: number; display_name: string; picture_url: string | null; line_user_id: string; lead_id: number | null }[]>([]);
  const [linkingLine, setLinkingLine] = useState(false);
  const [confirmLineUser, setConfirmLineUser] = useState<{ id: number; display_name: string; picture_url: string | null } | null>(null);
  const [lineSearch, setLineSearch] = useState("");

  const fetchLead = useCallback(() => {
    apiFetch(`/api/leads/${id}`).then(setLead).catch(console.error).finally(() => setLoadingLead(false));
  }, [id]);
  const fetchActivities = useCallback(() => {
    setLoadingAct(true);
    apiFetch(`/api/leads/${id}/activities`).then(setActivities).catch(console.error).finally(() => setLoadingAct(false));
  }, [id]);

  useEffect(() => {
    fetchLead();
    fetchActivities();
    apiFetch("/api/packages").then(setPackages).catch(console.error);
  }, [fetchLead, fetchActivities]);

  const refresh = useCallback(() => {
    fetchLead();
    fetchActivities();
  }, [fetchLead, fetchActivities]);

  // Auto-scroll to active step when lead status changes or on first load
  const lastStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!lead || tab !== "info") return;
    if (lastStatus.current === lead.status) return;
    lastStatus.current = lead.status;
    const t = setTimeout(() => {
      const el = document.querySelector("[data-step-active]") as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 150);
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

  const isLost = lead.status === "lost";
  const isUpgrade = lead.customer_type?.includes("Upgrade") || lead.customer_type?.includes("เดิม");
  const hasBooking = !!lead.booking_number;
  const currentStep = stepIndex(lead.status);

  const cardState = (stepIdx: number): CardStateKind => {
    if (isLost) return "locked";
    if (stepIdx === 0) return hasBooking ? "done" : "active";
    if (stepIdx < currentStep) return "done";
    if (stepIdx === currentStep) return "active";
    return "locked";
  };

  const STEP_TEAMS: Record<number, string> = {
    0: "SMARTIFY",
    1: "SOLAR",
    2: "SOLAR",
    3: "SMARTIFY",
    4: "SOLAR",
  };

  const CardWrapper = ({ stepIdx, title, icon, children }: { stepIdx: number; title: string; icon: string; children: React.ReactNode }) => {
    const state = cardState(stepIdx);
    const stepNum = String(stepIdx + 1).padStart(2, "0");
    const team = STEP_TEAMS[stepIdx];

    const container =
      state === "active"
        ? "bg-active-light border border-active shadow-sm shadow-active/10 ring-1 ring-active/20"
        : state === "done"
        ? "bg-white border border-gray-200"
        : "bg-gray-50 border border-dashed border-gray-200 pointer-events-none";

    const iconBox =
      state === "active"
        ? "bg-active text-white"
        : state === "done"
        ? "bg-emerald-500 text-white"
        : "bg-white text-gray-300 ring-1 ring-inset ring-gray-200";

    return (
      <div data-step-active={state === "active" ? "" : undefined} className={`group relative rounded-2xl overflow-hidden transition-all ${container}`}>
        <div className="flex items-center gap-3 px-5 py-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBox}`}>
            {state === "done" ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
              </svg>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className={`text-xs font-semibold tracking-wider uppercase leading-none ${state === "locked" ? "text-gray-300" : "text-gray-400"}`}>
              Step {stepNum} · {team}
            </div>
            <div className={`text-base font-bold leading-tight tracking-tight mt-1 ${state === "locked" ? "text-gray-400" : "text-gray-900"}`}>
              {title}
            </div>
          </div>

          {state === "active" && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-active shrink-0">
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-active opacity-60 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-active" />
              </span>
              Active
            </span>
          )}
          {state === "done" && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-emerald-600 shrink-0">
              ✓ Done
            </span>
          )}
        </div>

        {state !== "locked" && (
          <div className="px-5 pb-5 pt-3 border-t border-gray-100">{children}</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header — subtle primary tint */}
      <div className="bg-gradient-to-b from-primary via-primary/50 to-white safe-top sticky top-0 z-10">
        {/* Top row: back + name + call */}
        <div className="pl-3 pr-5 pt-3 flex items-center gap-2">
          <Link href="/today" className="p-2 rounded-full text-gray-700 hover:bg-white/40 transition-colors shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <h1 className="flex-1 min-w-0 text-2xl font-bold tracking-tight leading-tight text-gray-900 truncate">{lead.full_name}</h1>
          {/* LINE link button */}
          <button
            type="button"
            onClick={() => {
              if (lead.line_id) return;
              apiFetch("/api/line-users").then((data: typeof pendingLineUsers) => {
                setPendingLineUsers(data.filter(u => !u.lead_id));
                setShowLineModal(true);
              });
            }}
            style={{ minHeight: 0 }}
            className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition-all ${
              lead.line_id
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/40"
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

        {/* Meta */}
        <div className="px-5 pb-3 pt-1 space-y-1">
          <div className="text-xs text-gray-600 leading-tight flex items-center gap-1.5 flex-wrap">
            <span className="font-mono tabular-nums">{lead.phone}</span>
            <span className="text-gray-300">·</span>
            <span>{lead.source === "event" ? "Event" : "Walk-in"}</span>
            {isUpgrade && (<><span className="text-gray-300">·</span><span className="font-semibold text-purple-600">Upgrade</span></>)}
          </div>
          {(lead.project_name || lead.house_number || lead.contact_date) && (
            <div className="text-xs text-gray-600 leading-tight flex items-center gap-1.5 min-w-0">
              <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">
                {[lead.project_name, lead.house_number].filter(Boolean).join(" ")}
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
      <div className="flex-1 overflow-y-auto pb-20">
        {tab === "info" ? (
          <div className="p-4 space-y-3">
            {/* Latest Contact — ข้อมูลการติดต่อล่าสุด */}
            {(() => {
              // DB-first: every contact event lives in lead_activities (including register/walk-in)
              const contactTypes = ["call", "visit", "follow_up", "note", "lead_created"];
              const latest = activities.find(a => contactTypes.includes(a.activity_type));
              const typeMap: Record<string, { label: string; color: string }> = {
                note: { label: "โน้ต", color: "bg-gray-500" },
                call: { label: "โทร", color: "bg-blue-500" },
                visit: { label: "เยี่ยม", color: "bg-purple-500" },
                follow_up: { label: "ติดตาม", color: "bg-amber-500" },
                lead_created: { label: "ลงทะเบียน", color: "bg-primary" },
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
                <button
                  onClick={() => setModalType("note")}
                  className="w-full text-left rounded-2xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
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
                </button>
              );
            })()}

            {/* Step 01: Pre-Survey */}
            <CardWrapper
              stepIdx={0}
              title="Pre-Survey"
              icon="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.333 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
            >
              <PreSurveyStep lead={lead} state={cardState(0)} refresh={refresh} packages={packages} />
            </CardWrapper>

            {/* Step 02: Survey */}
            <CardWrapper
              stepIdx={1}
              title="Survey"
              icon="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
            >
              <SurveyStep lead={lead} state={cardState(1)} refresh={refresh} onAddActivity={t => setModalType(t as ActivityType)} packages={packages} />
            </CardWrapper>

            {/* Step 03: Quotation */}
            <CardWrapper
              stepIdx={2}
              title="Quotation"
              icon="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            >
              <QuotationStep lead={lead} state={cardState(2)} refresh={refresh} packages={packages} />
            </CardWrapper>

            {/* Step 04: Purchased */}
            <CardWrapper
              stepIdx={3}
              title="Purchased"
              icon="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            >
              <PurchasedStep lead={lead} state={cardState(3)} refresh={refresh} />
            </CardWrapper>

            {/* Step 05: Installed */}
            <CardWrapper
              stepIdx={4}
              title="Installed"
              icon="M11.42 15.17l-5.658-5.66a2.122 2.122 0 010-3l1.532-1.532a2.122 2.122 0 013 0L15.953 10.637a2.122 2.122 0 010 3l-1.532 1.532a2.122 2.122 0 01-3 0z"
            >
              <InstalledStep lead={lead} state={cardState(4)} refresh={refresh} />
            </CardWrapper>

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
            {!isLost && lead.status !== "installed" && (
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
            onClick={() => setModalType("note")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-100 text-sm font-semibold active:bg-gray-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
            Note
          </button>
          <button
            onClick={() => setModalType("follow_up")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-sm font-semibold active:bg-amber-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Follow-up
          </button>
        </div>
      )}

      {modalType && (
        <AddActivityModal
          activityType={modalType}
          leadId={lead.id}
          onClose={() => setModalType(null)}
          onSaved={refresh}
        />
      )}
      {showLostModal && <LostModal leadId={lead.id} onClose={() => setShowLostModal(false)} onSaved={refresh} />}

      {/* LINE map modal */}
      {showLineModal && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowLineModal(false)} />
          <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm p-5 pb-8 md:pb-5 animate-slide-up max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">เชื่อม LINE</h3>
              <button onClick={() => setShowLineModal(false)} style={{ minHeight: 0 }} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {confirmLineUser ? (
              <div className="space-y-4">
                <div className="flex flex-col items-center py-4">
                  {confirmLineUser.picture_url ? (
                    <img src={confirmLineUser.picture_url} alt="" className="w-16 h-16 rounded-full object-cover mb-2" style={{ minHeight: 0 }} />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mb-2" style={{ minHeight: 0 }}>
                      <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>
                    </div>
                  )}
                  <div className="text-base font-bold text-gray-900">{confirmLineUser.display_name}</div>
                  <div className="text-xs text-gray-400 mt-1">เชื่อมกับ <span className="font-semibold text-gray-700">{lead.full_name}</span></div>
                  <div className="text-xs text-amber-600 mt-2">⚠ เชื่อมได้ครั้งเดียว ไม่สามารถเปลี่ยนได้</div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmLineUser(null)}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-700"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={linkingLine}
                    onClick={async () => {
                      setLinkingLine(true);
                      try {
                        await apiFetch(`/api/line-users/${confirmLineUser.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ lead_id: lead.id }),
                        });
                        refresh();
                        setShowLineModal(false);
                        setConfirmLineUser(null);
                      } finally {
                        setLinkingLine(false);
                      }
                    }}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold bg-primary text-white disabled:opacity-50"
                  >
                    {linkingLine ? "กำลังเชื่อม..." : "ยืนยัน"}
                  </button>
                </div>
              </div>
            ) : pendingLineUsers.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">ไม่มี LINE user ที่รอเชื่อม</div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={lineSearch}
                  onChange={e => setLineSearch(e.target.value)}
                  placeholder="ค้นหาชื่อ LINE..."
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary mb-2"
                />
                {pendingLineUsers.filter(u => !lineSearch || (u.display_name || "").toLowerCase().includes(lineSearch.toLowerCase())).map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setConfirmLineUser(u)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-active/40 hover:bg-active-light transition-all text-left"
                  >
                    {u.picture_url ? (
                      <img src={u.picture_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" style={{ minHeight: 0 }} />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0" style={{ minHeight: 0 }}>
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{u.display_name || "LINE User"}</div>
                      <div className="text-xs text-gray-400 font-mono truncate">{u.line_user_id.slice(0, 20)}...</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
