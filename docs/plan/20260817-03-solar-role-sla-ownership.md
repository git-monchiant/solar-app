# Solar Role SLA Ownership

## Objective

Separate Survey and Installation SLA ownership from the Sales lead owner so Solar staff and Solar Managers receive the work queue they are accountable for.

## Scope

- Add independent Survey and Installation assignees without changing `assigned_user_id`.
- Route `SITE_SURVEY` to the Survey assignee and `INSTALLATION` to the Installation assignee.
- Allow Solar users to see their assigned work plus unassigned Solar work.
- Allow Solar Manager and Admin to see all Solar SLA work.
- Keep Sales visibility for Sales-owned SLA policies and read-only lead workflow status.
- Add claim/assignment actions with authorization and audit events.
- Respect the currently active role for users who hold multiple roles.

## Verification

- Migration applied to `solardb_dev` only.
- Role-matrix API tests for Sales, Solar, Solar Manager, Sale Manager, and Admin.
- TypeScript, ESLint, SLA unit tests, production build, and local/LAN smoke tests.
- Production deployment requires separate approval.

## Result

- Added independent `survey_assigned_user_id` / `install_assigned_user_id` fields and assignment timestamps.
- Added `owner_role` to SLA instances and indexed the role work queue.
- `SITE_SURVEY` and `INSTALLATION` belong to Solar; all other current policies remain Sales-owned.
- Solar sees own and unassigned Solar work and can claim an unassigned task.
- Solar Manager sees every Solar task and can assign, reassign, or clear an assignee.
- Sale Manager sees every Sales task; Admin sees both scopes. Active Role remains authoritative.
- Assignment changes are recorded in both SLA events and the lead activity log.
- Migration 151 applied to `solardb_dev` only. Source backup: `C:\Project\_backups\Solar-V0\20260817-solar-role-sla-preimplementation`; DB backup suffix: `20260817_164804`.
- Role matrix, claim/reassign authorization, cleanup, unit tests, TypeScript, ESLint, production build, and local/LAN HTTP checks passed.
- Production was not changed or deployed.
