export type SlaState = "active" | "warning" | "critical" | "breached" | "completed" | "superseded" | "cancelled";
export type ContactResult = "connected" | "unreachable" | "invalid_contact" | "other";

export const OPERATIONAL_SLA_MINUTES = {
  ASSIGN_OWNER: { target: 15, due: 60, warning: 30 },
  ELECTRICITY_ASSESSMENT: { target: 1440, due: 1440, warning: 240 },
  BOOK_SURVEY: { target: 1440, due: 1440, warning: 240 },
  SITE_SURVEY: { target: 4320, due: 4320, warning: 1440 },
  PROPOSAL_ROI: { target: 2880, due: 2880, warning: 720 },
  DEPOSIT_CLOSE: { target: 10080, due: 10080, warning: 2880 },
  SCHEDULE_INSTALLATION: { target: 4320, due: 4320, warning: 1440 },
  INSTALLATION: { target: 10080, due: 20160, warning: 2880 },
  AFTER_SALES: { target: 4320, due: 4320, warning: 1440 },
} as const;

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

/** Hard deadline confirmed by the business. Boundary: 09:00 inclusive, 19:00 exclusive. */
export function firstContactHardDeadline(receivedAt: Date): Date {
  const p = bangkokParts(receivedAt);
  if (p.hour >= 9 && p.hour < 19) {
    return fromBangkokParts({ ...p, hour: 23, minute: 59, second: 59 });
  }
  if (p.hour >= 19) {
    const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1, 12, 0, 0) - BANGKOK_OFFSET_MS);
    return next;
  }
  return fromBangkokParts({ ...p, hour: 12, minute: 0, second: 0 });
}

export function firstContactTarget(receivedAt: Date, source?: string | null): Date {
  const normalized = String(source || "").toLowerCase();
  const longTarget = normalized.includes("event") || normalized.includes("booth") || normalized.includes("referral");
  const target = new Date(receivedAt.getTime() + (longTarget ? 24 * 60 : 15) * 60_000);
  const hard = firstContactHardDeadline(receivedAt);
  return target > hard ? hard : target;
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

export function gradeATaskForStage(status: string | null | undefined): string {
  if (status === "survey") return "ยืนยัน/ดำเนินการสำรวจสำหรับ Grade A";
  if (status === "quote") return "จัดทำและติดตาม Proposal สำหรับ Grade A";
  if (status === "order") return "ติดตามมัดจำและปิดการขายสำหรับ Grade A";
  if (status === "install") return "ประสานการติดตั้งสำหรับ Grade A";
  return "ประเมินความต้องการและนัดหมายขั้นตอนถัดไปสำหรับ Grade A";
}
