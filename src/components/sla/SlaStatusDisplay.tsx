import { ClockIcon, UserIcon } from "@/components/ui/icons";
import { formatThaiDateShort, formatThaiTime } from "@/lib/utils/formatters";
import { slaTaskLabel } from "@/lib/sla-display";
import type { ReactNode } from "react";

export type SlaStatus = "active" | "warning" | "critical" | "breached";
export type SlaOwnerRole = "sales" | "solar";

export const SLA_STATUS_LABEL: Record<SlaStatus, string> = {
  active: "กำลังดำเนินการ",
  warning: "ใกล้กำหนด",
  critical: "เร่งด่วน",
  breached: "เกินกำหนด",
};

export const SLA_STATUS_STYLE: Record<SlaStatus, { row: string; chip: string; dot: string }> = {
  active: { row: "border-sky-200 bg-sky-50/70", chip: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  warning: { row: "border-amber-200 bg-amber-50/70", chip: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  critical: { row: "border-orange-200 bg-orange-50/70", chip: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  breached: { row: "border-red-200 bg-red-50/80", chip: "bg-red-100 text-red-700", dot: "bg-red-500" },
};

export const SLA_TIMELINE_STYLE: Record<SlaStatus, { ring: string; badge: string; text: string }> = {
  active: { ring: "ring-sky-400", badge: "bg-sky-500", text: "text-sky-700" },
  warning: { ring: "ring-amber-400", badge: "bg-amber-500", text: "text-amber-700" },
  critical: { ring: "ring-orange-400", badge: "bg-orange-500", text: "text-orange-700" },
  breached: { ring: "ring-red-400", badge: "bg-red-500", text: "text-red-700" },
};

export function formatSlaOverdueDuration(dueAt: string): string {
  const milliseconds = Date.now() - Date.parse(dueAt);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "เพิ่งเกินกำหนด";
  const totalHours = Math.floor(milliseconds / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days.toLocaleString("th-TH")} วัน${hours > 0 ? ` ${hours.toLocaleString("th-TH")} ชม.` : ""}`;
  if (totalHours > 0) return `${totalHours.toLocaleString("th-TH")} ชม.`;
  return `${Math.max(1, Math.floor(milliseconds / 60_000)).toLocaleString("th-TH")} นาที`;
}

export function formatSlaTimelineDuration(status: SlaStatus, dueAt: string): string {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return "มี SLA";
  const difference = status === "breached" ? Date.now() - due : due - Date.now();
  if (difference <= 0) return status === "breached" ? "เกินกำหนด" : "ถึงกำหนด";
  const totalHours = Math.floor(difference / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const prefix = status === "breached" ? "เกิน" : "เหลือ";
  if (days > 0) return `${prefix} ${days.toLocaleString("th-TH")} วัน`;
  if (totalHours > 0) return `${prefix} ${totalHours.toLocaleString("th-TH")} ชม.`;
  const minutes = Math.max(1, Math.floor(difference / 60_000));
  return `${prefix} ${minutes.toLocaleString("th-TH")} นาที`;
}

export function SlaStatusChip({ status }: { status: SlaStatus }) {
  const style = SLA_STATUS_STYLE[status];
  return (
    <>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xxs font-bold ${style.chip}`}>
        SLA {SLA_STATUS_LABEL[status]}
      </span>
    </>
  );
}

export function SlaTeamChip({ ownerRole }: { ownerRole: SlaOwnerRole }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xxs font-bold ${
      ownerRole === "sales"
        ? "bg-violet-100 text-violet-700"
        : "bg-emerald-100 text-emerald-700"
    }`}>
      ทีม {ownerRole === "sales" ? "Sales" : "Solar"}
    </span>
  );
}

export function SlaDeadline({ status, dueAt }: { status: SlaStatus; dueAt: string }) {
  if (status === "breached") {
    // The chip above already says "เกินกำหนด", so this line only carries the
    // numbers. "ครบกำหนด" not "กำหนดเดิม" — nothing rescheduled the deadline.
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1 font-bold text-red-700">
        <ClockIcon className="h-3.5 w-3.5 shrink-0" />
        เกิน {formatSlaOverdueDuration(dueAt)}
        <span className="font-normal text-red-500">· ครบกำหนด {formatThaiDateShort(dueAt)} {formatThaiTime(dueAt)}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 font-medium text-gray-600">
      <ClockIcon className="h-3.5 w-3.5 shrink-0" />
      กำหนด {formatThaiDateShort(dueAt)} {formatThaiTime(dueAt)}
    </span>
  );
}

export function SlaPanel({
  status,
  policyCode,
  taskName,
  dueAt,
  ownerRole,
  ownerContent,
}: {
  status: SlaStatus;
  policyCode?: string | null;
  taskName?: string | null;
  dueAt: string;
  ownerRole?: SlaOwnerRole | null;
  ownerContent: ReactNode;
}) {
  const style = SLA_STATUS_STYLE[status];
  return (
    <div className={`flex h-full flex-col justify-center rounded-xl border px-4 py-3 text-xs ${style.row}`}>
      <div className="flex flex-wrap items-center gap-2">
        <SlaStatusChip status={status} />
        {ownerRole && <SlaTeamChip ownerRole={ownerRole} />}
      </div>

      <div className="mt-2 leading-5">
        <span className="font-semibold text-gray-500">ขั้นตอน:</span>{" "}
        <span className="font-bold text-gray-900">{slaTaskLabel(policyCode, taskName)}</span>
      </div>

      <div className="mt-2 space-y-1.5 border-t border-current/10 pt-2">
        <div className="min-w-0">
          <SlaDeadline status={status} dueAt={dueAt} />
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-gray-500">
          <UserIcon className="h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1 truncate">{ownerContent}</div>
        </div>
      </div>
    </div>
  );
}

export function SlaLeadSummary({
  status,
  policyCode,
  taskName,
  dueAt,
  ownerRole,
  ownerName,
}: {
  status: SlaStatus;
  policyCode?: string | null;
  taskName?: string | null;
  dueAt: string;
  ownerRole?: SlaOwnerRole | null;
  ownerName?: string | null;
}) {
  return (
    <SlaPanel
      status={status}
      policyCode={policyCode}
      taskName={taskName}
      dueAt={dueAt}
      ownerRole={ownerRole}
      ownerContent={ownerName || (ownerRole === "solar" ? "ยังไม่มอบหมายทีม Solar" : "ยังไม่มอบหมาย Owner")}
    />
  );
}
