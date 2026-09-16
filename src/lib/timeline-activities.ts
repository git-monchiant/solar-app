export type ForwardStatusActivity = {
  id: number;
  activity_type: string;
  new_status: string | null;
};

type TimelineSlaItem = {
  policy_code: string;
  status: string;
  completed_at: string | null;
};

/**
 * Keep live qualification work visible even before the first Grade activity
 * exists. Only completed legacy qualification backfills lack trustworthy
 * activity timestamps and belong behind the Activity Log instead.
 */
export function shouldShowSlaTimelineItem(
  item: TimelineSlaItem,
  hasGradeActivity: boolean,
): boolean {
  if (item.status === "superseded" || item.status === "cancelled") return false;
  if (item.policy_code === "ELECTRICITY_ASSESSMENT" && !hasGradeActivity && item.completed_at) return false;
  return true;
}

export type LeadSlaSummaryCounts = {
  onTime: number;
  completedLate: number;
  breachedOpen: number;
  open: number;
};

/** Split historical late completions from work that is still overdue now. */
export function summarizeSlaDisplayStatuses(statuses: string[]): LeadSlaSummaryCounts {
  return statuses.reduce<LeadSlaSummaryCounts>((summary, status) => {
    if (status === "on_time") summary.onTime += 1;
    else if (status === "late") summary.completedLate += 1;
    else if (status === "breached") summary.breachedOpen += 1;
    else if (status !== "cancelled") summary.open += 1;
    return summary;
  }, { onTime: 0, completedLate: 0, breachedOpen: 0, open: 0 });
}

/**
 * The main Timeline is a summary of the workflow state that currently stands.
 * When a lead is rolled back and later enters the same status again, only the
 * newest forward transition belongs in that summary. The Activity Log keeps
 * the complete audit sequence, including the superseded transition.
 */
export function compactLatestForwardStatusActivities<T extends ForwardStatusActivity>(
  activities: T[],
  isRollback: (activity: T) => boolean,
): T[] {
  const latestIdByTarget = new Map<string, number>();

  for (const activity of activities) {
    if (activity.activity_type === "status_change" && activity.new_status && !isRollback(activity)) {
      latestIdByTarget.set(activity.new_status, activity.id);
    }
  }

  return activities.filter(activity => {
    if (activity.activity_type !== "status_change" || !activity.new_status || isRollback(activity)) return true;
    return latestIdByTarget.get(activity.new_status) === activity.id;
  });
}
