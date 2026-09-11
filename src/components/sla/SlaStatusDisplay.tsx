import { ClockIcon, UserIcon } from "@/components/ui/icons";
import { formatThaiDate, formatThaiTime } from "@/lib/utils/formatters";
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

function durationLabel(milliseconds: number, longUnits = false): string {
  const totalHours = Math.floor(milliseconds / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const hourUnit = longUnits ? "ชั่วโมง" : "ชม.";
  if (days > 0) return `${days.toLocaleString("th-TH")} วัน${hours > 0 ? ` ${hours.toLocaleString("th-TH")} ${hourUnit}` : ""}`;
  if (totalHours > 0) return `${totalHours.toLocaleString("th-TH")} ${hourUnit}`;
  return `${Math.max(1, Math.floor(milliseconds / 60_000)).toLocaleString("th-TH")} นาที`;
}

function dateTimeText(value: string): string {
  return `${formatThaiDate(value)} ${formatThaiTime(value)}`;
}

/** กรอบเวลาที่นโยบายให้ = ตั้งแต่นาฬิกาเริ่มเดินจนถึงกำหนด
    (ทุกนโยบายที่ยังเดินอยู่ตั้ง target_at เท่ากับ due_at การ์ดจึงอ่านจาก due_at ได้ตรง) */
function slaAllowanceText(startedAt: string, dueAt: string): string {
  const milliseconds = Date.parse(dueAt) - Date.parse(startedAt);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "";
  return durationLabel(milliseconds, true);
}

/** บรรทัดปิดท้ายการ์ด — เกินกำหนดมาแล้วเท่าไร หรือยังเหลือเวลาอีกเท่าไร
    ใช้หน่วยเต็มคำ ("2 วัน 2 ชั่วโมง") เพราะเป็นตัวเลขที่คนอ่านเอาไปพูดต่อ */
function slaCountdown(status: SlaStatus, dueAt: string): { label: string; value: string } | null {
  const difference = Date.parse(dueAt) - Date.now();
  if (!Number.isFinite(difference)) return null;
  if (status === "breached" || difference <= 0) {
    return { label: "เกินกำหนด", value: durationLabel(Math.max(60_000, -difference), true) };
  }
  return { label: "เหลืออีก", value: durationLabel(difference, true) };
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

/** โทนของขั้นตอนที่เกินกำหนด "ไปแล้ว" — งานปิดไปแล้วจึงไม่ใช้แดงเต็มของ breached
    ที่สงวนไว้ให้ปัญหาที่ยังค้างอยู่ แต่ยังอยู่ในโทนแดงเพื่ออ่านออกว่าเป็นความช้า */
export const SLA_LATE_TIMELINE_STYLE = { ring: "ring-rose-300", badge: "bg-rose-400", text: "text-rose-600" };

/** "เกิน N วัน" ของขั้นตอนที่ผ่านมา — รับนาทีที่ SQL คิดมาแล้ว ไม่นับสดเหมือน
    formatSlaTimelineDuration() เพราะงานที่ปิดแล้วตัวเลขต้องหยุดที่เวลาปิด */
export function formatSlaOverdueMinutes(minutes: number): string {
  const totalHours = Math.floor(minutes / 60);
  const days = Math.floor(totalHours / 24);
  if (days > 0) return `เกิน ${days.toLocaleString("th-TH")} วัน`;
  if (totalHours > 0) return `เกิน ${totalHours.toLocaleString("th-TH")} ชม.`;
  return `เกิน ${Math.max(1, Math.floor(minutes)).toLocaleString("th-TH")} นาที`;
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

export function SlaPanel({
  status,
  policyCode,
  taskName,
  startedAt,
  dueAt,
  ownerRole,
  ownerContent,
}: {
  status: SlaStatus;
  policyCode?: string | null;
  taskName?: string | null;
  startedAt?: string | null;
  dueAt: string;
  ownerRole?: SlaOwnerRole | null;
  ownerContent: ReactNode;
}) {
  const style = SLA_STATUS_STYLE[status];
  const tone = SLA_TIMELINE_STYLE[status].text;
  const allowance = startedAt ? slaAllowanceText(startedAt, dueAt) : "";
  const countdown = slaCountdown(status, dueAt);
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
        <div className="flex min-w-0 items-start gap-1.5">
          <ClockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" />
          {/* สามบรรทัด: นโยบายให้เวลาเท่าไร · ช่วงเวลาจริงของงานนี้ · ตอนนี้ยืนตรงไหน
              เริ่มกับกำหนดอยู่บรรทัดเดียวกันเพื่อให้อ่านเป็นช่วงเวลาเดียว
              วันเวลาใช้รูปแบบเดียวกับ Timeline & SLA ในหน้า Lead (มีปี พ.ศ.) */}
          <div className="min-w-0 flex-1 space-y-0.5 leading-5">
            {allowance && (
              <div>
                <span className="text-gray-500">SLA</span>{" "}
                <span className="font-semibold text-gray-700">{allowance}</span>
              </div>
            )}
            <div className="text-gray-600">
              {startedAt && (
                <>
                  <span className="text-gray-500">เริ่ม</span> {dateTimeText(startedAt)}
                  <span className="px-1 text-gray-400">·</span>
                </>
              )}
              <span className="text-gray-500">กำหนด</span> {dateTimeText(dueAt)}
            </div>
            {/* ป้าย "สถานะ:" ให้เข้าชุดกับ "ขั้นตอน:" ด้านบน — บรรทัดนี้คือคำตอบว่า
                ตอนนี้งานยืนตรงไหนเทียบกับกำหนด ไม่ใช่สถานะของ lead */}
            {countdown && (
              <div>
                <span className="font-semibold text-gray-500">สถานะ:</span>{" "}
                <span className={tone}>{countdown.label} {countdown.value}</span>
              </div>
            )}
          </div>
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
  startedAt,
  dueAt,
  ownerRole,
  ownerName,
}: {
  status: SlaStatus;
  policyCode?: string | null;
  taskName?: string | null;
  startedAt?: string | null;
  dueAt: string;
  ownerRole?: SlaOwnerRole | null;
  ownerName?: string | null;
}) {
  return (
    <SlaPanel
      status={status}
      policyCode={policyCode}
      taskName={taskName}
      startedAt={startedAt}
      dueAt={dueAt}
      ownerRole={ownerRole}
      ownerContent={ownerName || (ownerRole === "solar" ? "ยังไม่มอบหมายทีม Solar" : "ยังไม่มอบหมาย Owner")}
    />
  );
}
