import assert from "node:assert/strict";
import {
  contactResultFromOutcome,
  FIRST_CONTACT_WARNING_MINUTES,
  firstContactHardDeadline,
  firstContactWarningAt,
  GRADE_PLAYBOOKS,
  OPERATIONAL_SLA_MINUTES,
  resolveFirstContactEvidence,
  resolveScheduledSurveyAnchor,
  resolveSurveySlaMilestones,
  retryDeadlines,
} from "../../src/lib/sla-rules.ts";

const iso = d => d.toISOString();

assert.equal(iso(firstContactHardDeadline(new Date("2026-08-17T02:00:00.000Z"))), "2026-08-17T16:59:59.000Z"); // 09:00 BKK
assert.equal(iso(firstContactHardDeadline(new Date("2026-08-17T11:59:59.000Z"))), "2026-08-17T16:59:59.000Z"); // 18:59:59 BKK
assert.equal(iso(firstContactHardDeadline(new Date("2026-08-17T12:00:00.000Z"))), "2026-08-18T05:00:00.000Z"); // 19:00 BKK
assert.equal(iso(firstContactHardDeadline(new Date("2026-08-17T16:59:59.000Z"))), "2026-08-18T05:00:00.000Z"); // 23:59:59 BKK
assert.equal(iso(firstContactHardDeadline(new Date("2026-08-17T01:59:59.000Z"))), "2026-08-17T05:00:00.000Z"); // 08:59:59 BKK
assert.equal(iso(firstContactHardDeadline(new Date("2026-08-17T17:00:00.000Z"))), "2026-08-18T05:00:00.000Z"); // 00:00 BKK 18 Aug
assert.equal(iso(firstContactHardDeadline(new Date("2026-08-31T16:00:00.000Z"))), "2026-09-01T05:00:00.000Z"); // 23:00 BKK, month rollover
assert.equal(iso(firstContactHardDeadline(new Date("2026-12-31T16:00:00.000Z"))), "2027-01-01T05:00:00.000Z"); // 23:00 BKK, year rollover

// The deadline is the same for every lead source. A stray extra argument must
// not change it, so the rule cannot silently regress to source-based windows.
for (const source of ["line_sena", "facebook", "event_booth", "walk_in", "referral", null]) {
  assert.equal(
    iso(firstContactHardDeadline(new Date("2026-08-17T02:00:00.000Z"), source)),
    "2026-08-17T16:59:59.000Z",
  );
  assert.equal(
    iso(firstContactHardDeadline(new Date("2026-08-17T13:00:00.000Z"), source)),
    "2026-08-18T05:00:00.000Z",
  );
}

assert.equal(FIRST_CONTACT_WARNING_MINUTES, 120);
assert.equal(iso(firstContactWarningAt(new Date("2026-08-17T02:00:00.000Z"))), "2026-08-17T14:59:59.000Z");
assert.equal(iso(firstContactWarningAt(new Date("2026-08-17T12:00:00.000Z"))), "2026-08-18T03:00:00.000Z");
// The shortest window (received 08:59) still leaves an active period.
assert.ok(
  firstContactWarningAt(new Date("2026-08-17T01:59:59.000Z")) > new Date("2026-08-17T01:59:59.000Z"),
);

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
assert.equal(OPERATIONAL_SLA_MINUTES.BOOK_SURVEY.due, 24 * 60);
assert.equal(OPERATIONAL_SLA_MINUTES.SITE_SURVEY.due, 7 * 24 * 60);
assert.deepEqual(OPERATIONAL_SLA_MINUTES.PROPOSAL_ROI, { target: 2 * 24 * 60, due: 2 * 24 * 60, warning: 12 * 60 });
assert.equal(OPERATIONAL_SLA_MINUTES.DEPOSIT_CLOSE.due, 3 * 24 * 60);
assert.deepEqual(OPERATIONAL_SLA_MINUTES.PAYMENT_INSTALLMENT_1, { target: 7 * 24 * 60, due: 7 * 24 * 60, warning: 2 * 24 * 60 });
assert.deepEqual(OPERATIONAL_SLA_MINUTES.LOAN_PREAPPROVAL, { target: 15 * 24 * 60, due: 15 * 24 * 60, warning: 3 * 24 * 60 });
assert.deepEqual(OPERATIONAL_SLA_MINUTES.SCHEDULE_INSTALLATION, { target: 3 * 24 * 60, due: 3 * 24 * 60, warning: 24 * 60 });
assert.deepEqual(OPERATIONAL_SLA_MINUTES.INSTALLATION, { target: 15 * 24 * 60, due: 15 * 24 * 60, warning: 3 * 24 * 60 });
assert.equal(OPERATIONAL_SLA_MINUTES.AFTER_SALES.due, 3 * 24 * 60);
assert.equal(OPERATIONAL_SLA_MINUTES.CLOSE_LEAD.due, 7 * 24 * 60);

// Qualification is one day from the first connected contact for every source.
assert.deepEqual(OPERATIONAL_SLA_MINUTES.ELECTRICITY_ASSESSMENT, { target: 24 * 60, due: 24 * 60, warning: 4 * 60 });
// Every grade runs the same single repeating follow-up task.
for (const grade of ["A", "B", "C", "D", "E", "F"]) {
  assert.equal(GRADE_PLAYBOOKS[grade].length, 1, `${grade} must have one step`);
  assert.deepEqual(GRADE_PLAYBOOKS[grade][0], {
    code: "daily_follow_up",
    taskName: "โทรติดตามลูกค้า",
    dueMinutes: 24 * 60,
    warningMinutes: 4 * 60,
    repeatFrom: 0,
  });
}

const surveyMilestones = resolveSurveySlaMilestones({
  assessmentAt: null,
  preBookedAt: new Date("2026-08-03T19:19:14.483Z"),
  appointmentSetAt: new Date("2026-08-03T19:52:02.323Z"),
  surveyDoneAt: new Date("2026-08-04T17:38:57.770Z"),
});
assert.equal(surveyMilestones.assessmentAt?.toISOString(), "2026-08-03T19:19:14.483Z");
assert.equal(surveyMilestones.bookedAt?.toISOString(), "2026-08-03T19:52:02.323Z");

assert.equal(resolveScheduledSurveyAnchor({
  surveyDate: "2026-06-12T00:00:00",
  surveyTimeSlot: '["14:30","14:00"]',
  appointmentSetAt: new Date("2026-06-08T05:31:00.000Z"),
}).at?.toISOString(), "2026-06-12T07:00:00.000Z");
assert.equal(resolveScheduledSurveyAnchor({
  surveyDate: "2026-06-12",
  surveyTimeSlot: null,
  appointmentSetAt: new Date("2026-06-08T05:31:00.000Z"),
}).at?.toISOString(), "2026-06-11T17:00:00.000Z");
assert.equal(resolveScheduledSurveyAnchor({
  surveyDate: null,
  surveyTimeSlot: null,
  appointmentSetAt: new Date("2026-06-08T05:31:00.000Z"),
}).at?.toISOString(), "2026-06-08T05:31:00.000Z");
const inconsistentSurveySchedule = resolveScheduledSurveyAnchor({
  surveyDate: "2026-08-05",
  surveyTimeSlot: '["10:00"]',
  appointmentSetAt: new Date("2026-08-03T12:52:02.323Z"),
  completedAt: new Date("2026-08-04T10:38:57.770Z"),
});
assert.equal(inconsistentSurveySchedule.at?.toISOString(), "2026-08-03T12:52:02.323Z");
assert.equal(inconsistentSurveySchedule.source, "appointment_recorded_at_inconsistent_schedule");
const legacySurveyCompletion = resolveScheduledSurveyAnchor({
  surveyDate: null,
  surveyTimeSlot: null,
  appointmentSetAt: null,
  completedAt: new Date("2026-08-04T10:38:57.770Z"),
});
assert.equal(legacySurveyCompletion.at?.toISOString(), "2026-08-04T10:38:57.770Z");
assert.equal(legacySurveyCompletion.source, "completion_at_legacy_fallback");

const appointmentFallback = resolveFirstContactEvidence({
  explicitAttemptAt: null,
  appointmentSetAt: new Date("2026-08-03T19:52:02.323Z"),
});
assert.equal(appointmentFallback.completedAt?.toISOString(), "2026-08-03T19:52:02.323Z");
assert.equal(appointmentFallback.source, "survey_appointment");

const explicitAttemptWins = resolveFirstContactEvidence({
  explicitAttemptAt: new Date("2026-08-03T15:00:00.000Z"),
  appointmentSetAt: new Date("2026-08-03T19:52:02.323Z"),
});
assert.equal(explicitAttemptWins.completedAt?.toISOString(), "2026-08-03T15:00:00.000Z");
assert.equal(explicitAttemptWins.source, "contact_activity");

console.log("sla-rules tests passed");
