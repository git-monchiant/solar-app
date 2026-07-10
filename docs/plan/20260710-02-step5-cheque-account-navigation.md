# Step 05 Cheque Accounting Navigation

## Status

done

## Goal

For a cheque submitted from Step 05 (`Install > เก็บเงิน`, stored as
`order_after_slip` / step 99), make the Accounting flow:

1. Accounting clicks `ยืนยันรับเช็ค` from `/report/pending`.
2. The system records physical cheque receipt immediately without asking for
   cheque number, bank, or due date.
3. The lead opens at Step 05, sub-step `เก็บเงิน`.
4. The same payment shows `รับเช็คแล้ว · รอรับเงิน` with a visible
   `ยืนยันรับเงิน` action for Account/Admin.
5. When money enters the company account, Accounting confirms it from Step 05.

`confirmed_at` remains the only source of truth for received cash.

## Navigation Rules

Classify the payment context by `slip_field`:

- `order_after_slip` (or legacy step 99): Step 05 / Install / `เก็บเงิน`
- `order_installment_<index>`: Step 04 / Order / installment row
- Other payment fields: keep their existing destination

For the Step 05 deep-link, set before opening the lead:

- `leadFocusStep_<leadId> = 4`
- `leadForceActiveStep_<leadId> = 4` when Step 05 is already done
- `installSubStep_<leadId> = 3`
- `installChequeConfirm_<leadId> = <paymentId>` for scroll/highlight

Do not reuse the Step 04 helper, which currently hardcodes
`leadFocusStep_<leadId> = 3`.

## Pending Accounting Page

- Remove the receipt-time prompt chain (`เลขที่เช็ค`, bank, due date).
- `ยืนยันรับเช็ค` sends only `{ cheque_received: true }`.
- After success, branch by payment context and open the correct workflow step.
- For a Step 05 cheque already received, `ยืนยันรับเงิน` opens Step 05 / `เก็บเงิน`
  instead of confirming directly on the report page.
- Keep optional cheque metadata editing separate from the required receipt flow;
  it must never block receipt or navigation.

## Step 05 UI

- Extend the loaded `order_after_slip` cheque state with payment id,
  `cheque_received_at`, amount, lifecycle status, and evidence URLs.
- In `InstallStep` sub-step 3, show an amber pending-cheque panel when
  `cheque_received_at` is set and `confirmed_at` is null.
- Account/Admin sees `ยืนยันรับเงิน`; other roles see `รอฝ่ายบัญชียืนยันรับเงิน`.
- The final button calls `PATCH /api/payments/:id` with
  `{ confirm_received_money: true }`, reloads payment state, and refreshes the lead.
- Consume `installChequeConfirm_<leadId>` once, scroll to the panel, and highlight it.
- Ensure staged cheque evidence remains visible even when receipt was recorded by
  PATCH and the evidence has not yet moved into `payments.slip_data`.

## Backend

- Reuse the existing cheque receipt and final-confirm endpoints.
- Do not require cheque number for either action.
- Keep final confirmation restricted to Account/Admin.
- Preserve idempotency for repeated receipt clicks and reject final confirmation
  when receipt has not happened yet.

## Verification

1. Submit a cheque from Step 05 / `เก็บเงิน` as Sales/Solar.
2. Open `/report/pending` as Account.
3. Click `ยืนยันรับเช็ค`; confirm that no prompt appears.
4. Confirm the lead opens at Step 05 / `เก็บเงิน` and the correct payment is highlighted.
5. Confirm Sales can continue the handover flow after cheque receipt.
6. Confirm financial received totals still exclude the cheque.
7. Open the same pending item and confirm it routes to Step 05 again.
8. Click `ยืนยันรับเงิน` in Step 05 as Account.
9. Confirm `confirmed_at` is set, `order_after_paid` syncs, the pending item disappears,
   and received totals include the amount.
10. Verify Step 04 cheque navigation and non-cheque flows are unchanged.

## Post-Implementation Fix

- Fixed `syncOrderPaidFlags` so a confirmed Step 05 `order_after_slip` row sets
  `leads.order_after_paid = true`; the old implementation only considered
  `order_installment_*` rows and reset the flag to false.
- A pending/rejected `order_after_slip` now takes precedence and keeps the gate
  locked until that exact payment is confirmed.
- `InstallStep` also derives readiness directly from the `order_after_slip`
  payment row, so a stale lead flag cannot block a confirmed payment.
- Repaired the affected dev record for lead 644 (house 7/147) after verifying
  that payment 330 was already confirmed.
- Simplified the Pending Accounting UI by hiding the optional cheque lifecycle
  buttons (`ข้อมูลเช็ค`, `นำฝากแล้ว`, `เช็คเด้ง`, `ยกเลิก`); the primary receive
  and final money-confirmation flow remains visible.
- For Step 04 cheque submissions, the Pending button now opens the installment
  review without pre-confirming receipt. Accounting sees `ยืนยันรับเช็ค` plus
  `ไม่อนุมัติ / ส่งกลับให้อัปโหลดใหม่`; after receipt, the final action is
  labelled `ยืนยันรับเงิน`. Step 05 keeps its separate agreed deep-link flow.
