"use client";

import ActivityItem, { Activity } from "./ActivityItem";

function groupByDate(activities: Activity[]): { label: string; items: Activity[] }[] {
  const groups: Record<string, Activity[]> = {};
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const a of activities) {
    const dateStr = new Date(a.created_at).toDateString();
    let label: string;
    if (dateStr === today) label = "Today";
    else if (dateStr === yesterday) label = "Yesterday";
    else label = new Date(a.created_at).toLocaleDateString("en-US", { day: "numeric", month: "short" });

    if (!groups[label]) groups[label] = [];
    groups[label].push(a);
  }

  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

interface Props {
  activities: Activity[];
  loading: boolean;
}

export default function ActivityTimeline({ activities, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <div className="text-gray mb-1">No activities yet</div>
        <div className="text-xs text-gray/60">Add your first note or log a call</div>
      </div>
    );
  }

  const groups = groupByDate(activities);

  return (
    <div className="px-4 py-4">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="text-xs font-semibold text-gray/50 uppercase tracking-wider mb-3">{group.label}</div>
          {group.items.map((activity, ai) => {
            const isLastItem = group === groups[groups.length - 1] && ai === group.items.length - 1;
            return <ActivityItem key={activity.id} activity={activity} isLast={isLastItem} />;
          })}
        </div>
      ))}
    </div>
  );
}
