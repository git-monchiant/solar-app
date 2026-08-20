# Site Survey Scheduled SLA Anchor

Status: done

## Goal

Make the `SITE_SURVEY` SLA start from the latest scheduled survey date and the earliest selected time slot, instead of the time when the appointment record was saved.

## Rules

- Use `leads.survey_date` plus the earliest valid value in `leads.survey_time_slot`.
- If a survey date exists but no valid time slot exists, use 00:00 on that survey date.
- Fall back to the appointment activity timestamp only for legacy records without a survey date.
- A reschedule before survey completion updates the SLA anchor and deadline.
- Once the survey is completed, runtime reconciliation keeps the completed SLA history fixed.
- Correct existing Development SLA instances with a forward-only migration and retain an audit event.

## Verification

- Unit tests for scheduled-date/time parsing and legacy fallback.
- TypeScript, targeted lint, SLA tests, and production build.
- Database verification for the reported 12 June appointment case.

## Result

- Lead 642 now starts at 12 June 2026 14:00, completes at 14:48, and is on time.
- Reschedules before completion move the anchor; completed instances keep their historical anchor.
- Legacy/inconsistent records use an audited fallback and no SITE_SURVEY instance has negative elapsed time.
- Instances without a survey date, appointment, or completion evidence are cancelled until a real appointment exists.
- Applied migration 155 to `solardb_dev` after backing up SLA instance/event tables.
- SLA tests, TypeScript, targeted ESLint, and the 96-route production build pass.
