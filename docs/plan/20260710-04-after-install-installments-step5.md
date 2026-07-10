# After-install Installments in Step 5

## Status

done

## Goal

Move every structured installment marked `when: "after"` from Step 4 payment
entry to Step 5 / เก็บเงิน while retaining its original
`order_installment_<index>` identity.

## Rules

- Step 4 keeps after-install rows visible as read-only payment-plan rows and
  directs users to Step 5 for payment.
- Step 5 renders each unpaid after-install installment separately with its
  configured amount and payment method.
- Do not create or collect a generic `order_after_slip` when structured
  after-install installments exist.
- Legacy plans without structured after-install rows continue to use
  `order_after_slip`.
- Extra costs remain separate under `install_extra_<sequence>`.
- Accounting Pending labels after-install installments as Step 5 items and
  navigates receipt/final confirmation to Step 5.
- Cheque receipt may unlock handover; only final confirmation counts as cash.

## Verification

- A 50/50 plan with the second installment marked after installation shows the
  first installment in Step 4 and the second in Step 5.
- The Step 5 amount respects deposit/discount allocation and retains the
  original installment index.
- No duplicate `order_after_slip` is created for structured after-install plans.
- Pending routes an after-install installment to Step 5 and shows its correct
  installment label.
- TypeScript, targeted ESLint, and diff checks pass.

## Result

- Step 4 keeps after-install installments in the plan but replaces payment entry
  with a Step 5 status indicator.
- Step 5 renders each after-install installment using its existing
  `order_installment_<index>` payment row and configured payment method.
- Structured plans suppress the generic `order_after_slip` card and Pending row,
  preventing duplicate collection.
- Pending labels and routes submitted after-install payments to Step 5.
- Verified `SM-260077`: installment 2 is `order_installment_1`, amount 99,000;
  the obsolete empty 199,000 generic row is not rendered.
- TypeScript passed, targeted ESLint returned zero errors (existing warnings
  only), and `git diff --check` passed.
