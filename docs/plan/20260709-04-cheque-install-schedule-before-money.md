# Cheque Install Schedule Before Money

## Status

done

## Goal

When an order installment is paid by cheque, Accounting can confirm only cheque receipt first. After that, Sale can schedule installation, save, close Step 04, and move the lead to Step 05 without waiting for the cheque money to enter the company account. Step 04 must still show a clear Accounting action to confirm received money later.

## Current Behavior To Preserve

- Cheque payment has two states:
  - cheque received: `payments.cheque_received_at` is set, `confirmed_at` is still null.
  - money received: `confirmed_at` is set by Accounting/Admin.
- Step 04 done view already can show pending cheque money confirmation.
- Final money confirmation must remain restricted to Accounting/Admin.

## Proposed Rules

1. Treat `confirmed_at` or `cheque_received_at` as "ready for installation scheduling" for before-install installments.
2. Treat only `confirmed_at` as "money received" for accounting totals and final paid state.
3. Sale can close Step 04 and move to Step 05 when:
   - required before-install payment condition is satisfied by cash/transfer/card confirmation or cheque receipt,
   - installation date is filled,
   - the Step 04 form is saved successfully.
4. Step 04 done view must keep showing pending cheque rows until Accounting confirms actual money received.
5. Pipeline/status labels should not imply the money is fully received when only cheque receipt exists.

## Implementation Plan

1. Audit Step 04 close logic.
   - Find the handler that saves Step 04 and advances to Step 05.
   - Replace any final-close condition that checks only `paidIdxSet` with a shared `isInstallReadyPayment(idx)` helper using `paidIdxSet || chequeReceivedIdxSet`.
   - Keep accounting-paid checks separate, using `paidIdxSet` only.

2. Add explicit UI messaging for cheque-ready state.
   - In installment rows, keep showing `รอรับเงิน` after `ยืนยันรับเช็ค`.
   - Near the install schedule/save area, show a small warning/info state when Step 04 can be closed because cheque was received but money is still pending.
   - In Step 04 DONE, keep the `รอรับเงินจากเช็ค` section and button for Accounting/Admin.

3. Align Step 05 transition.
   - Confirm the lead moves from Step 04 to Step 05 after Sale saves installation date.
   - Ensure Step 05 does not require `confirmed_at` for cheque rows before rendering/activation.
   - Keep Accounting action available by allowing Step 04 done content to remain visible/expandable.

4. Align Pipeline and reports.
   - Decide whether the `รอติดตั้ง` pipeline tab should include cheque-received leads.
   - If yes, update the tab filter to use "install-ready" count/state, not fully paid count.
   - Keep Pending Approval / Accounting report showing cheque-received pending rows until final money confirmation.

5. Add verification cases.
   - Cheque path: create/confirm cheque receipt, Sale schedules install, Step 04 closes, Step 05 opens, Accounting still sees final confirm button.
   - Non-cheque path: existing confirmed payment still works as before.
   - Negative case: cheque not received and no confirmed before-install payment cannot close Step 04.
   - Permission case: Sale cannot confirm final cheque money; Accounting/Admin can.

## Files Expected To Change

- `src/components/lead/detail/steps/OrderStep.tsx`
- `src/app/(app)/pipeline/page.tsx` if pipeline tab alignment is included
- Possibly shared helpers if payment readiness logic should be reused

## Open Decision

Should the pipeline `รอติดตั้ง` tab count cheque-received leads as install-ready immediately, even though the accounting amount is still pending? Recommended: yes, but show a visual `รอรับเงินเช็ค` marker so Sales/Install can proceed while Accounting still has a clear pending-money queue.
