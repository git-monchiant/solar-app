import { CalendarIcon, ClockIcon, LineIcon, PhoneIcon } from "@/components/ui/icons";
import { useState, type ReactNode } from "react";
import { STATUS_CONFIG, getStatusLabel, getStatusColor, getMainStatus, getSubstep } from "@/lib/constants/statuses";
import { formatSlotsRange } from "@/lib/time-slots";
import { stripThaiTitle, houseNumberOrNull } from "@/lib/utils/name";
import { formatTHB, formatThaiDateShort } from "@/lib/utils/formatters";
import { useOpenLead } from "@/lib/hooks/useOpenLead";
import AssignOwnerButton from "./AssignOwnerButton";
import SourceTag from "@/components/SourceTag";
import { SLA_STATUS_LABEL, SLA_TIMELINE_STYLE, SlaLeadSummary, formatSlaTimelineDuration } from "@/components/sla/SlaStatusDisplay";
import { slaOwnsFollowUpDate, slaWorkflowStage } from "@/lib/sla-display";

export interface LeadData {
  id: number;
  full_name: string;
  phone: string;
  email?: string | null;
  project_name: string;
  package_name: string;
  package_price: number;
  installation_address: string;
  house_number: string | null;
  customer_type: string;
  customer_grade?: string | null;
  customer_group?: string | null;
  status: string;
  source: string;
  note: string;
  contact_date: string;
  next_follow_up: string | null;
  revisit_date: string | null;
  lost_reason: string | null;
  last_activity_note: string | null;
  last_activity_date: string | null;
  last_activity_title?: string | null;
  last_activity_type?: string | null;
  order_paid_count?: number | null;
  order_ready_count?: number | null;
  order_total_count?: number | null;
  order_payment_progress?: string | null;
  pre_doc_no: string | null;
  pre_total_price: number | null;
  payment_confirmed?: boolean | null;
  /** 1 = at least one slip has been rejected by accounting and not yet re-submitted. */
  has_payment_reject?: 0 | 1 | boolean | null;
  quotation_amount: number | null;
  order_total: number | null;
  install_extra_cost: number | null;
  assigned_user_id: number | null;
  assigned_name: string | null;
  assigned_username?: string | null;
  install_date: string | null;
  install_date_end?: string | null;
  install_actual_date?: string | null;
  install_completed_at: string | null;
  created_at: string;
  survey_date: string | null;
  survey_time_slot: string | null;
  line_id: string | null;
  district: string | null;
  province: string | null;
  zone?: string | null;
  contact_count?: number;
  is_followup_overdue?: boolean;
  sla_policy_code?: string | null;
  sla_task_name?: string | null;
  sla_status?: "active" | "warning" | "critical" | "breached" | null;
  sla_target_at?: string | null;
  sla_due_at?: string | null;
  sla_owner_role?: "sales" | "solar" | null;
  sla_owner_name?: string | null;
  /** Every open SLA the card shows, when the caller renders more than one. */
  sla_items?: { policy_code: string; due_at: string }[];
}

export default function LeadCard({ lead, compact, onAssignChange, onOpen, slaFooter }: { lead: LeadData; compact?: boolean; onAssignChange?: () => void; onOpen?: (lead: LeadData) => void; slaFooter?: ReactNode }) {
  const openLead = useOpenLead();
  const config = STATUS_CONFIG[lead.status] || STATUS_CONFIG.pre_survey;
  const isUpgrade = lead.customer_type === "upgrade" || lead.customer_type?.includes("Upgrade") || lead.customer_type?.includes("เดิม");
  const [now] = useState(() => Date.now());
  const startDate = lead.contact_date || lead.created_at;
  const aging = now && startDate ? Math.floor((now - new Date(startDate).getTime()) / 86400000) : 0;
  // Prefer the server's overdue flag (filters out leads already followed up).
  // Fall back to the local date check for callers that don't supply it.
  const isOverdue = lead.is_followup_overdue !== undefined
    ? lead.is_followup_overdue
    : !!(now && lead.next_follow_up && new Date(String(lead.next_follow_up).slice(0, 10) + "T12:00:00").getTime() < now);
  const hasChequePendingMoney = (lead.order_ready_count ?? 0) > (lead.order_paid_count ?? 0);
  const defaultSlaPanel = slaFooter === undefined && lead.sla_status && lead.sla_due_at ? (
    <SlaLeadSummary
      status={lead.sla_status}
      policyCode={lead.sla_policy_code}
      taskName={lead.sla_task_name}
      dueAt={lead.sla_due_at}
      ownerRole={lead.sla_owner_role}
      ownerName={lead.sla_owner_name}
    />
  ) : null;
  const slaPanel = slaFooter === undefined ? defaultSlaPanel : slaFooter;
  const hasSlaPanel = slaPanel != null;
  const slaStage = slaWorkflowStage(lead.sla_policy_code);
  // Callers that render several SLA panels pass the whole set; everyone else
  // has the single sla_* snapshot on the lead.
  const slaItems = lead.sla_items
    ?? (lead.sla_policy_code && lead.sla_due_at ? [{ policy_code: lead.sla_policy_code, due_at: lead.sla_due_at }] : []);
  const hideSlaManagedFollowUp = slaOwnsFollowUpDate(slaItems, lead.next_follow_up);
  // Always the meta row, panel or not: one fixed place to look for the
  // appointment, and it costs no extra card height. What keeps it from reading
  // as the SLA clock is the wording and the amber — never the red the SLA owns.
  const showFollowUp = !compact && !!lead.next_follow_up && !hideSlaManagedFollowUp;

  const open = () => {
    if (onOpen) { onOpen(lead); return; }
    openLead(lead.id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      className="block rounded-2xl bg-white border border-gray-300 shadow-sm hover:border-gray-400 hover:shadow-md transition-all cursor-pointer"
    >
      <div className="p-5 md:p-3">
        <div className={hasSlaPanel ? "2xl:grid 2xl:grid-cols-[minmax(0,1fr)_26rem] 2xl:items-stretch 2xl:gap-4" : undefined}>
          <div className="min-w-0">
        {/* Header: name + status */}
        <div className="flex items-start gap-3 mb-3 md:mb-1.5">
          <div className="flex-1 min-w-0 md:w-52 md:flex-none lg:w-72">
            <div className="font-bold text-lg md:text-base text-gray-900 truncate leading-tight flex items-center gap-1.5">
              <svg className="w-5 h-5 shrink-0 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="truncate">
                {(() => {
                  const hn = houseNumberOrNull(lead.house_number);
                  const nm = stripThaiTitle(lead.full_name);
                  return hn ? `${hn} - ${nm}` : nm;
                })()}
              </span>
            </div>
            <div className="text-sm text-gray-500 truncate mt-0.5 font-mono tabular-nums flex items-center gap-1.5">
              <PhoneIcon className="w-5 h-5 shrink-0 text-emerald-500" />
              {lead.phone}
              {lead.line_id && (
                <LineIcon className="w-5 h-5 text-emerald-500 shrink-0" />
              )}
            </div>
          </div>
          {(() => {
            // Visual flow stages — virtual stages "booking", "wait_install"
            // and "install" don't map 1:1 onto the lead.status column:
            //   pre_survey       → ติดตาม
            //   pre_survey-01/02 → จอง
            //   survey           → สำรวจ
            //   quote            → เสนอราคา
            //   order (paid=0)   → ชำระเงิน
            //   order (paid≥1, no install_date) → รอนัดติดตั้ง
            //   install_date set → รอติดตั้ง
            //   warranty/gridtie/closed → รับประกัน
            const FLOW_STAGES = ["pre_survey", "booking", "survey", "quote", "order", "wait_install", "install", "warranty"] as const;
            const main = getMainStatus(lead.status);
            const sub = getSubstep(lead.status);
            const paid = (lead.order_ready_count ?? lead.order_paid_count ?? 0) >= 1;
            const hasInstallDate = !!lead.install_date;
            const isDone = ["warranty", "gridtie", "closed"].includes(main);
            const effective = (() => {
              if (isDone) return "warranty";
              if (hasInstallDate) return "install";                                          // schedule locked in
              if (paid && (main === "order" || main === "install")) return "wait_install";   // paid but no date yet
              if (main === "pre_survey" && sub > 0) return "booking";
              return main;
            })();
            const currentIdx = FLOW_STAGES.indexOf(effective as typeof FLOW_STAGES[number]);
            if (currentIdx < 0) return null;
            const FLOW_LABELS: Record<string, string> = {
              pre_survey: "ติดตาม",
              booking: "จอง",
              survey: "สำรวจ",
              quote: "เสนอราคา",
              order: "ชำระเงิน",
              wait_install: "รอนัดติดตั้ง",
              install: "รอติดตั้ง",
              warranty: "รับประกัน",
            };
            return (
              <div className="hidden md:flex items-start mt-1" aria-label="Flow progress">
                {FLOW_STAGES.map((s, i) => {
                  const isCurrent = i === currentIdx;
                  const isPast = i < currentIdx;
                  const stageConfig = STATUS_CONFIG[s] ?? { label: FLOW_LABELS[s], color: "bg-amber-500", text: "text-amber-700" };
                  const hasStageSla = s === slaStage && !!lead.sla_status && !!lead.sla_due_at;
                  const slaTone = hasStageSla ? SLA_TIMELINE_STYLE[lead.sla_status!] : null;
                  const slaDuration = hasStageSla ? formatSlaTimelineDuration(lead.sla_status!, lead.sla_due_at!) : null;
                  return (
                    <div
                      key={s}
                      className="flex items-start"
                      title={hasStageSla ? `${stageConfig?.label} · SLA ${SLA_STATUS_LABEL[lead.sla_status!]} · ${slaDuration}` : stageConfig?.label}
                    >
                      <div className="flex w-9 shrink-0 flex-col items-center lg:w-11 xl:w-12">
                        <div className={`relative w-5 h-5 lg:w-6 lg:h-6 rounded-full flex items-center justify-center transition-all ${
                          isCurrent ? `${config.color} ${hasStageSla ? "shadow-sm scale-110" : "ring-2 ring-offset-1 ring-gray-200 shadow-sm scale-110"}`
                          : isPast ? "bg-emerald-500"
                          : "bg-gray-200"
                        } ${slaTone ? `ring-2 ring-offset-2 ${slaTone.ring}` : ""}`}>
                          {isPast && (
                            <svg className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {isCurrent && (
                            <span className="w-1 h-1 lg:w-1.5 lg:h-1.5 bg-white rounded-full" />
                          )}
                          {slaTone && (
                            <span className={`absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-white shadow-sm ${slaTone.badge}`}>
                              <ClockIcon className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </div>
                        <span className={`text-xxs lg:text-xxs mt-1 lg:mt-1.5 leading-none whitespace-nowrap ${
                          isCurrent ? `font-semibold ${config.text ?? "text-gray-900"}`
                          : isPast ? "text-emerald-700"
                          : "text-gray-400"
                        }`}>
                          {FLOW_LABELS[s]}
                        </span>
                        {slaTone && slaDuration && (
                          <span className={`mt-1 whitespace-nowrap text-[9px] font-bold leading-none ${slaTone.text}`}>
                            {slaDuration}
                          </span>
                        )}
                      </div>
                      {i < FLOW_STAGES.length - 1 && (
                        <div className={`mt-[9px] h-0.5 w-1 lg:mt-[11px] lg:w-1.5 ${isPast ? "bg-emerald-400" : "bg-gray-200"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <span className={`shrink-0 ml-auto text-xs font-semibold uppercase tracking-wide px-2.5 py-0.5 rounded-full text-white ${getStatusColor(lead)}`}>
            {getStatusLabel(lead)}
          </span>
          {!!lead.has_payment_reject && (
            <span
              className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide px-2.5 py-0.5 rounded-full bg-red-500 text-white"
              title="บัญชีไม่อนุมัติสลิปบางรายการ — รอ sales อัพโหลดใหม่"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              สลิปถูกปฏิเสธ
            </span>
          )}
          {hasChequePendingMoney && (
            <span
              className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide px-2.5 py-0.5 rounded-full bg-amber-500 text-white"
              title="รับเช็คแล้ว แต่ยังรอ Accounting ยืนยันว่าเงินเข้าบริษัท"
            >
              รอรับเงินเช็ค
            </span>
          )}
        </div>

        {/* Location — prefer project_name; else fall back to installation_address
            (which may be just a province name for webform-captured leads). */}
        {(lead.project_name || lead.installation_address) && (
          <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-2 md:mb-0.5">
            <svg className="w-5 h-5 shrink-0 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            <span className="truncate">
              {lead.project_name || lead.installation_address}
              {(lead.district || lead.province) && (
                <span className="text-gray-400"> · {[lead.district, lead.province].filter(Boolean).join(", ")}</span>
              )}
            </span>
          </div>
        )}

        {/* Package */}
        {lead.package_name && (
          <div className="flex items-center gap-1.5 text-sm text-gray-700 font-medium">
            <svg className="w-5 h-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
            <span className="truncate">{lead.package_name}</span>
          </div>
        )}

        {/* Latest milestone date: ส่งมอบ → นัดติดตั้ง → นัด survey */}
        {(() => {
          let showDate: string | null = null;
          let label = "";
          let showTime = false;
          if (lead.install_completed_at) {
            showDate = lead.install_actual_date || lead.install_completed_at;
            label = "ส่งมอบ";
          } else if (lead.install_date) {
            showDate = lead.install_date;
            label = "นัดติดตั้ง";
          } else if (lead.survey_date) {
            showDate = lead.survey_date;
            label = "นัด Survey";
            showTime = true;
          }
          if (!showDate) return null;
          return (
            <div className="flex items-center gap-1.5 text-sm text-gray-700 font-medium mt-1">
              <svg className="w-5 h-5 shrink-0 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
              </svg>
              <span className="font-bold text-gray-900">
                {formatThaiDateShort(showDate)}
                {label === "นัดติดตั้ง" && lead.install_date_end && lead.install_date_end !== lead.install_date && (
                  <span> – {formatThaiDateShort(lead.install_date_end)}</span>
                )}
              </span>
              {showTime && lead.survey_time_slot ? (
                <span className="font-mono tabular-nums text-gray-600">
                  · {formatSlotsRange(lead.survey_time_slot) || lead.survey_time_slot}
                </span>
              ) : (
                <span className="text-xs text-gray-500">· {label}</span>
              )}
            </div>
          );
        })()}

        {/* Grade + Customer Group — last content row before the colored
            footer bar. Star icon + framework title for Grade, then a
            separate "column" for customer group with its own icon. */}
        {(lead.customer_grade || lead.customer_group) && (() => {
          const gMap: Record<string, { title: string; color: string }> = {
            A: { title: "พร้อมซื้อทันที",        color: "text-emerald-600" },
            B: { title: "อยู่ระหว่างเปรียบเทียบ", color: "text-sky-600" },
            C: { title: "พิจารณาความคุ้มค่า",     color: "text-amber-600" },
            D: { title: "สนใจแต่ยังไม่พร้อม",      color: "text-orange-600" },
            E: { title: "หาข้อมูลทั่วไป",          color: "text-gray-600" },
            F: { title: "ไม่สนใจ",                  color: "text-red-600" },
          };
          const groupMap: Record<string, string> = {
            general: "ลูกค้าทั่วไป",
            sena:    "ลูกค้าเสนา",
            sme:     "SME (อาคารพาณิชย์/สำนักงาน/ร้านอาหาร)",
          };
          const g = lead.customer_grade ? gMap[lead.customer_grade] : null;
          const groupLabel = lead.customer_group ? (groupMap[lead.customer_group] || lead.customer_group) : null;
          return (
            <div className="mt-1 flex items-center gap-1.5 text-sm truncate">
              {g && (
                <span className={`flex items-center gap-1.5 ${g.color} min-w-0`}>
                  <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l2.6 7.6L22 10l-6 4.4 2.4 7.6L12 17.8 5.6 22 8 14.4 2 10l7.4-.4L12 2z" />
                  </svg>
                  <span className="font-semibold shrink-0">Grade : {lead.customer_grade}</span>
                  <span className="text-gray-500 truncate">
                    — {g.title}
                    {groupLabel && <span className="text-gray-400"> / {groupLabel}</span>}
                  </span>
                </span>
              )}
              {!g && groupLabel && (
                <span className="text-gray-500 truncate">{groupLabel}</span>
              )}
            </div>
          );
        })()}

        {/* Footer — mobile: 2 rows (badges+zone, meta); md+: 1 row */}
          </div>

          {hasSlaPanel && (
            <div className="mt-3 min-w-0 2xl:mt-0 2xl:h-full">
              {slaPanel}
            </div>
          )}
        </div>

        {(() => {
          const amount = (() => {
            if (compact || !lead.pre_doc_no) return null;
            const later = ["order", "install", "warranty", "gridtie", "closed"].includes(lead.status);
            const base = later
              ? (lead.order_total || lead.quotation_amount || lead.pre_total_price || 0)
              : lead.status === "quote"
              ? (lead.quotation_amount || lead.pre_total_price || 0)
              : (lead.pre_total_price || 0);
            return later ? base + (lead.install_extra_cost || 0) : base;
          })();
          return (
            <div className={`mt-4 -mx-5 -mb-5 md:-mx-3 md:-mb-3 px-5 py-3 md:px-3 md:py-2 ${config.bg} rounded-b-2xl flex items-center gap-2 flex-wrap text-xs text-gray-400`}>
              <AssignOwnerButton
                leadId={lead.id}
                assignedUserId={lead.assigned_user_id}
                assignedName={lead.assigned_name}
                onChanged={onAssignChange}
              />
              {(lead.assigned_username || lead.assigned_name) && (
                <span className="font-semibold text-gray-700 uppercase tracking-wider">
                  <span className="md:hidden">{lead.assigned_username || lead.assigned_name}</span>
                  <span className="hidden md:inline">{lead.assigned_name || lead.assigned_username}</span>
                </span>
              )}
              {isUpgrade && (
                <span className="font-semibold text-purple-600 uppercase tracking-wider">Upgrade</span>
              )}
              {lead.source && <SourceTag value={lead.source} size="xs" />}
              {aging > 0 && <span>{aging} วันแล้ว</span>}
              {/* Less critical meta — desktop only to keep mobile compact */}
              {lead.created_at && (
                <span className="hidden md:inline">· สร้าง {formatThaiDateShort(lead.created_at)}</span>
              )}
              {lead.last_activity_date && (
                <span className="hidden md:inline">
                  · ติดตามล่าสุด {formatThaiDateShort(lead.last_activity_date)}
                  {(() => {
                    const t = lead.last_activity_title || "";
                    const isOk = t.startsWith("ติดต่อได้");
                    const isFail = t.startsWith("ติดต่อไม่ได้");
                    const isOther = t === "อื่นๆ";
                    const hasStructured = isOk || isFail || isOther;
                    const tone = isOk ? "text-green-700" : isFail ? "text-red-700" : "text-gray-600";
                    const type = lead.last_activity_type || "follow_up";
                    const iconCls = `w-3 h-3 ${tone}`;
                    const icon = !hasStructured ? null :
                      type === "call" ? (
                        <PhoneIcon className={iconCls} />
                      ) : type === "visit" ? (
                        <svg className={iconCls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                      ) : type === "line" ? (
                        <LineIcon className={iconCls} />
                      ) : type === "loan_followup" ? (
                        <svg className={iconCls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
                      ) : (
                        <span className={`w-1.5 h-1.5 rounded-full ${isOk ? "bg-green-500" : isFail ? "bg-red-500" : "bg-gray-400"}`} />
                      );
                    const note = lead.last_activity_note?.trim();
                    if (!hasStructured && !note) return null;
                    return (
                      <span className="ml-1.5 inline-flex items-center gap-1">
                        {icon}
                        {hasStructured && <span className={`font-medium ${tone}`}>{t}</span>}
                        {note && <span className="text-gray-500 font-normal italic">{hasStructured ? "— " : ""}{note}</span>}
                      </span>
                    );
                  })()}
                </span>
              )}
              {(lead.contact_count ?? 0) > 0 && (
                <span className="font-semibold text-gray-600">· ติดตาม {lead.contact_count} ครั้ง</span>
              )}
              {amount != null && (
                <span className="font-semibold text-emerald-700 font-mono tabular-nums">
                  · {formatTHB(amount)} ฿
                </span>
              )}
              {lead.zone && (
                <span className="truncate shrink-0">{lead.zone}</span>
              )}
              {showFollowUp && (
                <span className={`ml-auto inline-flex items-center gap-1 font-semibold ${isOverdue ? "text-amber-700" : "text-gray-500"}`}>
                  <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                  นัดลูกค้า {formatThaiDateShort(lead.next_follow_up!)}{isOverdue ? " · เลยนัดแล้ว" : ""}
                </span>
              )}
            </div>
          );
          })()}
        </div>
    </div>
  );
}
