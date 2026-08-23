export type SlaState = "active" | "warning" | "critical" | "breached" | "completed" | "superseded" | "cancelled";
export type ContactResult = "connected" | "unreachable" | "invalid_contact" | "other";

export const OPERATIONAL_SLA_MINUTES = {
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
  // Closing the case measures the handoff from finished installation to the
  // issued warranty. The certificate timestamp is also the Close Lead result.
  // The business window is three calendar days, warned one day ahead.
  CLOSE_LEAD: { target: 3 * 24 * 60, due: 3 * 24 * 60, warning: 24 * 60 },
} as const;

export const CONTACT_RETRY_DAYS = [3, 5, 7, 30] as const;

/**
 * Grade no longer owns an SLA clock. The follow-up playbook it used to drive
 * was retired once the business settled the rule "a lead we have reached needs
 * no chasing": FIRST_CONTACT measures reaching the lead and CONTACT_RETRY
 * chases the ones we could not reach, which leaves the playbook no state of
 * its own. Grade still sets priority and what the sales person says.
 */

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

/**
 * BOOK_SURVEY measures the team's response after the Pre-Survey payment gate.
 * Runtime stores that durable trigger in survey_ready_at for compatibility;
 * normal payment is confirmed by Account and free payment by Sales pressing
 * Next. An appointment remains fallback evidence for legacy/direct booking.
 */
export function resolveBookSurveyMilestones(input: {
  surveyReadyAt: Date | null;
  appointmentSetAt: Date | null;
  surveyDoneAt: Date | null;
}) {
  const completedAt = input.appointmentSetAt || input.surveyDoneAt;
  return {
    anchorAt: input.surveyReadyAt || completedAt,
    completedAt,
    anchorSource: input.surveyReadyAt ? "payment_confirmed" as const : completedAt ? "appointment_fallback" as const : null,
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
 * SITE_SURVEY begins only after the appointment has been confirmed. A timely
 * confirmation keeps the booked slot as the anchor; a late confirmation moves
 * the anchor forward because the Survey workflow is locked until that click.
 * Survey dates are SQL `date` values (pool useUTC=false); build the resulting
 * instant explicitly in Asia/Bangkok so tests and servers agree.
 */
export function resolveScheduledSurveyAnchor(input: {
  surveyDate: Date | string | null;
  surveyTimeSlot: string | null;
  appointmentSetAt: Date | null;
  appointmentConfirmedAt?: Date | null;
  completedAt?: Date | null;
}): {
  at: Date | null;
  source: "scheduled_date_time" | "confirmation_after_scheduled_time"
    | "appointment_confirmation_fallback" | "completion_at_legacy_fallback"
    | "appointment_confirmation_inconsistent_schedule"
    | "appointment_recorded_at_inconsistent_schedule"
    | "completion_at_inconsistent_schedule" | null;
} {
  const date = surveyDateParts(input.surveyDate);
  if (!date) {
    if (input.appointmentConfirmedAt) {
      return { at: input.appointmentConfirmedAt, source: "appointment_confirmation_fallback" };
    }
    return {
      // A completed legacy survey is durable evidence that the confirmation
      // happened even when its activity predates the audit trail. An open,
      // unconfirmed appointment must not start the field-work clock.
      at: input.completedAt ? input.appointmentSetAt || input.completedAt : null,
      source: input.completedAt ? "completion_at_legacy_fallback" : null,
    };
  }
  const earliest = earliestSurveyTime(input.surveyTimeSlot);
  const [hour, minute] = (earliest || "00:00").split(":").map(Number);
  const scheduledAt = fromBangkokParts({ ...date, hour, minute, second: 0 });
  if (input.completedAt && scheduledAt > input.completedAt) {
    if (input.appointmentConfirmedAt && input.appointmentConfirmedAt <= input.completedAt) {
      return { at: input.appointmentConfirmedAt, source: "appointment_confirmation_inconsistent_schedule" };
    }
    if (input.appointmentSetAt && input.appointmentSetAt <= input.completedAt) {
      return { at: input.appointmentSetAt, source: "appointment_recorded_at_inconsistent_schedule" };
    }
    return { at: input.completedAt, source: "completion_at_inconsistent_schedule" };
  }
  if (input.appointmentConfirmedAt) {
    return input.appointmentConfirmedAt > scheduledAt
      ? { at: input.appointmentConfirmedAt, source: "confirmation_after_scheduled_time" }
      : { at: scheduledAt, source: "scheduled_date_time" };
  }
  if (!input.completedAt) return { at: null, source: null };
  return { at: scheduledAt, source: "scheduled_date_time" };
}

/**
 * INSTALLATION measures the crew's work, so its clock opens at the booked
 * installation slot exactly as SITE_SURVEY opens at the booked survey. A
 * customer who postpones the visit must not burn the crew's time. Leads that
 * never booked a date fall back to the deposit, where the clock used to start
 * for everyone.
 */
export function resolveScheduledInstallAnchor(input: {
  installDate: Date | string | null;
  installTimeSlot: string | null;
  depositAt: Date | null;
  completedAt?: Date | null;
}): {
  at: Date | null;
  source: "scheduled_date_time" | "deposit_fallback" | "completion_at_legacy_fallback"
    | "deposit_inconsistent_schedule" | "completion_at_inconsistent_schedule" | null;
} {
  const date = surveyDateParts(input.installDate);
  if (!date) {
    return {
      at: input.depositAt || input.completedAt || null,
      source: input.depositAt
        ? "deposit_fallback"
        : input.completedAt ? "completion_at_legacy_fallback" : null,
    };
  }
  const earliest = earliestSurveyTime(input.installTimeSlot);
  const [hour, minute] = (earliest || "00:00").split(":").map(Number);
  const scheduledAt = fromBangkokParts({ ...date, hour, minute, second: 0 });
  // A job finished before its own booked slot means the schedule was edited
  // after the fact. Fall back rather than report negative elapsed time.
  if (input.completedAt && scheduledAt > input.completedAt) {
    if (input.depositAt && input.depositAt <= input.completedAt) {
      return { at: input.depositAt, source: "deposit_inconsistent_schedule" };
    }
    return { at: input.completedAt, source: "completion_at_inconsistent_schedule" };
  }
  return { at: scheduledAt, source: "scheduled_date_time" };
}

/**
 * install_actual_date is the day the crew records as the real finish and is the
 * display source of truth; install_completed_at only stamps when the button was
 * pressed, routinely a day or more later. Prefer the real date, keeping the
 * recorded time when both land on the same day. Otherwise close the clock at the
 * end of that day: the date is all that is known, and ending it at 00:00 would
 * report the job as finished before the crew arrived.
 */
export function resolveInstallCompletion(input: {
  actualDate: Date | string | null;
  completedAt: Date | null;
}): Date | null {
  const date = surveyDateParts(input.actualDate);
  if (!date) return input.completedAt;
  if (input.completedAt) {
    const stamped = bangkokParts(input.completedAt);
    if (stamped.year === date.year && stamped.month === date.month && stamped.day === date.day) {
      return input.completedAt;
    }
  }
  return fromBangkokParts({ ...date, hour: 23, minute: 59, second: 59 });
}

/**
 * CLOSE_LEAD measures installation completion -> warranty issuance. A warranty
 * timestamp before installation is inconsistent and must not create a negative
 * elapsed result, so it remains an open SLA until the evidence is corrected.
 */
export function resolveCloseLeadMilestones(input: {
  installCompletedAt: Date | null;
  warrantyIssuedAt: Date | null;
}): { anchorAt: Date | null; completedAt: Date | null } {
  if (!input.installCompletedAt) return { anchorAt: null, completedAt: null };
  const completedAt = input.warrantyIssuedAt && input.warrantyIssuedAt >= input.installCompletedAt
    ? input.warrantyIssuedAt
    : null;
  return { anchorAt: input.installCompletedAt, completedAt };
}

/**
 * Completed SLA rows are normally immutable audit history. Some workflow
 * milestones, however, can legitimately occur again after a step rollback.
 * Those definitions may refresh their evidence when the latest durable
 * activity differs from the activity that originally completed the SLA.
 */
export function completionEvidenceChanged(input: {
  existingCompletedAt: Date | null;
  existingActivityId: number | string | null;
  nextCompletedAt: Date | null;
  nextActivityId: number | string | null;
}): boolean {
  if (!input.existingCompletedAt || !input.nextCompletedAt) return false;
  return input.existingCompletedAt.getTime() !== input.nextCompletedAt.getTime()
    || String(input.existingActivityId ?? "") !== String(input.nextActivityId ?? "");
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

/**
 * CONTACT_RETRY is sequential: each rung starts when the preceding contact
 * attempt is recorded, then owns its full Day 3/5/7/30 window.
 */
export function contactRetryDeadline(startedAt: Date, sequence: number): Date | null {
  const days = CONTACT_RETRY_DAYS[sequence - 1];
  return days ? addBangkokCalendarDays(startedAt, days) : null;
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
