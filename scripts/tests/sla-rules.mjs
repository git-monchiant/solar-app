import assert from "node:assert/strict";
import {
  contactResultFromOutcome,
  firstContactHardDeadline,
  OPERATIONAL_SLA_MINUTES,
  retryDeadlines,
} from "../../src/lib/sla-rules.ts";

const iso = d => d.toISOString();

assert.equal(iso(firstContactHardDeadline(new Date("2026-08-17T02:00:00.000Z"))), "2026-08-17T16:59:59.000Z"); // 09:00 BKK
assert.equal(iso(firstContactHardDeadline(new Date("2026-08-17T11:59:59.000Z"))), "2026-08-17T16:59:59.000Z"); // 18:59:59 BKK
assert.equal(iso(firstContactHardDeadline(new Date("2026-08-17T12:00:00.000Z"))), "2026-08-18T05:00:00.000Z"); // 19:00 BKK
assert.equal(iso(firstContactHardDeadline(new Date("2026-08-17T01:59:59.000Z"))), "2026-08-17T05:00:00.000Z"); // 08:59:59 BKK

const retries = retryDeadlines(new Date("2026-08-17T03:30:00.000Z"));
assert.deepEqual(retries.map(iso), [
  "2026-08-20T03:30:00.000Z",
  "2026-08-22T03:30:00.000Z",
  "2026-08-24T03:30:00.000Z",
  "2026-09-16T03:30:00.000Z",
]);

assert.equal(contactResultFromOutcome("ติดต่อได้ - Sale เสนอขาย"), "connected");
assert.equal(contactResultFromOutcome("ติดต่อไม่ได้ - ไม่รับสาย"), "unreachable");
assert.equal(contactResultFromOutcome("ติดต่อไม่ได้ - ข้อมูลติดต่อไม่ถูกต้อง"), "invalid_contact");

assert.deepEqual(OPERATIONAL_SLA_MINUTES.ASSIGN_OWNER, { target: 15, due: 60, warning: 30 });
assert.equal(OPERATIONAL_SLA_MINUTES.ELECTRICITY_ASSESSMENT.due, 24 * 60);
assert.equal(OPERATIONAL_SLA_MINUTES.BOOK_SURVEY.due, 24 * 60);
assert.equal(OPERATIONAL_SLA_MINUTES.SITE_SURVEY.due, 3 * 24 * 60);
assert.equal(OPERATIONAL_SLA_MINUTES.PROPOSAL_ROI.due, 48 * 60);
assert.equal(OPERATIONAL_SLA_MINUTES.DEPOSIT_CLOSE.due, 7 * 24 * 60);
assert.equal(OPERATIONAL_SLA_MINUTES.SCHEDULE_INSTALLATION.due, 3 * 24 * 60);
assert.deepEqual(OPERATIONAL_SLA_MINUTES.INSTALLATION, { target: 7 * 24 * 60, due: 14 * 24 * 60, warning: 2 * 24 * 60 });
assert.equal(OPERATIONAL_SLA_MINUTES.AFTER_SALES.due, 3 * 24 * 60);

console.log("sla-rules tests passed");
