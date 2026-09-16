import assert from "node:assert/strict";
import { getNotificationTarget } from "../../src/lib/notification-navigation.ts";

const finalApproval = {
  notification_source: "quotation",
  lead_id: 726,
  approval_stage: "sales_sup",
  quotation_status: "pending_sales_sup",
  target_url: null,
};

assert.equal(getNotificationTarget(finalApproval, ["sales"]), "/leads/726?focus=1");
assert.equal(getNotificationTarget(finalApproval, ["sales_sup"]), "/quotation-approvals");
assert.equal(getNotificationTarget(finalApproval, ["admin"]), "/quotation-approvals");

assert.equal(getNotificationTarget({
  ...finalApproval,
  approval_stage: "solar_sup",
  quotation_status: "pending_solar_sup",
}, ["solar_sup"]), "/quotation-approvals");

assert.equal(getNotificationTarget({
  ...finalApproval,
  quotation_status: "approved",
}, ["sales_sup"]), "/leads/726?focus=1");

assert.equal(getNotificationTarget({
  ...finalApproval,
  notification_source: "accounting",
  target_url: "/payments/42",
}, ["sales"]), "/payments/42");

console.log("notification navigation tests passed");
