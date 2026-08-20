# First Contact Calendar Deadline

Status: done

## Goal

Replace the source-based First Contact windows with one deadline that applies to every lead source, driven only by the time the lead arrives (Asia/Bangkok).

## Rules

- Lead received 09:00–18:59 → contact by 23:59:59 the same day.
- Lead received 19:00–23:59 → contact by 12:00 the next day.
- Lead received 00:00–08:59 → contact by 12:00 the same day.
- Boundary: 09:00 inclusive, 19:00 exclusive.
- The deadline is identical for every source. Lead Source no longer shortens or lengthens First Contact.
- `target_at` equals `due_at`; there is a single committed deadline, not a soft target plus a hard limit.
- Warning starts 2 hours before the deadline. The shortest possible window is just over 3 hours (received 08:59), so an active period always precedes the warning.
- Qualification (`ELECTRICITY_ASSESSMENT`), retry D3/D5/D7/D30, Grade playbooks, and every operational SLA are unchanged.
- Completion evidence is unchanged: the first contact activity closes the task, and the survey appointment remains the fallback for legacy leads.

## Implementation

1. `firstContactHardDeadline` drops its `source` parameter and always applies the Bangkok contact window; `firstContactSlaMinutes` and `firstContactTarget` are removed as dead code.
2. Add `FIRST_CONTACT_WARNING_MINUTES` and `firstContactWarningAt`.
3. `ensureFirstContactSla` writes policy version 3 with `target_at = due_at` and records `deadlineRule` in `context_json`.
4. Migration 157 registers policy version 3, deactivates versions 1 and 2, and recomputes existing instances.
5. Rule tests cover both branches, the month/year rollover, warning lead time, and source-independence.

## Migration scope

Version 1 instances already used this formula, so the migration leaves them byte-identical. Version 2 instances carry the retracted source-based deadline and are corrected — including the on-time verdict of ones already completed, because they were judged against a rule the business never approved and that never reached Production. The `WHERE` guard compares the recomputed values, so re-runs change nothing.

## Verification

- `npm run test:sla` passed.
- `npx tsc --noEmit` reported no errors in `src/` or `scripts/`.
- `npx eslint src/lib/sla-rules.ts src/lib/sla-service.ts` reported no errors.
- `npm run build` passed, 96 routes. A stale `.next/dev/types/routes.d.ts` from an earlier dev-server run had to be cleared first; it is unrelated to this change.
- Applied migration 157 to `solardb_dev` only, after backing up `sla_policies`, `lead_sla_instances`, and `lead_sla_events` with suffix `20260820_101607`.
- Verified on `solardb_dev`: all 60 First Contact instances are policy version 3 (7 breached, 53 completed), zero deadline-rule violations, zero `target_at`/`warning_at` inconsistencies, zero negative elapsed rows, and 60 audit events.
- Verified idempotency: a second apply left the counts and the 60 audit events unchanged.
- Spot-checked the branches — lead 952 received 09:24 is due 23:59:59 the same day, lead 947 received 08:59 is due 12:00 the same day, and lead 932 received 21:31 on 31 July is due 12:00 on 1 August.

## Side effect

`evaluateSlaState` flags `critical` at 30 minutes remaining. Under the source-based rule the 15-minute window was critical from the moment it opened; the shortest window is now just over 3 hours, so First Contact passes through `active` and `warning` normally.

## Rollback

- Backup tables on `solardb_dev`: `sla_policies_bak_20260820_101607`, `lead_sla_instances_bak_20260820_101607`, `lead_sla_events_bak_20260820_101607`.
- Git baseline: commit `0e9ad97`.
- Production has not been migrated or deployed.
