export type SlaState = "active" | "warning" | "critical" | "breached" | "completed" | "superseded" | "cancelled";
export type ContactResult = "connected" | "unreachable" | "invalid_contact" | "other";

export const OPERATIONAL_SLA_MINUTES = {
  ASSIGN_OWNER: { target: 15, due: 60, warning: 30 },
  // Qualification is 24 hours from the first contact that connected,
  // identical for every lead source (policy version 3, migration 158).
  ELECTRICITY_ASSESSMENT: { target: 1440, due: 1440, warning: 240 },
  BOOK_SURVEY: { target: 1440, due: 1440, warning: 240 },
  SITE_SURVEY: { target: 7 * 24 * 60, due: 7 * 24 * 60, warning: 2 * 24 * 60 },
  // Two days from a completed survey, with the 12-hour warning the 48-hour
  // policy already used in migration 150 (policy version 4, migration 160).
  PROPOSAL_ROI: { target: 2 * 24 * 60, due: 2 * 24 * 60, warning: 12 * 60 },
  DEPOSIT_CLOSE: { target: 3 * 24 * 60, due: 3 * 24 * 60, warning: 24 * 60 },
  PAYMENT_INSTALLMENT_1: { target: 7 * 24 * 60, due: 7 * 24 * 60, warning: 2 * 24 * 60 },
  LOAN_PREAPPROVAL: { target: 15 * 24 * 60, due: 15 * 24 * 60, warning: 3 * 24 * 60 },
  // Three days from a confirmed deposit, with the one-day warning the 3-day
  // policy already used in migration 150 (policy version 3, migration 161).
  SCHEDULE_INSTALLATION: { target: 3 * 24 * 60, due: 3 * 24 * 60, warning: 24 * 60 },
  INSTALLATION: { target: 15 * 24 * 60, due: 15 * 24 * 60, warning: 3 * 24 * 60 },
  AFTER_SALES: { target: 4320, due: 4320, warning: 1440 },
  CLOSE_LEAD: { target: 7 * 24 * 60, due: 7 * 24 * 60, warning: 2 * 24 * 60 },
} as const;

export type SalesGrade = "A" | "B" | "C" | "D" | "E" | "F";

export type GradePlaybookStep = {
  code: string;
  taskName: string;
  dueMinutes: number;
  warningMinutes: number;
  repeatFrom?: number;
};

/**
 * Every grade runs the same follow-up cadence that used to belong to Grade A:
 * one open task at a time, due 24 hours after the last connected contact, and
 * repeating for as long as the lead stays open. Grade still drives priority and
 * what the sales person says, but no longer changes the SLA clock.
 */
export const UNIFIED_PLAYBOOK: readonly GradePlaybookStep[] = [
  { code: "daily_follow_up", taskName: "โทรติดตามลูกค้า", dueMinutes: 24 * 60, warningMinutes: 4 * 60, repeatFrom: 0 },
];

export const GRADE_PLAYBOOKS: Record<SalesGrade, readonly GradePlaybookStep[]> = {
  A: UNIFIED_PLAYBOOK,
  B: UNIFIED_PLAYBOOK,
  C: UNIFIED_PLAYBOOK,
  D: UNIFIED_PLAYBOOK,
  E: UNIFIED_PLAYBOOK,
  F: UNIFIED_PLAYBOOK,
};

export function isSalesGrade(value: unknown): value is SalesGrade {
  return typeof value === "string" && ["A", "B", "C", "D", "E", "F"].includes(value);
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

type BangkokParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function bangkokParts(value: Date): BangkokParts {
  const shifted = new Date(value.getTime() + BANGKOK_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

export function fromBangkokParts(parts: BangkokParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - BANGKOK_OFFSET_MS);
}

export function addBangkokCalendarDays(value: Date, days: number): Date {
  const p = bangkokParts(value);
  return new Date(Date.UTC(p.year, p.month - 1, p.day + days, p.hour, p.minute, p.second) - BANGKOK_OFFSET_MS);
}

/**
 * Keep the document-ready milestone separate from the real survey booking.
 * A pre-survey document can open BOOK_SURVEY, but only an appointment can
 * complete it and open SITE_SURVEY. surveyDoneAt is a legacy fallback for
 * leads that reached the next stage before appointment activities were logged.
 */
export function resolveSurveySlaMilestones(input: {
  assessmentAt: Date | null;
  preBookedAt: Date | null;
  appointmentSetAt: Date | null;
  surveyDoneAt: Date | null;
}) {
  return {
    assessmentAt: input.assessmentAt || input.preBookedAt || input.appointmentSetAt || input.surveyDoneAt,
    bookedAt: input.appointmentSetAt || input.surveyDoneAt,
  };
}

function surveyDateParts(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
    };
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function earliestSurveyTime(value: string | null | undefined) {
  if (!value) return null;
  let candidates: unknown[] = [];
  try {
    const parsed = JSON.parse(value);
    candidates = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    candidates = [value];
  }
  return candidates
    .map(candidate => String(candidate).match(/^(?:[01]\d|2[0-3]):[0-5]\d$/)?.[0] || null)
    .filter((candidate): candidate is string => Boolean(candidate))
    .sort()[0] || null;
}

/**
 * SITE_SURVEY begins at the appointment itself, not when the appointment was
 * entered. Survey dates are SQL `date` values (pool useUTC=false); build the
 * resulting instant explicitly in Asia/Bangkok so tests and servers agree.
 */
export function resolveScheduledSurveyAnchor(input: {
  surveyDate: Date | string | null;
  surveyTimeSlot: string | null;
  appointmentSetAt: Date | null;
  completedAt?: Date | null;
}): {
  at: Date | null;
  source: "scheduled_date_time" | "appointment_recorded_at_fallback" | "completion_at_legacy_fallback" | "appointment_recorded_at_inconsistent_schedule" | "completion_at_inconsistent_schedule" | null;
} {
  const date = surveyDateParts(input.surveyDate);
  if (!date) {
    return {
      at: input.appointmentSetAt || input.completedAt || null,
      source: input.appointmentSetAt
        ? "appointment_recorded_at_fallback"
        : input.completedAt ? "completion_at_legacy_fallback" : null,
    };
  }
  const earliest = earliestSurveyTime(input.surveyTimeSlot);
  const [hour, minute] = (earliest || "00:00").split(":").map(Number);
  const scheduledAt = fromBangkokParts({ ...date, hour, minute, second: 0 });
  if (input.completedAt && scheduledAt > input.completedAt) {
    if (input.appointmentSetAt && input.appointmentSetAt <= input.completedAt) {
      return { at: input.appointmentSetAt, source: "appointment_recorded_at_inconsistent_schedule" };
    }
    return { at: input.completedAt, source: "completion_at_inconsistent_schedule" };
  }
  return { at: scheduledAt, source: "scheduled_date_time" };
}

/**
 * FIRST_CONTACT measures the first recorded contact attempt. For legacy leads
 * with no structured contact activity, a survey appointment is durable proof
 * that contact had already happened and is used as a fallback only.
 */
export function resolveFirstContactEvidence(input: {
  explicitAttemptAt: Date | null;
  appointmentSetAt: Date | null;
}):
  | { completedAt: Date; source: "contact_activity" | "survey_appointment" }
  | { completedAt: null; source: null } {
  if (input.explicitAttemptAt) {
    return { completedAt: input.explicitAttemptAt, source: "contact_activity" as const };
  }
  if (input.appointmentSetAt) {
    return { completedAt: input.appointmentSetAt, source: "survey_appointment" as const };
  }
  return { completedAt: null, source: null };
}

/**
 * Warning lead time before the First Contact deadline. The shortest possible
 * window is just over three hours (a lead received at 08:59 is due at 12:00),
 * so two hours always leaves an active period before the warning starts.
 */
export const FIRST_CONTACT_WARNING_MINUTES = 120;

/**
 * Hard deadline confirmed by the business, identical for every lead source.
 * Received 09:00-18:59 -> 23:59:59 the same day.
 * Received 19:00-23:59 -> 12:00 the next day.
 * Received 00:00-08:59 -> 12:00 the same day.
 * Boundary: 09:00 inclusive, 19:00 exclusive, all in Asia/Bangkok.
 */
export function firstContactHardDeadline(receivedAt: Date): Date {
  const p = bangkokParts(receivedAt);
  if (p.hour >= 9 && p.hour < 19) {
    return fromBangkokParts({ ...p, hour: 23, minute: 59, second: 59 });
  }
  if (p.hour >= 19) {
    return fromBangkokParts({ ...p, day: p.day + 1, hour: 12, minute: 0, second: 0 });
  }
  return fromBangkokParts({ ...p, hour: 12, minute: 0, second: 0 });
}

export function firstContactWarningAt(receivedAt: Date): Date {
  return new Date(firstContactHardDeadline(receivedAt).getTime() - FIRST_CONTACT_WARNING_MINUTES * 60_000);
}

export function retryDeadlines(firstFailedAttemptAt: Date): Date[] {
  return [3, 5, 7, 30].map(days => addBangkokCalendarDays(firstFailedAttemptAt, days));
}

export function evaluateSlaState(now: Date, warningAt: Date | null, dueAt: Date): SlaState {
  if (now > dueAt) return "breached";
  const remaining = dueAt.getTime() - now.getTime();
  if (remaining <= 30 * 60_000) return "critical";
  if (warningAt && now >= warningAt) return "warning";
  return "active";
}

export function contactResultFromOutcome(outcome: string | null | undefined): ContactResult {
  const value = String(outcome || "");
  if (value.startsWith("ติดต่อได้")) return "connected";
  if (value.includes("ข้อมูลติดต่อไม่ถูกต้อง")) return "invalid_contact";
  if (value.startsWith("ติดต่อไม่ได้")) return "unreachable";
  return "other";
}
