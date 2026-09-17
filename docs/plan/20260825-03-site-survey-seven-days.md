# SITE_SURVEY Seven-Day Alignment

Status: done

## Goal

Make every `SITE_SURVEY` SLA instance use seven calendar days, including historical instances that still carry the retired three-day deadline.

## Work

1. Add an idempotent forward migration that aligns the active policy and every `SITE_SURVEY` instance to `started_at + 7 days`, with a two-day warning window.
2. Recalculate SLA status and breach evidence from the corrected deadline without changing the start or completion milestones.
3. Record a deadline-change event for auditability.
4. Add regression guards, apply to `solardb_dev`, and verify Lead 924 plus database-wide invariants.

## Safety

- Back up `sla_policies`, `lead_sla_instances`, and `lead_sla_events` before applying on development.
- Do not deploy or modify production in this task.

## Result

- Added migration 179 and applied it to `solardb_dev` after backups stamped `20260825_134446`.
- All 80 `SITE_SURVEY` instances now use 10,080 minutes (seven days); 78 retired three-day deadlines were corrected.
- Lead 924 now runs from 16 Aug 2026 10:57 to 23 Aug 2026 10:57 and is late by 1,845 minutes against its 24 Aug 2026 17:42 completion.
- The migration is idempotent and produced 78 unique `deadline_changed` audit events.
- Timeline labels use `เงื่อนไข:` without the redundant word `เวลา`.
- SLA tests, TypeScript, targeted ESLint, and the Next production build passed.
- Production was not changed.
