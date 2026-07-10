# Step 5 Cheque Action Layout

## Status

done

## Goal

Match the Step 4 cheque-review controls in Step 5: use a full-width final
money-confirmation button, provide a full-width reject/re-upload action, and
remove the browser-native confirmation prompt.

## Changes

- Make Step 5 `ยืนยันรับเงิน` a single full-width button.
- Add `ไม่อนุมัติ / ส่งกลับให้ upload ใหม่` beneath it for Account/Admin.
- Show a custom reason modal for rejection; no browser prompt/confirm dialog.
- Ensure rejecting a received-but-unconfirmed cheque removes its interim
  payment record so Sales can upload fresh evidence.

## Verification

- Account/Admin sees both full-width actions for a received cheque in Step 5.
- Final confirmation has no native browser dialog.
- Rejection requires a reason, returns the payment to upload state, and logs it.
- TypeScript and targeted ESLint pass.

## Result

- The Step 5 final-confirmation action is a full-width `ยืนยันรับเงิน` button.
- Account/Admin also sees a full-width rejection/re-upload action.
- Rejection uses a custom reason modal and clears an interim received-cheque
  payment row so a fresh upload can be submitted.
- The native browser confirmation prompt was removed.
- Targeted ESLint, TypeScript, and `git diff --check` passed.
