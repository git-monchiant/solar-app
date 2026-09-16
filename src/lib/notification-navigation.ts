type NotificationNavigationItem = {
  notification_source: "quotation" | "accounting";
  lead_id: number;
  approval_stage: string | null;
  quotation_status: string | null;
  target_url: string | null;
};

export function getNotificationTarget(
  item: NotificationNavigationItem,
  activeRoles: readonly string[],
): string {
  if (item.notification_source === "accounting" && item.target_url) {
    return item.target_url;
  }

  const waitingForActiveApprovalRole =
    activeRoles.includes("admin") ||
    (item.approval_stage === "solar_sup" && activeRoles.includes("solar_sup")) ||
    (item.approval_stage === "sales_sup" && activeRoles.includes("sales_sup"));
  const stillWaitingForNotifiedStage =
    (item.approval_stage === "solar_sup" && item.quotation_status === "pending_solar_sup") ||
    (item.approval_stage === "sales_sup" &&
      ["pending_sales_sup", "pending_approval"].includes(item.quotation_status || ""));

  return waitingForActiveApprovalRole && stillWaitingForNotifiedStage
    ? "/quotation-approvals"
    : `/leads/${item.lead_id}?focus=1`;
}
