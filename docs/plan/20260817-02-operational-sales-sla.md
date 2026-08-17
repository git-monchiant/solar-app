# Operational Sales SLA

## Objective

Extend the Sales SLA engine from First Contact and retry handling to the complete sales process approved by the business.

## Scope

- Lead registration / owner assignment: target 15 minutes, hard limit 1 hour.
- Electricity assessment and consultation: within 24 hours after successful contact.
- Book Survey: within 24 hours after assessment completion.
- Site Survey: within 3 calendar days after booking.
- Proposal and ROI/financial solution: within 48 hours after survey completion.
- Deposit / Close Sale: follow continuously, hard limit 7 calendar days after proposal sent.
- Schedule Installation: within 3 calendar days after deposit confirmation.
- Installation: target 7 and hard limit 14 calendar days after deposit confirmation.
- After Sales: first follow-up within 3 calendar days after installation completion.
- Preserve the existing First Contact deadline windows and unreachable retry D3/D5/D7/D30.

## Implementation approach

1. Back up the current source state and affected Development database tables.
2. Add versioned SLA policies through an idempotent migration.
3. Derive milestone anchors and completions from existing lead and activity data.
4. Synchronize SLA instances after lead, payment, survey, proposal, installation, and after-sales events.
5. Surface all operational tasks in the existing role-scoped SLA dashboard and lead detail badges.
6. Add rule/service tests, run lint, type-check, production build, and Development integration checks.

## Safety

- Apply database changes to `solardb_dev` only.
- Do not deploy Production without separate approval.
- Keep migrations forward-only and idempotent.
- Do not overwrite an existing assigned owner.

## Result

- Implemented migration `150_operational_sales_sla.sql` and applied it to `solardb_dev` only.
- Added durable `owner_assigned_at` so the 1-hour registration SLA measures the real owner assignment time.
- Connected operational reconciliation to lead create/update, contact activity, booking, quotation handoff, payment confirmation, installation, and after-sales contact events.
- Backfilled measurable Development milestones without creating duplicate instances; upstream tasks with missing historical evidence are cancelled after their stage has passed.
- Dashboard visibility remains role-scoped: Sales sees own/unassigned work; Admin and Sale Supervisor see all work when that role is active.
- Verified SLA unit tests, targeted ESLint, TypeScript, production build, authenticated dashboard API, and local/LAN HTTP 200.
- Development table backup suffix: `20260817_155248`. Source backup: `C:\Project\_backups\Solar-V0\20260817-operational-sla-preimplementation`.
- Production was not changed or deployed.
