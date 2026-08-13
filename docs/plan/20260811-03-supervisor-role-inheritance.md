# Supervisor Role Inheritance

## Status

Done.

## Goal

Make the supervisor roles consistent with their operational teams while preserving the quotation approval workflow:

- `solar_sup` inherits the Solar workspace.
- `sales_sup` inherits the Sales workspace.
- Both supervisor roles retain `Quotation Approvals` and its pending-count badge.
- Supervisor-only approval stages remain distinct; inherited access must not turn a team member into a supervisor.

## Approach

1. Add one shared role-permission helper that models one-way inheritance.
2. Use the helper in client-side role checks and server-side API authorization.
3. Keep raw assigned roles unchanged for approval-stage decisions.
4. Add `Quotation Approvals` to the supervisor mobile navigation while keeping the existing desktop Reports entry.
5. Keep `/quotation-approvals` as the supervisor-only landing page.
6. Add focused tests for one-way inheritance, then run lint, type-check, tests, and build.

## Acceptance Criteria

- Solar Sup sees and can access everything exposed to Solar, plus Quotation Approvals.
- Sale Sup sees and can access everything exposed to Sales, plus Quotation Approvals.
- Solar and Sales users do not gain supervisor approval access.
- Solar Sup cannot approve the Sale Sup stage, and Sale Sup cannot approve the Solar Sup stage.
- Desktop and mobile navigation are consistent.
- Existing unrelated working-tree changes remain untouched.

## Verification

- Focused role-permission tests passed.
- Existing quotation terms/payment regression tests passed.
- TypeScript check passed.
- Targeted lint passed with no errors (one pre-existing `<img>` warning in the sidebar).
- Next.js 16.2.3 production build passed and generated all 93 pages.
- Full-project lint remains blocked by 23 pre-existing errors outside this change; no error is reported in the new permission helper or the modified authorization/navigation files.

## Mobile Follow-up

- Solar Sup and Sale Sup mobile navigation replace `Packages` in place with the approval entry, leaving the order `Today`, `Pipeline`, `Pending`, `Me`.
- The compact mobile label/icon use `Pending` with a circled check; Admin keeps the original `Quotation Approvals` label in Reports.

## Desktop Sidebar Follow-up

- Solar Sup and Sale Sup use the same primary order as the Account reference: `Today`, `Pipeline`, `Pending`, `Me`.
- Reports contains Dashboard I–III, Lead Tracking, Calendar, and Export inherited from the team role.
- Accounting contains Report and Pending Approval.
- Settings retains the team-role functions such as Packages and LINE Users.
- Both Pending entries still route to the role-specific quotation approval queue and retain the count badge.
