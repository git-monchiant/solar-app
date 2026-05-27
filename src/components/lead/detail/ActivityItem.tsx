import { STATUS_CONFIG, getMainStatus } from "@/lib/constants/statuses";

interface Activity {
  id: number;
  activity_type: string;
  title: string;
  note: string | null;
  old_status: string | null;
  new_status: string | null;
  follow_up_date: string | null;
  // User-entered "วันที่ติดตาม" (event date). Optional. created_at remains the
  // real save timestamp.
  followup_date: string | null;
  created_by_name: string | null;
  created_at: string;
}

// Chat-bubble icon, shared by both incoming and outgoing LINE entries.
const LINE_ICON = "M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z";
const typeConfig: Record<string, { icon: string; color: string }> = {
  call: { icon: "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z", color: "bg-blue-500" },
  visit: { icon: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z", color: "bg-purple-500" },
  line: { icon: LINE_ICON, color: "bg-green-500" },
  line_sent: { icon: LINE_ICON, color: "bg-green-500" },
  follow_up: { icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z", color: "bg-amber-500" },
  follow_up_cleared: { icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z", color: "bg-amber-300" },
  loan_followup: { icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z", color: "bg-rose-500" },
  other: { icon: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z", color: "bg-teal-500" },
  status_change: { icon: "M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-4.5L16.5 7.5m0 0L12 12m4.5-4.5V21", color: "bg-sky-500" },
  note: { icon: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z", color: "bg-gray-500" },
  lead_created: { icon: "M12 4.5v15m7.5-7.5h-15", color: "bg-primary" },
  presurvey_doc_created: { icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z", color: "bg-orange-500" },
  payment_confirmed: { icon: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z", color: "bg-emerald-600" },
  payment_rejected: { icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z", color: "bg-red-500" },
};

const formatTime = (d: string) => new Date(d).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
const formatDateTime = (d: string) => {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) + " at " + date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
};
const formatThaiDate = (d: string) => new Date(String(d).slice(0, 10) + "T12:00:00")
  .toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

// Activity-type label shown in the title slot. Mirrors lead detail's typeMap so
// the timeline reads consistently across the app. Anything missing here falls
// through to "บันทึก" — keep in sync with new activity_types added by the app.
const TYPE_LABELS: Record<string, string> = {
  call: "โทร",
  visit: "เยี่ยม",
  follow_up: "ติดตาม",
  loan_followup: "ติดตามสินเชื่อ",
  note: "โน้ต",
  status_change: "เปลี่ยนสถานะ",
  presurvey_doc_created: "เปิดเลขเอกสาร",
  payment_confirmed: "ยืนยันการชำระ",
  appointment_set: "นัดสำรวจ",
  appointment_rescheduled: "เลื่อนนัดสำรวจ",
  appointment_confirmed: "ยืนยันนัดสำรวจ",
  slip_uploaded: "อัปโหลดสลิป",
  slip_submitted: "ส่งสลิป",
  payment_rejected: "ปฏิเสธสลิป",
  line: "LINE",
  line_sent: "ส่ง LINE",
  step_completed: "ขั้นตอนเสร็จ",
  other: "อื่นๆ",
};

export default function ActivityItem({ activity, isLast }: { activity: Activity; isLast?: boolean }) {
  const isCreated = activity.title.startsWith("Lead created");
  const config = isCreated ? typeConfig.lead_created : (typeConfig[activity.activity_type] || typeConfig.note);

  // Special card for "Lead created"
  if (isCreated) {
    const source = activity.title.includes("walk-in") ? "SENX PM" : activity.title.includes("event") ? "Event" : "—";
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${config.color}`}>
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
            </svg>
          </div>
          {!isLast && <div className="w-px flex-1 bg-gray-200 mt-1" />}
        </div>
        <div className="flex-1 pb-4 min-w-0">
          <div className="rounded-xl bg-primary/5 border border-primary/10 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-primary">Lead Created</span>
              <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">{source}</span>
            </div>
            <div className="space-y-1 text-xs text-gray">
              <div className="flex items-center gap-1.5">
                <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                {formatDateTime(activity.created_at)}
              </div>
              {activity.created_by_name && (
                <div className="flex items-center gap-1.5">
                  <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                  by {activity.created_by_name}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /></svg>
                Status: รอติดตาม
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Normal activity item.
  // Title was historically "Scheduled follow-up for <date>" which read as if
  // the event happened on that date — but it's actually the NEXT scheduled
  // date. Build the header from structured fields so it's unambiguous.
  const newStatusLabel = activity.new_status
    ? (STATUS_CONFIG[activity.new_status]?.label ?? STATUS_CONFIG[getMainStatus(activity.new_status)]?.label ?? activity.new_status)
    : "";
  // appointment_* activity types don't encode survey vs install in the type —
  // the kind lives in the title field ("นัดติดตั้ง..." vs "นัดสำรวจ...").
  // Detect from title so the label reflects the real kind.
  const isAppointment = activity.activity_type.startsWith("appointment_");
  const isInstallAppt = isAppointment && activity.title?.includes("ติดตั้ง");
  const apptLabel = isAppointment
    ? (activity.activity_type === "appointment_set"
        ? (isInstallAppt ? "นัดติดตั้ง" : "นัดสำรวจ")
        : activity.activity_type === "appointment_rescheduled"
          ? (isInstallAppt ? "เลื่อนนัดติดตั้ง" : "เลื่อนนัดสำรวจ")
          : activity.activity_type === "appointment_confirmed"
            ? (isInstallAppt ? "ยืนยันนัดติดตั้ง" : "ยืนยันนัดสำรวจ")
            : activity.activity_type === "appointment_cancelled"
              ? (isInstallAppt ? "ยกเลิกนัดติดตั้ง" : "ยกเลิกนัดสำรวจ")
              : null)
    : null;
  const typeLabel = activity.activity_type === "status_change" && newStatusLabel
    ? `เปลี่ยนสถานะเป็น : ${newStatusLabel}`
    : (apptLabel ?? TYPE_LABELS[activity.activity_type] ?? "บันทึก");
  const eventDate = activity.followup_date || activity.created_at;
  // Status changes to 'lost' / 'returned' read as cancellations — render the
  // dot + label in red so the timeline visually flags them.
  const isLostChange = activity.activity_type === "status_change"
    && (activity.new_status === "lost" || activity.new_status === "returned");
  const isRejected = activity.activity_type === "payment_rejected";
  const dotColor = isLostChange || isRejected ? "bg-red-500" : config.color;
  const headColor = isLostChange || isRejected ? "text-red-600" : "text-gray-900";
  const noteColor = isLostChange ? "text-red-600" : "text-gray-700";
  const sd = new Date(activity.created_at);
  const isNoonDefault = sd.getHours() === 12 && sd.getMinutes() === 0 && sd.getSeconds() === 0;
  const saveStr = isNoonDefault
    ? formatThaiDate(activity.created_at)
    : `${formatThaiDate(activity.created_at)} ${formatTime(activity.created_at)}`;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${dotColor}`}>
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
          </svg>
        </div>
        {!isLast && <div className="w-px flex-1 bg-gray-200 mt-1" />}
      </div>
      <div className="flex-1 pb-4 min-w-0">
        <div className={`font-semibold text-sm ${headColor}`}>
          {/* Appointment titles already encode the from/to dates + slot — render
              the full title so users see the whole reschedule context. Other
              activities use the short typeLabel + event date. */}
          {isAppointment ? activity.title : `${typeLabel} · ${formatThaiDate(eventDate)}`}
          <span className="ml-1 text-xs font-normal text-gray-400">· บันทึกเมื่อ {saveStr}</span>
        </div>
        {activity.title && (() => {
          const t = activity.title;
          const isOk = t.startsWith("ติดต่อได้");
          const isFail = t.startsWith("ติดต่อไม่ได้");
          const isOther = t === "อื่นๆ";
          if (!isOk && !isFail && !isOther) return null;
          const cls = isOk
            ? "bg-green-50 text-green-700 border-green-200"
            : isFail
            ? "bg-red-50 text-red-700 border-red-200"
            : "bg-gray-50 text-gray-600 border-gray-200";
          return (
            <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
              {t}
            </span>
          );
        })()}
        {activity.activity_type === "status_change" && activity.old_status && activity.new_status && (() => {
          const labelOf = (s: string) => STATUS_CONFIG[s]?.label ?? STATUS_CONFIG[getMainStatus(s)]?.label ?? s;
          const tone = (s: string) => {
            if (s === "lost" || s === "returned") return "bg-red-50 text-red-700 border-red-200";
            if (s === "closed" || s === "warranty") return "bg-teal-50 text-teal-700 border-teal-200";
            return "bg-gray-50 text-gray-700 border-gray-200";
          };
          return (
            <div className="flex items-center gap-1.5 mt-1 text-xs">
              <span className={`px-2 py-0.5 rounded-full border font-semibold ${tone(activity.old_status)}`}>{labelOf(activity.old_status)}</span>
              <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
              <span className={`px-2 py-0.5 rounded-full border font-semibold ${tone(activity.new_status)}`}>{labelOf(activity.new_status)}</span>
            </div>
          );
        })()}
        {activity.note && (
          <div className={`text-sm mt-1 whitespace-pre-wrap ${noteColor}`}>{activity.note}</div>
        )}
        {activity.follow_up_date && (
          <div className="text-xs text-amber-700 font-semibold mt-1">
            นัดติดตามครั้งถัดไป {formatThaiDate(activity.follow_up_date)}
          </div>
        )}
        {activity.created_by_name && (
          <div className="text-xs text-gray-400 mt-1">โดย {activity.created_by_name}</div>
        )}
      </div>
    </div>
  );
}

export type { Activity };
