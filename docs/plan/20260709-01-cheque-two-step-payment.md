# Cheque Two-Step Payment Confirmation

## Goal

For installment rows paid by cheque, split the accounting confirmation into two steps:

1. `ยืนยันรับเช็ค` records that the cheque document was received.
2. The same pending item then changes to `ยืนยันรับเงิน`, which records that the cheque has cleared and money was actually received.

After step 1, the lead should be allowed to continue into the install scheduling process with a visible status of `รอรับเงิน`.

## Current Behavior

- Installment payments are represented by `payments` rows keyed by `order_installment_<index>`.
- Uploaded evidence is staged in `slip_files`.
- A pending accounting item appears on `/report/pending` when:
  - `payments.confirmed_at IS NULL`
  - submitted evidence exists in `slip_files`
- Pressing the current `ยืนยันรับเงิน` path eventually writes `payments.confirmed_at`, which means the system treats the installment as paid.
- Order scheduling gates currently look at confirmed payment rows only.

## Proposed Data Model

Add cheque-specific intermediate fields to `payments`:

- `cheque_received_at DATETIME2 NULL`
- `cheque_received_by NVARCHAR(100) NULL`

Keep using existing fields for final money receipt:

- `confirmed_at`
- `confirmed_by`

Reason: `confirmed_at` must remain the source of truth for actual money received, reports, receipts, and accounting totals. The cheque-received step should not inflate received cash.

## Backend Changes

1. Create a migration, for example:
   - `sql/125_payments_cheque_received.sql`

2. Update `/api/payments/[id] PATCH`
   - Accept a dedicated action such as `{ cheque_received: true }`.
   - Only allow it when `payment_method = 'cheque'`.
   - Set `cheque_received_at` and `cheque_received_by`.
   - Do not set `confirmed_at`.
   - Log activity/payment log: `รับเช็คแล้ว`.

3. Update `/api/payments` confirm flow
   - For final confirmation, keep existing behavior that moves staged evidence from `slip_files` into `payments.slip_data`.
   - Preserve `payment_method = 'cheque'`.
   - Set `confirmed_at` only on final `ยืนยันรับเงิน`.

4. Update report API `/api/report/payments`
   - Include `payment_method`, `cheque_received_at`, and `cheque_received_by` in each installment item.
   - Pending queue should still include cheque rows where:
     - `payment_method = 'cheque'`
     - `confirmed_at IS NULL`
     - and either submitted evidence exists or `cheque_received_at IS NOT NULL`

## Frontend Changes

1. Pending approval page `/report/pending`
   - If `payment_method !== 'cheque'`: keep button as `ยืนยันรับเงิน`.
   - If `payment_method === 'cheque'` and `cheque_received_at IS NULL`: show `ยืนยันรับเช็ค`.
   - If `payment_method === 'cheque'` and `cheque_received_at IS NOT NULL`: show status chip `รอรับเงิน` and button `ยืนยันรับเงิน`.
   - Keep the item in the pending list until final `confirmed_at` is set.

2. Lead order step
   - Treat `cheque_received_at` as enough to pass from `งวดชำระ` to `นัดหมาย`.
   - Do not treat it as paid for final accounting/receipt.
   - For cheque rows awaiting clearing, show status `รอรับเงิน`.
   - When saving/advancing to install scheduling, allow the same path as a paid-before-install row, but keep final close/payment validation based on `confirmed_at` if business rule still requires actual money before install.

3. Lead cards / pipeline status
   - If the first before-install cheque has been received but not cleared, show the lead in the install scheduling lane/status (`รอนัดติดตั้ง`) with a small `รอรับเงิน` badge.
   - Keep financial totals as pending, not received.

## Edge Cases

- Non-cheque payments should behave exactly as today.
- If a cheque payment is rejected after step 1, clear `cheque_received_at` and keep the existing rejection flow.
- Undo payment should clear both final confirmation fields and cheque-received fields.
- If a user changes an installment away from cheque before confirmation, clear any stale cheque-received state on the pending payment row.

## Verification Plan

1. Select `เช็ค` on an installment and upload evidence.
2. Submit evidence to accounting.
3. Open `/report/pending`.
4. Confirm the first button says `ยืนยันรับเช็ค`.
5. Click it.
6. Confirm the row remains in pending, shows `รอรับเงิน`, and the button changes to `ยืนยันรับเงิน`.
7. Confirm the lead can proceed to `นัดหมาย` / install scheduling.
8. Confirm accounting totals do not count the amount as received yet.
9. Click `ยืนยันรับเงิน`.
10. Confirm `confirmed_at` is set, the row disappears from pending, receipts work, and received totals include the amount.

