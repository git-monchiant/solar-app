# Cheque Payment Flow Review

Date: 2026-07-10
Commit reviewed: `7abb9d6` - `ปรับขั้นตอนรับเช็คและยืนยันรับเงิน`

## Summary

The cheque payment flow now separates receiving a cheque from confirming that money has entered the company account.

## Main Flow

1. Accounting/Admin receives the cheque.
   - Action: `ยืนยันรับเช็ค`
   - Data written: `payments.cheque_received_at`, `payments.cheque_received_by`
   - The installment is not treated as paid yet.
   - UI status becomes `รอรับเงิน`.

2. Accounting/Admin confirms the cheque money has cleared.
   - Action: `ยืนยันชำระเงิน` / `ยืนยันรับเงิน`
   - Data written: `payments.confirmed_at`, `payments.confirmed_by`
   - The installment becomes `ชำระแล้ว`.

## Database

Migration:

- `sql/125_payments_cheque_received.sql`

Added columns:

- `payments.cheque_received_at`
- `payments.cheque_received_by`

## Step 04 Behavior

In `Step 04 > งวดชำระเงิน`:

- Every installment can be marked as `เช็ค`.
- If a cheque has been received but money has not cleared, the installment shows `รอรับเงิน`.
- Opening that installment shows the uploaded cheque evidence.
- Accounting/Admin can press `ยืนยันชำระเงิน`.
- For split payments with 2, 3, or 4 installments, cheque confirmation stays on the same `งวดชำระเงิน` page.

In `Step 04 > ยืนยัน`:

- The separate cheque waiting-money panel was removed.
- Cheque money confirmation should happen from `งวดชำระเงิน` only.

## Pending Approval Page

The Pending page distinguishes cheque statuses:

- `รอรับเช็ค`
- `รับเช็คแล้ว · รอรับเงิน`

Navigation rules:

- `ยืนยันรับเช็ค` opens Step 04 payment installments.
- `ยืนยันรับเงิน` opens Step 04 payment installments for split-payment cheque cases.
- Single-installment cheque cases can still open the final confirmation flow.

## Install Scheduling

For cheque payments:

- Receiving the cheque is enough for Sales to continue to install scheduling.
- Actual money confirmation remains pending for Accounting/Admin.

## Important APIs

- `POST /api/payments`
  - For cheque, records cheque receipt without setting `confirmed_at`.
  - Has idempotent handling for already received cheques.

- `PATCH /api/payments/[id]`
  - `{ cheque_received: true }` records cheque receipt.
  - `{ confirm_received_money: true }` confirms cleared money.

- `GET /api/report/payments`
  - Includes cheque status fields and installment plan data for Pending navigation.

## Key UI Files

- `src/components/lead/detail/steps/OrderStep.tsx`
- `src/components/payment/PaymentSection.tsx`
- `src/app/(app)/report/pending/page.tsx`
- `src/app/(app)/leads/[id]/page.tsx`
- `src/app/(app)/pipeline/page.tsx`
- `src/components/lead/LeadCard.tsx`

## Current Known State

- Last committed implementation: `7abb9d6`
- `next.config.ts` and `src/components/lead/detail/steps/InstallStep.tsx` were dirty after the commit and were not part of this review note.
