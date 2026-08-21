import assert from "node:assert/strict";
import {
  completionEvidenceChanged,
  contactResultFromOutcome,
  FIRST_CONTACT_WARNING_MINUTES,
  firstContactHardDeadline,
  firstContactWarningAt,
  OPERATIONAL_SLA_MINUTES,
  resolveCloseLeadMilestones,
  resolveFirstContactEvidence,
  resolveInstallCompletion,
  resolveScheduledInstallAnchor,
  resolveScheduledSurveyAnchor,
  resolveSurveySlaMilestones,
  retryDeadlines,
} from "../../src/lib/sla-rules.ts";
import * as rules from "../../src/lib/sla-rules.ts";

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

assert.equal(OPERATIONAL_SLA_MINUTES.BOOK_SURVEY.due, 24 * 60);
assert.equal(OPERATIONAL_SLA_MINUTES.SITE_SURVEY.due, 7 * 24 * 60);
assert.deepEqual(OPERATIONAL_SLA_MINUTES.PROPOSAL_ROI, { target: 2 * 24 * 60, due: 2 * 24 * 60, warning: 12 * 60 });
assert.equal(OPERATIONAL_SLA_MINUTES.DEPOSIT_CLOSE.due, 3 * 24 * 60);
assert.deepEqual(OPERATIONAL_SLA_MINUTES.PAYMENT_INSTALLMENT_1, { target: 7 * 24 * 60, due: 7 * 24 * 60, warning: 2 * 24 * 60 });
assert.deepEqual(OPERATIONAL_SLA_MINUTES.LOAN_PREAPPROVAL, { target: 15 * 24 * 60, due: 15 * 24 * 60, warning: 3 * 24 * 60 });
assert.deepEqual(OPERATIONAL_SLA_MINUTES.SCHEDULE_INSTALLATION, { target: 3 * 24 * 60, due: 3 * 24 * 60, warning: 24 * 60 });
assert.deepEqual(OPERATIONAL_SLA_MINUTES.INSTALLATION, { target: 15 * 24 * 60, due: 15 * 24 * 60, warning: 3 * 24 * 60 });
assert.deepEqual(OPERATIONAL_SLA_MINUTES.CLOSE_LEAD, { target: 3 * 24 * 60, due: 3 * 24 * 60, warning: 24 * 60 });

assert.deepEqual(resolveCloseLeadMilestones({
  installCompletedAt: new Date("2026-07-11T13:17:44.686Z"),
  warrantyIssuedAt: new Date("2026-07-11T13:28:36.993Z"),
}), {
  anchorAt: new Date("2026-07-11T13:17:44.686Z"),
  completedAt: new Date("2026-07-11T13:28:36.993Z"),
});
assert.deepEqual(resolveCloseLeadMilestones({
  installCompletedAt: new Date("2026-07-11T13:17:44.686Z"),
  warrantyIssuedAt: null,
}), {
  anchorAt: new Date("2026-07-11T13:17:44.686Z"),
  completedAt: null,
});

assert.equal(completionEvidenceChanged({
  existingCompletedAt: new Date("2026-07-19T09:33:47.260Z"),
  existingActivityId: 3934,
  nextCompletedAt: new Date("2026-07-20T09:23:15.390Z"),
  nextActivityId: 3959,
}), true);
assert.equal(completionEvidenceChanged({
  existingCompletedAt: new Date("2026-07-20T09:23:15.390Z"),
  existingActivityId: 3959,
  nextCompletedAt: new Date("2026-07-20T09:23:15.390Z"),
  nextActivityId: 3959,
}), false);
assert.equal(completionEvidenceChanged({
  existingCompletedAt: new Date("2026-07-20T09:23:15.390Z"),
  existingActivityId: 3959,
  nextCompletedAt: null,
  nextActivityId: null,
}), false);
assert.deepEqual(resolveCloseLeadMilestones({
  installCompletedAt: new Date("2026-07-11T13:17:44.686Z"),
  warrantyIssuedAt: new Date("2026-07-11T13:00:00.000Z"),
}), {
  anchorAt: new Date("2026-07-11T13:17:44.686Z"),
  completedAt: null,
});

// Qualification is one day from the first connected contact for every source.
assert.deepEqual(OPERATIONAL_SLA_MINUTES.ELECTRICITY_ASSESSMENT, { target: 24 * 60, due: 24 * 60, warning: 4 * 60 });
// The grade follow-up playbook is retired: reaching a lead ends the chasing,
// and a lead we could not reach belongs to the CONTACT_RETRY ladder. Nothing
// grade-shaped may reappear in the rules module.
for (const name of ["GRADE_PLAYBOOKS", "UNIFIED_PLAYBOOK", "isSalesGrade"]) {
  assert.equal(rules[name], undefined, `${name} must stay retired`);
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
  appointmentConfirmedAt: new Date("2026-06-10T05:31:00.000Z"),
}).at?.toISOString(), "2026-06-12T07:00:00.000Z");
assert.equal(resolveScheduledSurveyAnchor({
  surveyDate: "2026-06-12",
  surveyTimeSlot: null,
  appointmentSetAt: new Date("2026-06-08T05:31:00.000Z"),
  appointmentConfirmedAt: new Date("2026-06-10T05:31:00.000Z"),
}).at?.toISOString(), "2026-06-11T17:00:00.000Z");
assert.equal(resolveScheduledSurveyAnchor({
  surveyDate: null,
  surveyTimeSlot: null,
  appointmentSetAt: new Date("2026-06-08T05:31:00.000Z"),
  appointmentConfirmedAt: new Date("2026-06-09T05:31:00.000Z"),
}).at?.toISOString(), "2026-06-09T05:31:00.000Z");
const lateSurveyConfirmation = resolveScheduledSurveyAnchor({
  surveyDate: "2026-06-26",
  surveyTimeSlot: '["10:00"]',
  appointmentSetAt: new Date("2026-06-12T09:46:45.460Z"),
  appointmentConfirmedAt: new Date("2026-06-26T03:01:19.066Z"),
  completedAt: new Date("2026-06-26T04:07:37.346Z"),
});
assert.equal(lateSurveyConfirmation.at?.toISOString(), "2026-06-26T03:01:19.066Z");
assert.equal(lateSurveyConfirmation.source, "confirmation_after_scheduled_time");
const unconfirmedSurvey = resolveScheduledSurveyAnchor({
  surveyDate: "2026-08-15",
  surveyTimeSlot: '["15:30"]',
  appointmentSetAt: new Date("2026-08-01T03:00:00.000Z"),
  appointmentConfirmedAt: null,
});
assert.equal(unconfirmedSurvey.at, null);
assert.equal(unconfirmedSurvey.source, null);
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

// INSTALLATION opens at the booked slot, not at the deposit — a customer who
// books three weeks out must not burn the crew's clock.
const bkk = (iso) => new Date(iso);
{
  const booked = resolveScheduledInstallAnchor({
    installDate: "2026-07-09",
    installTimeSlot: null,
    depositAt: bkk("2026-07-02T11:03:00.000Z"),
    completedAt: bkk("2026-07-10T16:59:59.000Z"),
  });
  assert.equal(booked.source, "scheduled_date_time");
  assert.equal(iso(booked.at), "2026-07-08T17:00:00.000Z"); // 9 ก.ค. 00:00 Bangkok

  const slotted = resolveScheduledInstallAnchor({
    installDate: "2026-07-09",
    installTimeSlot: '["13:00","09:30"]',
    depositAt: null,
    completedAt: null,
  });
  assert.equal(iso(slotted.at), "2026-07-09T02:30:00.000Z"); // earliest slot, 09:30 Bangkok

  // No booked date at all keeps the old deposit anchor.
  const unbooked = resolveScheduledInstallAnchor({
    installDate: null,
    installTimeSlot: null,
    depositAt: bkk("2026-07-02T11:03:00.000Z"),
    completedAt: null,
  });
  assert.equal(unbooked.source, "deposit_fallback");
  assert.equal(iso(unbooked.at), "2026-07-02T11:03:00.000Z");

  // A finish recorded before its own booked slot falls back instead of
  // reporting negative elapsed time.
  const backdated = resolveScheduledInstallAnchor({
    installDate: "2026-07-20",
    installTimeSlot: null,
    depositAt: bkk("2026-07-02T11:03:00.000Z"),
    completedAt: bkk("2026-07-10T16:59:59.000Z"),
  });
  assert.equal(backdated.source, "deposit_inconsistent_schedule");
  assert.equal(iso(backdated.at), "2026-07-02T11:03:00.000Z");
}

// The clock closes on the day the crew recorded, not on the button click.
{
  // Different days: end of the recorded day, 23:59:59 Bangkok.
  assert.equal(
    iso(resolveInstallCompletion({ actualDate: "2026-07-10", completedAt: bkk("2026-07-11T06:17:44.000Z") })),
    "2026-07-10T16:59:59.000Z",
  );
  // Same day: keep the recorded time.
  assert.equal(
    iso(resolveInstallCompletion({ actualDate: "2026-07-11", completedAt: bkk("2026-07-11T06:17:44.000Z") })),
    "2026-07-11T06:17:44.000Z",
  );
  // Never filled in: the click stands as the only evidence.
  assert.equal(
    iso(resolveInstallCompletion({ actualDate: null, completedAt: bkk("2026-07-11T06:17:44.000Z") })),
    "2026-07-11T06:17:44.000Z",
  );
  assert.equal(resolveInstallCompletion({ actualDate: null, completedAt: null }), null);
}

console.log("installation anchor tests passed");
