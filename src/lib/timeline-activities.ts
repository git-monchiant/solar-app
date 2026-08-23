export type ForwardStatusActivity = {
  id: number;
  activity_type: string;
  new_status: string | null;
};

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
