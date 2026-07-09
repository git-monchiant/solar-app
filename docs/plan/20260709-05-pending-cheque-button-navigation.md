# Pending Cheque Button Navigation

## Status

done

## Goal

Improve the Pending Approval page for cheque payments so Accounting can clearly distinguish between:

- receiving the cheque document,
- confirming actual money received after the cheque clears.

Also make each button navigate to the correct Step 04 context after it is clicked.

## Requested Behavior

1. On `/report/pending`, show cheque statuses differently:
   - `ยืนยันรับเช็ค`: first action for cheque payments that have not been received yet.
   - `ยืนยันรับเงิน`: second action for cheque payments where the cheque was already received but money is still pending.
   - Status labels/badges should visually differ, for example:
     - `รอรับเช็ค`
     - `รับเช็คแล้ว / รอรับเงิน`

2. When clicking `ยืนยันรับเช็ค`:
   - call the existing cheque-received API,
   - then open the lead detail at Step 04,
   - select substep `งวดชำระเงิน`,
   - open/focus the related installment row.

3. When clicking `ยืนยันรับเงิน`:
   - open the lead detail at Step 04,
   - show the Accounting final money confirmation button for that cheque row,
   - focus the related installment/payment row or done-state cheque confirmation section.

## Current Code Notes

- `/report/pending` is implemented at `src/app/(app)/report/pending/page.tsx`.
- Existing helper `openAtOrderPayment(leadId, slipField)` already sets:
  - `orderSubStep_<leadId> = "1"`
  - `orderPaymentRow_<leadId> = <installment index>`
- `markChequeReceived(paymentId)` currently PATCHes `{ cheque_received: true }` and updates local state, but does not navigate.
- `OrderStep` already reads `orderSubStep_*` and `orderPaymentRow_*` to open Step 04 payment substep/installment row.
- Step 04 DONE view already shows `รอรับเงินจากเช็ค` with an Accounting/Admin `ยืนยันรับเงิน` button.

## Implementation Plan

1. Refine Pending page state model.
   - Add small helpers:
     - `isChequeWaitingReceive(inst)`
     - `isChequeWaitingMoney(inst)`
     - `getPendingStatusLabel(inst)`
   - Use those helpers for both mobile and desktop rows.

2. Make action buttons visually distinct.
   - For `ยืนยันรับเช็ค`, use a cheque-receipt style such as amber outline/solid with label `ยืนยันรับเช็ค`.
   - For `ยืนยันรับเงิน`, use a money-confirm style such as emerald/primary with label `ยืนยันรับเงิน`.
   - Add different badges beside the installment label:
     - before cheque received: `รอรับเช็ค`
     - after cheque received: `รับเช็คแล้ว · รอรับเงิน`

3. Navigate after `ยืนยันรับเช็ค`.
   - Change `markChequeReceived` to receive the whole pending item, not only `paymentId`.
   - After the PATCH succeeds, set localStorage:
     - `orderSubStep_<leadId> = "1"`
     - `orderPaymentRow_<leadId> = <idx from slip_field>`
   - Then call `openLead(leadId)`.
   - Keep local state update as a fallback only if navigation is blocked or delayed.

4. Navigate for `ยืนยันรับเงิน`.
   - Keep using Step 04 navigation context.
   - Set `orderSubStep_<leadId> = "1"` and `orderPaymentRow_<leadId> = <idx>`.
   - Also add a more explicit focus flag if needed, for example:
     - `orderChequeConfirm_<leadId> = <paymentId>`
   - In `OrderStep`, optionally read this flag to scroll to/highlight the `รอรับเงินจากเช็ค` section when Step 04 is already DONE.

5. Preserve non-cheque behavior.
   - Transfer/card/other pending rows should continue to show a normal `ยืนยันรับเงิน` action and open lead detail as before.
   - Do not change actual payment confirmation rules in this plan.

6. Verification.
   - Cheque not received: Pending shows `รอรับเช็ค`, button `ยืนยันรับเช็ค`; clicking opens Step 04 > `งวดชำระเงิน`.
   - Cheque received, money pending: Pending shows `รับเช็คแล้ว · รอรับเงิน`, button `ยืนยันรับเงิน`; clicking opens Step 04 and focuses the final Accounting button.
   - Normal payment: Pending still shows `ยืนยันรับเงิน` and opens the lead.
   - `npx tsc --noEmit --pretty false`
   - Targeted eslint for Pending page and OrderStep.

## Files Expected To Change

- `src/app/(app)/report/pending/page.tsx`
- `src/components/lead/detail/steps/OrderStep.tsx` only if the extra `orderChequeConfirm_*` focus flag is needed

## Recommendation

Implement the navigation with localStorage flags first because this matches the existing Step 04 deep-link pattern and keeps the change small. Add the extra `orderChequeConfirm_*` focus flag only if Step 04 DONE does not reliably scroll to the Accounting final money button.
