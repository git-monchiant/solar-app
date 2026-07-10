# Cheque Workflow Hardening

## Status

done

## Goal

Make the existing two-stage cheque flow safe and operational for Accounting:

1. Receiving a cheque lets Sales continue to installation scheduling.
2. Receiving a cheque does not count as received cash.
3. The uploader can record physical cheque receipt so the job can continue, while
   only Accounting/Admin can deposit, reject, cancel, or finally confirm it.
4. Accounting can track cheque due dates and failed cheques from the pending queue.

## Data Model

Add nullable fields to `payments`:

- `cheque_bank NVARCHAR(100)`
- `cheque_due_date DATE`
- `cheque_deposited_at DATETIME2`
- `cheque_status NVARCHAR(20)` using `received`, `deposited`, `bounced`, or `cancelled`
- `cheque_status_note NVARCHAR(500)`
- `cheque_status_by NVARCHAR(100)`
- `cheque_status_at DATETIME2`

Existing `cheque_received_at` remains the installation scheduling gate. Existing
`confirmed_at` remains the only source of truth for received money.

## Backend

- Require `account` or `admin` for deposit, reject, cancel, detail correction, and
  final money confirmation. Keep initial physical receipt available to the uploader.
- Extend cheque receipt to accept bank, due date, and cheque number.
- Add a deposit action that records when Accounting sent the cheque for clearing.
- Add bounced/cancelled actions that clear the installation-ready cheque receipt
  state, keep the evidence and audit history, and never set `confirmed_at`.
- Final money confirmation remains valid only after cheque receipt and changes the
  lifecycle to cleared through the existing `confirmed_at` fields.
- Return all lifecycle fields from payment and pending-report APIs.

## Frontend

- Pending Accounting queue shows cheque bank/number/due date and overdue state.
- Receiving a cheque prompts for the operational cheque details.
- A received cheque can be marked deposited, bounced, or cancelled.
- A deposited/received cheque can be finally confirmed after the money clears.
- Step 04 continues to show cheque waiting status even after the order step is done.

## Verification

- Non-Account users receive HTTP 403 for deposit, detail correction, bounced,
  cancelled, and final-confirm actions.
- Receiving a cheque sets `cheque_received_at` but not `confirmed_at`.
- The lead can continue to installation scheduling after receipt.
- Depositing a cheque does not count it as received cash.
- Bounced/cancelled cheque clears installation readiness and stays unconfirmed.
- Final Account confirmation sets `confirmed_at` and removes the row from pending.
- Existing transfer/QR/card payment behavior remains unchanged.

## Follow-up Correction (2026-07-10)

- Added the dedicated `เช็ค` tab to Step 05 / Install / `เก็บเงิน`, not only
  to Step 04 order installments.
- Step 05 can continue to handover after `cheque_received_at` while keeping
  `confirmed_at` null until Accounting confirms actual money.
- The Accounting pending queue can final-confirm cheque money directly by
  payment id, including `order_after_slip` payments from Step 05.
