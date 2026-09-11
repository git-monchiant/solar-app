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
- Payment installment 1 (transfer, cheque, or credit card): confirm payment within 7 calendar days after the customer receives the quotation, to confirm the quoted price.
- Loan: receive the bank's preliminary result within 15 calendar days after both the site survey and complete document submission.
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
- Added migration `152_payment_and_loan_sla.sql` to replace the generic deposit deadline with payment-method-specific installment 1 and loan preliminary-result policies; applied to `solardb_dev` only.
- Development SLA backup suffix before migration 152: `20260818_095304` (`sla_policies`, `lead_sla_instances`, and `lead_sla_events`).
- Corrected survey milestones with migration `153_correct_survey_sla_milestones.sql`: opening a pre-survey document starts BOOK_SURVEY, the real `appointment_set` completes it and starts SITE_SURVEY. Applied to `solardb_dev` only after backup suffix `20260818_103210`.
- Verified SLA tests, targeted ESLint (no errors), TypeScript, production build, and Development policy state. Production was not changed.
- Added durable `owner_assigned_at` so the 1-hour registration SLA measures the real owner assignment time.
- Connected operational reconciliation to lead create/update, contact activity, booking, quotation handoff, payment confirmation, installation, and after-sales contact events.
- Backfilled measurable Development milestones without creating duplicate instances; upstream tasks with missing historical evidence are cancelled after their stage has passed.
- Dashboard visibility remains role-scoped: Sales sees own/unassigned work; Admin and Sale Supervisor see all work when that role is active.
- Verified SLA unit tests, targeted ESLint, TypeScript, production build, authenticated dashboard API, and local/LAN HTTP 200.
- Development table backup suffix: `20260817_155248`. Source backup: `C:\Project\_backups\Solar-V0\20260817-operational-sla-preimplementation`.
- Production was not changed or deployed.
