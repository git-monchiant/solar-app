# Combine Step 5 Final Payment

## Status

done

## Goal

Combine the final after-install installment and the currently outstanding
installation extra cost into one Step 5 payment, one evidence set, and one
Accounting confirmation while retaining a clear accounting breakdown.

## Scope

- Render one combined payment card when exactly one final after-install
  installment (or the legacy final balance) and an extra cost are both due.
- Store the combined amount on the final-installment payment row so existing
  payment, cheque, Pending, and reporting workflows continue to use one record.
- Derive the extra-cost allocation from the combined row without counting it as
  order principal.
- Keep later extra-cost increases as a new incremental extra-payment row.
- Show the installment and extra cost as separate details on the payment request
  and receipt.
- Preserve existing separate payments and confirmed historical records.

## Verification

- A final installment of 100,000 and extra cost of 5,000 renders one payment for
  105,000 with two detail lines.
- Transfer/QR uses one evidence set and one Accounting confirmation.
- Cheque uses one receive-cheque action and one final receive-money action.
- Confirming the combined row clears both Step 5 obligations without double
  counting the extra cost.
- Raising the extra total from 5,000 to 8,000 after confirmation creates only a
  new 3,000 extra-payment item.
- Existing separate and legacy records remain readable.

## Result

- Step 5 renders one combined card for the last unpaid after-install installment
  and the current extra-cost balance.
- The combined payment reuses the installment identity, evidence, Accounting
  approval, and cheque lifecycle as one transaction.
- Confirmed combined rows allocate only the amount above the planned installment
  to extra cost, so a later increase creates only the incremental extra balance.
- Combined rows persist their exact base/extra allocation in the description so
  installment rounding and receipt line items remain stable after confirmation.
- Pending identifies the transaction as a combined Step 5 payment, while the
  receipt keeps installment and extra cost on separate lines.
- Existing submitted separate payments are preserved instead of being silently
  converted into a combined transaction.
- Payment-request tokens now wait for the canonical payment id, and the invoice
  page server-renders so combined-payment PDFs download reliably in development
  without depending on client hydration or HMR.
- TypeScript, targeted ESLint, and `git diff --check` completed successfully.
