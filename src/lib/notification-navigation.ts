type NotificationNavigationItem = {
  notification_source: "quotation" | "accounting" | "b2b";
  lead_id: number;
  approval_stage: string | null;
  quotation_status: string | null;
  target_url: string | null;
};

export function getNotificationTarget(
  item: NotificationNavigationItem,
  activeRoles: readonly string[],
): string {
  // บัญชี / B2B (แผน 20261015-11 — server คิดปลายทางให้แล้ว: ยังรอชั้นที่แจ้ง = คิวอนุมัติ B2B ไม่งั้นหน้าใบ)
  if ((item.notification_source === "accounting" || item.notification_source === "b2b") && item.target_url) {
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

  // ยังรอคนที่กดอยู่อนุมัติ → คิวอนุมัติ · ไม่งั้นไปที่ตัวงาน: ใบ O&M มี target_url ไปหน้างาน O&M
  return waitingForActiveApprovalRole && stillWaitingForNotifiedStage
    ? "/quotation-approvals"
    : item.target_url || `/leads/${item.lead_id}?focus=1`;
}
