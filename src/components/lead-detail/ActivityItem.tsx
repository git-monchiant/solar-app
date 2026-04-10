interface Activity {
  id: number;
  activity_type: string;
  title: string;
  note: string | null;
  old_status: string | null;
  new_status: string | null;
  follow_up_date: string | null;
  created_by_name: string | null;
  created_at: string;
}

const typeConfig: Record<string, { icon: string; color: string }> = {
  call: { icon: "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z", color: "bg-blue-500" },
  visit: { icon: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z", color: "bg-purple-500" },
  follow_up: { icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z", color: "bg-amber-500" },
  status_change: { icon: "M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-4.5L16.5 7.5m0 0L12 12m4.5-4.5V21", color: "bg-green-500" },
  note: { icon: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z", color: "bg-gray-500" },
  lead_created: { icon: "M12 4.5v15m7.5-7.5h-15", color: "bg-primary" },
  booking_created: { icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z", color: "bg-secondary" },
};

const formatTime = (d: string) => new Date(d).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
const formatDateTime = (d: string) => {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) + " at " + date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
};

export default function ActivityItem({ activity, isLast }: { activity: Activity; isLast?: boolean }) {
  const isCreated = activity.title.startsWith("Lead created");
  const config = isCreated ? typeConfig.lead_created : (typeConfig[activity.activity_type] || typeConfig.note);

  // Special card for "Lead created"
  if (isCreated) {
    const source = activity.title.includes("walk-in") ? "Walk-in" : activity.title.includes("event") ? "Event" : "—";
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
              <span className="text-[10px] bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">{source}</span>
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
                Status: Registered
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Normal activity item
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
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold text-sm">{activity.title}</div>
          <span className="text-xs text-gray shrink-0">{formatTime(activity.created_at)}</span>
        </div>
        {activity.note && (
          <div className="text-sm text-gray mt-1">{activity.note}</div>
        )}
        {activity.created_by_name && (
          <div className="text-xs text-gray/50 mt-1">by {activity.created_by_name}</div>
        )}
      </div>
    </div>
  );
}

export type { Activity };
