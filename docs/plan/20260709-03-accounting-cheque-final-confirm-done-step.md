# Accounting Cheque Final Confirm In Done Order Step

## Problem

Accounting can click `ยืนยันรับเช็ค` and the lead may continue to install scheduling. After that, step 04 (`OrderStep`) becomes `DONE`.

The current deep-link sets:

- `orderSubStep_<leadId> = 1`
- `orderPaymentRow_<leadId> = <installmentIndex>`

However, this does not help once step 04 is `DONE`, because `StepLayout` renders only:

- `doneHeader`
- `renderDoneContent`

It does not render the active `OrderStep` children where `PaymentSection` and the final `ยืนยันรับเงิน` button live.

Result: Accounting can open the lead, but cannot complete the final cheque money confirmation from step 04 after the cheque clears.

## Recommended Fix

Add an accounting-only final cheque confirmation action inside step 04's done view.

This is safer than forcing a done workflow step back into active mode, because order/install scheduling data remains locked while accounting can still finish the payment state.

## Proposed Behavior

In `OrderStep.renderDoneContent`, show a `รอรับเงินจากเช็ค` section when a payment row matches:

- `payment_method = 'cheque'`
- `cheque_received_at IS NOT NULL`
- `confirmed_at IS NULL`
- `slip_field LIKE 'order_installment_%'`

For each matching row:

- Show installment label, amount, and status `รอรับเงิน`
- Show button `ยืนยันรับเงิน`
- Button is visible only for `account` or `admin`
- On click, final-confirm the existing payment row
- After success, refresh lead/payment data; the row disappears from `รอรับเงิน`

## Backend Plan

The existing `/api/payments` final confirm endpoint requires staging `slip_files` rows and can update an existing pending payment by `(lead_id, step_no, slip_field)`.

Two possible approaches:

1. Reuse `/api/payments`
   - From the done-view action, POST:
     - `lead_id`
     - `step_no`
     - `slip_field`
     - `amount`
     - `description`
     - `doc_no`
     - `payment_method = 'cheque'`
   - Works only if `slip_files` are still present after `ยืนยันรับเช็ค`.

2. Add a dedicated action endpoint, recommended:
   - `PATCH /api/payments/:id` with `{ confirm_received_money: true }`
   - For cheque rows only
   - Requires `cheque_received_at IS NOT NULL`
   - Moves submitted `slip_files` into the payment slots if still present
   - Sets `confirmed_at`, `confirmed_by`
   - Calls `syncOrderPaidFlags`
   - Logs activity `ยืนยันรับเงินจากเช็ค`

Recommended: option 2, because it targets the known payment id and avoids relying on UI to rebuild all POST body fields correctly.

## Frontend Plan

1. Extend `/api/payments?lead_id=...`
   - Return `cheque_received_at`, `payment_method`, amount, step_no, slip_field, and id. Some fields already exist after prior cheque work.

2. In `OrderStep`
   - Keep loading `payments` rows as today.
   - Store pending cheque-final rows in local state.
   - Render a done-view section `รอรับเงินจากเช็ค` for account/admin.
   - Add `ยืนยันรับเงิน` button per row.

3. In `/report/pending`
   - Keep the existing deep-link behavior.
   - Optionally change final `ยืนยันรับเงิน` for cheque-received rows to call the dedicated endpoint directly, or keep opening the lead where the new done-view action is available.

## Verification

1. Create/select an installment paid by cheque.
2. Upload cheque evidence and submit to accounting.
3. Click `ยืนยันรับเช็ค`.
4. Advance/install scheduling so step 04 becomes `DONE`.
5. Open lead as Accounting.
6. Expand step 04.
7. Confirm `รอรับเงินจากเช็ค` section appears.
8. Click `ยืนยันรับเงิน`.
9. Confirm payment row sets `confirmed_at`.
10. Confirm pending approval row disappears.
11. Confirm received totals and receipts now include the amount.

