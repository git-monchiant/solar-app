# Grade-Based SLA and Playbook

Status: done

## Goal

Align Sales SLA with the approved two-phase spreadsheet:

1. Lead Management SLA before grading, driven by Lead Source and contact/qualification timing.
2. Grade A-F SLA/Playbook after grading, with Grade A focused on closing and Grades B-F using the prescribed nurture cadence.

## Rules

- Keep payment installment 1, loan pre-approval, installation, and after-sales SLA event-driven regardless of grade.
- Open pre-survey closing SLA only for Grade A.
- Grade B-F receives one actionable playbook task at a time; a successful contact advances the sequence.
- Changing grade supersedes open tasks from the previous grade and opens the first task for the new grade.
- Existing graded Development leads start their new playbook from migration time, not a fabricated historical timestamp.
- Completed SLA history remains intact; only invalid open work is superseded/cancelled.
- Dashboard remains three visible statuses and continues to prioritize the internal critical state inside `ใกล้กำหนด SLA`.

## Verification

- Pure rule tests for source qualification and Grade A-F playbooks.
- Migration backup, apply, idempotency, and database distribution checks on `solardb_dev`.
- Targeted ESLint, TypeScript, SLA tests, and Next production build.

## Result

- Implemented source-aware first-contact and qualification timing before grading.
- Implemented Grade A-F playbooks with one open actionable task per grade epoch.
- Kept payment installment 1, loan pre-approval, installation, warranty, and after-sales SLA event-driven and independent of grade.
- Applied migration 156 idempotently to `solardb_dev` only after SLA/grade-history backups.
- Verified 198 open playbook tasks across 198 distinct grade epochs, zero duplicates, zero non-Grade-A closing tasks, and zero negative elapsed-time rows.
- Verified Lead #467 (Grade D) has only the expected FAQ nurture task instead of a Survey/closing task.
- SLA rule tests, TypeScript, targeted ESLint (zero errors; three pre-existing warnings), and Next production build passed.
- Production has not been migrated or deployed.
