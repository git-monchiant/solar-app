# Quotation O&M Editor

## Goal

Add a compact O&M accordion to the existing Quotation Builder sidebar so each draft quotation can override the standard maintenance duration and service frequencies without changing the established UI theme.

## Scope

- Extend quotation document inputs with a validated O&M snapshot.
- Add the compact accordion UI between payment terms and quotation date.
- Preserve package defaults and allow resetting the quotation to Master values.
- Generate the legal-content paragraphs from the quotation snapshot.
- Keep old quotations compatible by falling back to the current 2-year / twice-yearly standard.
- Add focused tests and run the relevant project checks.

## Non-goals

- No production deployment.
- No database schema change.
- No redesign of the Quotation Builder layout or theme.

## Verification

- O&M parser/default unit coverage.
- Quotation legal-content coverage for customized values and disabled services.
- TypeScript/build checks relevant to the changed files.
