# Active Role Approval Authorization

## Status

Done.

## Goal

Make quotation approval permissions follow the role currently selected in the Role Switcher:

- Admin mode can approve both Solar Sup and Sale Sup stages.
- Sales mode cannot approve either supervisor stage, even when the underlying account is Admin.
- Solar Sup mode can act only on the Solar Sup stage.
- Sale Sup mode can act only on the Sale Sup stage.
- The server validates the selected role against the account's database roles; Admin may explicitly preview another role but receives only that role's permissions.

## Approach

1. Send the active-role context with client API requests.
2. Add a shared server-side resolver that validates active roles against assigned database roles.
3. Apply effective-role authorization to approval queues, counts, and quotation actions.
4. Hide approval actions when the current UI role cannot act on the displayed stage.
5. Record the role used in quotation approval events, with a backward-compatible insert until the migration is applied.
6. Add focused tests and run lint, type-check, tests, build, and rollback-only database migration verification.

## Acceptance Criteria

- An Admin account in Sales view receives 403 for Solar Sup and Sale Sup approval actions.
- An Admin account in Admin view can approve both stages.
- An Admin account in Solar Sup or Sale Sup preview can approve only that role's stage.
- A Sales-only account cannot gain supervisor rights by forging the active-role header.
- Approval queue data and badges follow the active-role context.
- Approval events retain actor identity and the effective role used for the action.
- Existing unrelated working-tree changes remain untouched.

## Verification

- Focused role-permission tests passed, including Admin preview and forged-role cases.
- TypeScript check passed.
- Targeted ESLint passed.
- Live Development API checks passed without mutation:
  - Admin in Sales mode: queue and approve action return 403.
  - Admin mode: Sale Sup queue returns 200.
  - Admin in Solar Sup mode: Sale Sup queue returns 403.
  - Admin in Sale Sup mode: Sale Sup queue returns 200.
  - Sales-only account forging Sale Sup mode returns 403.
- `SSR-QT-26-0008` remained `pending_sales_sup` with no approver after the rejected POST.
- Migration 146 was applied and rolled back inside a test transaction; no database schema change was retained.
- Isolated Next.js 16.2.3 production build passed for all 93 routes without interrupting the running Development server.

## Deployment

- No environment was deployed.
- Migration 146 is prepared but not applied to Development or Production.
