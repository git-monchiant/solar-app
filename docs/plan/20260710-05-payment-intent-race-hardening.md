# Payment Intent Race Hardening

## Status

done

## Goal

Prevent Step 5 payment components from creating a new pending row immediately
after the same installment or extra-payment key has already been confirmed.

## Changes

- Do not render Step 5 payment entry until existing payment rows finish loading.
- Resolve a payment key by priority: confirmed, cheque received, then pending.
- Make the intent API return an existing confirmed immutable payment key instead
  of inserting a new pending row during a client refresh race.
- Keep an existing payment row's amount authoritative after loading.
- Repair the approved Development data for `SM-260077`: remove empty duplicate
  drafts 354/355 and restore confirmed installment 2 to 99,000.

## Verification

- Refreshing immediately after confirmation does not create a new draft.
- Confirmed installment and extra rows satisfy the Step 5 handover gate.
- `SM-260077` can continue after its confirmed installment and extra payment.
- TypeScript, targeted ESLint, and diff checks pass.

## Result

- Step 5 waits for payment-state loading before mounting PaymentSection.
- Canonical selection prioritizes confirmed rows, then received cheques, then
  pending drafts.
- The intent API returns an existing confirmed immutable key rather than
  inserting a post-confirmation duplicate.
- Development `SM-260077` repair completed: drafts 354/355 removed, payment 350
  restored to 99,000 and its cheque lifecycle restored from activity 3747.
- A `data_correction` activity records the repair; confirmation timestamp and
  confirming user were unchanged.
- Final obligation and received totals both equal 250,000.
- TypeScript, targeted ESLint, and `git diff --check` passed.
