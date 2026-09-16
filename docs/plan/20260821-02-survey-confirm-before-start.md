# Survey confirmation before site-survey start

Date: 2026-08-21
Status: done

## Business rule

The Survey timeline must read in the order the work can actually happen:

1. Confirm the survey appointment.
2. Start the site survey.
3. Finish the survey and move to Quotation.

The scheduled appointment remains the normal SLA anchor. When confirmation is
recorded after the scheduled start, the SLA cannot start before that confirmation;
use the later of the scheduled start and the confirmation activity.

## Current defect

Lead 686 is scheduled for 26 June 2026 at 10:00, confirmation was recorded at
10:01:19, and survey completion was recorded at 11:07:37. `SITE_SURVEY.started_at`
is 10:00, so the Timeline currently shows site survey before confirmation.

This is systemic in Development: among 69 visible `SITE_SURVEY` instances,
45 have confirmation recorded after the SLA start, 22 confirm before or at the
start, and 2 legacy rows have no confirmation activity.

## Implementation

- Extend `resolveScheduledSurveyAnchor` with the durable survey-confirmation
  timestamp.
- With a confirmation activity, return `max(scheduled_at, confirmed_at)`.
- Do not open a new Survey SLA for an unconfirmed appointment. Preserve a
  legacy fallback when completed work proves the survey happened but no
  confirmation activity exists.
- Read the latest survey `appointment_confirmed` activity no later than survey
  completion and pass it into the anchor resolver.
- Add regression tests for confirmation before schedule, late confirmation,
  unconfirmed appointments, and legacy completed rows.
- Add an idempotent forward migration that realigns historical `SITE_SURVEY`
  timestamps and retains the SLA duration already attached to each instance.
  Record an audit event for each changed anchor.
- Verify Lead 686 orders confirmation before the SLA row and keeps completion
  after both.

## Expected impact

- Lead 686 moves from 10:00 to 10:01:19; its elapsed Survey duration changes
  from about 1 hour 8 minutes to about 1 hour 6 minutes.
- Historical anchors move only when confirmation is later than the existing
  start. Preliminary analysis finds 45 shifted instances and 11 completed
  verdicts changing from late to on-time because their old clock started before
  the workflow was confirmed.
- The existing SLA duration on each completed historical instance is
  preserved; this change does not silently convert old 3-day history to the
  current 7-day policy. Open work uses policy v4 with the current 7-day rule.

## Verification

- `node scripts/tests/sla-rules.mjs`
- `npx tsc --noEmit`
- targeted ESLint
- production build
- migration dry-run analysis and idempotency on `solardb_dev`
- direct database verification for Lead 686 and aggregate counts

## Result

- Runtime uses policy `SITE_SURVEY` v4 and the later of the scheduled start or
  survey-confirmation activity. An open unconfirmed appointment has no
  field-work anchor.
- Migration 167 was dry-run in a rolled-back transaction, then applied to
  `solardb_dev` and rerun twice with no further changes.
- Backups: `sla_policies_bak_20260821_112853`,
  `lead_sla_instances_bak_20260821_112853`, and
  `lead_sla_events_bak_20260821_112853`.
- Lead 686 now reads confirmation 10:01:19 -> SLA start 10:01:19 -> completion
  11:07:37. The old 3-day historical duration is retained.
- 45 historical anchors moved and received one audit event each. Two open
  unconfirmed Survey SLAs were cancelled until confirmation. Completed late
  SITE_SURVEY rows decreased from 21 to 10; the 11 changed verdicts were clocks
  that had started before the workflow allowed field work.
- SLA tests, TypeScript, targeted ESLint (0 errors; 3 existing warnings), and
  the 96-route production build pass.
- Browser visual verification was unavailable because no browser session was
  connected; database order and the Timeline tie-order rule were verified.
