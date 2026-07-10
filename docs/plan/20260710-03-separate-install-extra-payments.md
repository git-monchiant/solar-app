# Separate Install Extra Payments

## Status

done

## Goal

Separate Step 05's original outstanding balance from installation extra costs so
Accounting sees and approves only the actual additional amount that remains unpaid.

## Payment Keys

- Keep `order_after_slip` for the original post-install outstanding balance.
- Store each additional-cost collection as `install_extra_<sequence>`.
- Reuse an unconfirmed extra row while its amount changes.
- After an extra row is confirmed, a later increase creates the next sequence and
  collects only `install_extra_cost - confirmed_extra_total`.

## UI and Workflow

- Step 05 renders separate payment cards for outstanding balance and extra cost.
- Each card supports transfer/QR/cheque independently.
- Receiving an extra-cost cheque allows handover to continue, but only
  `confirmed_at` counts it as received cash.
- Navigation from Pending routes every `install_extra_*` item to Step 05 / เก็บเงิน.

## Reporting

- Pending shows `Step 5 · ค่าใช้จ่ายเพิ่มเติม` and the exact incremental amount.
- Received totals include confirmed `order_after_slip` and `install_extra_*` rows.
- A pending/rejected extra payment does not inflate received totals.

## Legacy Data Compatibility

- A confirmed legacy `order_after_slip` whose description includes
  `ค่าใช้จ่ายเพิ่มเติม` is treated as already covering the extra cost, preventing
  the same surcharge from being collected again.
- Empty cheque drafts without submitted evidence are excluded from Pending.
- Existing confirmed financial records are not rewritten.

## Verification

- Extra cost 5,000 with zero original balance creates Pending amount 5,000.
- Remaining 100,000 plus extra 5,000 produces two distinct Pending rows.
- After confirming 5,000, increasing extra total to 8,000 creates a new 3,000 row.
- Cheque receipt and final Account confirmation work for each extra row.
- Non-extra Step 04 and Step 05 payments remain unchanged.

## Result

- Implemented separate `order_after_slip` and `install_extra_<sequence>` cards.
- Pending and received reporting recognize the new extra-payment keys.
- Legacy combined confirmations remain compatible without a database data edit.
- Targeted ESLint completed with zero errors (existing warnings only), TypeScript
  completed successfully, and `git diff --check` passed.
