"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { slaTimeConditionText } from "@/lib/sla-display";
import { formatThaiDate, formatThaiTime } from "@/lib/utils/formatters";

type SlaStatus = "active" | "warning" | "critical" | "breached" | "completed" | "superseded" | "cancelled";
type DisplayStatus = "on_time" | "late" | "breached" | "critical" | "warning" | "active" | "cancelled";

export type LeadSlaItem = {
  id: number;
  policy_code: string;
  policy_name: string | null;
  task_name: string;
  owner_user_id: number | null;
  owner_name: string | null;
  owner_role: "sales" | "solar";
  started_at: string;
  target_at: string;
  due_at: string;
  warning_at: string | null;
  status: SlaStatus;
  completed_at: string | null;
  breached_at: string | null;
  display_note?: string;
};

const STATUS_STYLE: Record<DisplayStatus, { label: string; dot: string; text: string; badge: string }> = {
  on_time: { label: "เสร็จใน SLA", dot: "bg-emerald-500", text: "text-emerald-700", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  late: { label: "เสร็จเกิน SLA", dot: "bg-red-500", text: "text-red-700", badge: "bg-red-50 text-red-700 border-red-200" },
  breached: { label: "เกินกำหนด", dot: "bg-red-500", text: "text-red-700", badge: "bg-red-50 text-red-700 border-red-200" },
  critical: { label: "ใกล้เกินกำหนด", dot: "bg-orange-500", text: "text-orange-700", badge: "bg-orange-50 text-orange-700 border-orange-200" },
  warning: { label: "ใกล้ครบกำหนด", dot: "bg-amber-400", text: "text-amber-700", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  active: { label: "กำลังดำเนินการ", dot: "bg-sky-500", text: "text-sky-700", badge: "bg-sky-50 text-sky-700 border-sky-200" },
  cancelled: { label: "ยกเลิก", dot: "bg-gray-300", text: "text-gray-500", badge: "bg-gray-50 text-gray-500 border-gray-200" },
};

function displayStatus(item: LeadSlaItem, now: number): DisplayStatus {
  if (item.status === "cancelled" || item.status === "superseded") return "cancelled";
  const due = new Date(item.due_at).getTime();
  if (item.completed_at) return new Date(item.completed_at).getTime() > due ? "late" : "on_time";
  if (item.status === "breached" || now > due) return "breached";
  if (item.status === "critical") return "critical";
  if (item.status === "warning") return "warning";
  return "active";
}

export function isSlaFinished(item: LeadSlaItem): boolean {
  return Boolean(item.completed_at) || item.status === "cancelled" || item.status === "superseded";
}

function durationText(milliseconds: number): string {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes ? `${hours} ชม. ${remainingMinutes} นาที` : `${hours} ชม.`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days} วัน ${remainingHours} ชม.` : `${days} วัน`;
}

function dateTimeText(value: string): string {
  return `${formatThaiDate(value)} ${formatThaiTime(value)}`;
}

/**
 * Some milestones are known only to the day — the installation finish is a
 * user-picked date, and the clock closes at the end of that day so a job never
 * reads as finished before it started. Printing "23:59" would dress that up as
 * a recorded time and contradict the audit stamp shown elsewhere, so the
 * end-of-day marker prints the date alone. Midnight is treated the same way.
 */
function dayOrDateTimeText(value: string): string {
  const clock = formatThaiTime(value);
  return clock === "23:59" || clock === "00:00" ? formatThaiDate(value) : dateTimeText(value);
}

export function useLeadSlaTimeline(leadId: number) {
  const [items, setItems] = useState<LeadSlaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const timer = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/leads/${leadId}/sla`) as { items?: LeadSlaItem[] };
      setItems(response.items || []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ไม่สามารถโหลด SLA Timeline ได้");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const summary = useMemo(() => items.reduce((acc, item) => {
    if (now === null) return acc;
    const status = displayStatus(item, now);
    if (status === "on_time") acc.onTime += 1;
    else if (status === "late" || status === "breached") acc.overdue += 1;
    else if (status !== "cancelled") acc.open += 1;
    return acc;
  }, { onTime: 0, overdue: 0, open: 0 }), [items, now]);

  return { items, loading, error, now, summary, refresh };
}

export function LeadSlaSummary({ loading, error, summary }: {
  loading: boolean;
  error: string;
  summary: { onTime: number; overdue: number; open: number };
}) {
  if (loading) return <span className="h-6 w-28 rounded-full bg-gray-100 animate-pulse" />;
  if (error) return <span className="text-xs text-red-600">โหลด SLA ไม่สำเร็จ</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xxs font-semibold">
      <span className="px-2 py-1 rounded-full bg-sky-50 text-sky-700">กำลังทำ {summary.open}</span>
      <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">ผ่าน {summary.onTime}</span>
      <span className="px-2 py-1 rounded-full bg-red-50 text-red-700">เกิน {summary.overdue}</span>
    </div>
  );
}

export function LeadSlaStageRows({ items, loading, now }: {
  items: LeadSlaItem[];
  loading: boolean;
  now: number | null;
}) {
  if (loading || now === null) {
    return (
      <li className="flex items-start gap-2.5 py-1">
        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-200 shrink-0" />
        <span className="h-5 w-64 max-w-full rounded bg-violet-50 animate-pulse" />
      </li>
    );
  }
  if (items.length === 0) return null;

  return (
    <>
      {items.map(item => {
        const state = displayStatus(item, now);
        const style = STATUS_STYLE[state];
        const resultAt = item.completed_at ? new Date(item.completed_at).getTime() : now;
        const elapsed = durationText(resultAt - new Date(item.started_at).getTime());
        const target = durationText(new Date(item.target_at).getTime() - new Date(item.started_at).getTime());
        const due = durationText(new Date(item.due_at).getTime() - new Date(item.started_at).getTime());
        const sameDeadline = new Date(item.target_at).getTime() === new Date(item.due_at).getTime();
        const timeCondition = slaTimeConditionText(item.policy_code, item.started_at);
        return (
          <li key={`sla-${item.id}`} className="flex items-start gap-2.5 text-sm py-1">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-semibold ${style.text}`}>{item.task_name || item.policy_name}</span>
                <span className={`px-1.5 py-0.5 rounded border text-xxs font-bold ${style.badge}`}>{style.label}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xxs text-gray-500">
                <span>SLA {target}{!sameDeadline ? ` / สูงสุด ${due}` : ""}</span>
                {timeCondition && <span>เงื่อนไขเวลา: {timeCondition}</span>}
                <span>เริ่ม {dayOrDateTimeText(item.started_at)}</span>
                <span>กำหนด {dayOrDateTimeText(item.due_at)}</span>
                <span className={`font-semibold ${style.text}`}>ใช้จริง {elapsed}</span>
                {/* The elapsed time alone does not say when the work landed.
                    Open and cancelled rows have no end timestamp — their badge
                    already states why — so the stamp is shown only when the
                    task actually finished. */}
                {item.completed_at && <span>เสร็จ {dayOrDateTimeText(item.completed_at)}</span>}
                {/* This is who the SLA is measured against, not who clicked.
                    The two are often different people — a colleague can close
                    the milestone that stops this clock — and the milestone row
                    right below says "โดย <ผู้ทำ>", so the name is labelled to
                    keep the two apart. */}
                <span>
                  {item.owner_name
                    ? `รับผิดชอบ ${item.owner_name} · ${item.owner_role === "solar" ? "Solar" : "Sale"}`
                    : `ยังไม่มอบหมายผู้รับผิดชอบ · ${item.owner_role === "solar" ? "Solar" : "Sale"}`}
                </span>
              </div>
              {item.display_note && <div className="mt-0.5 text-xxs text-gray-500">{item.display_note}</div>}
            </div>
          </li>
        );
      })}
    </>
  );
}
