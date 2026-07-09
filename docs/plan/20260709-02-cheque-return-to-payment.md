# Cheque Return To Payment Step

## Goal

After accounting clicks `ยืนยันรับเช็ค`, the same pending row should allow accounting to return directly to workflow step 04 (`OrderStep`) and confirm actual money received from the cheque.

The user should not have to manually find the order step, switch substep, or open the installment row.

## Current Finding

- `OrderStep` stores its substep in localStorage as `orderSubStep_<leadId>`.
- The payment substep for order/installments is substep index `1`.
- `/report/pending` currently renders final `ยืนยันรับเงิน` as a plain `LeadLink`.
- `LeadLink` opens `/leads/<id>` or `/leads/<id>?focus=1` through `useOpenLead`.
- It does not set `orderSubStep_<leadId> = 1`.
- It does not tell `OrderStep` which installment row (`order_installment_<index>`) to expand.
- `OrderStep` keeps the expanded payment row in component state (`paymentRow`), so there is no direct deep-link support yet.

Result: after cheque step 1, clicking `ยืนยันรับเงิน` may open the lead, but if the saved localStorage is still at `นัดหมาย` or another substep, the user will not reliably land on the payment confirmation UI.

## Proposed Behavior

For cheque rows where:

- `payment_method = 'cheque'`
- `cheque_received_at IS NOT NULL`
- `confirmed_at IS NULL`

the `ยืนยันรับเงิน` button on `/report/pending` should:

1. Set `localStorage["orderSubStep_<leadId>"] = "1"`.
2. Set a new short-lived localStorage key such as `orderPaymentRow_<leadId> = "<index>"`.
3. Open the lead detail.
4. `OrderStep` reads `orderPaymentRow_<leadId>` on mount, opens that installment row, then removes the key.
5. The user sees step 04 / `งวดชำระ` with that exact installment expanded and can click final `ยืนยันรับเงิน`.

## Implementation Plan

1. Add helper in `/report/pending`
   - Parse installment index from `slip_field = order_installment_<index>`.
   - For cheque final confirmation button, intercept click instead of plain `LeadLink`.
   - Write localStorage keys before navigation.
   - Preserve desktop behavior of opening a focused lead tab where possible.

2. Update `OrderStep`
   - On mount, read `orderPaymentRow_<leadId>`.
   - Validate it is a number within the installment array.
   - Set `paymentRow` to that index.
   - Remove the key so it does not keep reopening forever.
   - Keep existing localStorage substep behavior unchanged.

3. Optional polish
   - Add a small badge near the expanded row: `รอรับเงิน`.
   - Scroll to active step after mount if not already visible.

## Verification

1. Mark a cheque payment as `ยืนยันรับเช็ค`.
2. Confirm the pending row changes to `รอรับเงิน` + `ยืนยันรับเงิน`.
3. Click `ยืนยันรับเงิน`.
4. Confirm the lead opens at step 04 / `งวดชำระ`.
5. Confirm the matching installment row is expanded.
6. Confirm final payment flow can be completed.

