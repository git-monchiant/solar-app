# Plan Status

Use this file to track every plan created under `docs/plan/`.

Statuses:
- `backlog`: planned but not started
- `in-progress`: currently being implemented
- `done`: implemented and verified
- `cancelled`: no longer planned

| Plan | Status | Mockup | Notes |
| --- | --- | --- | --- |
| [20260709-01-cheque-two-step-payment.md](20260709-01-cheque-two-step-payment.md) | done | - | เพิ่ม flow เช็ค 2 step: ยืนยันรับเช็ค -> รอรับเงิน -> ยืนยันรับเงิน |
| [20260709-02-cheque-return-to-payment.md](20260709-02-cheque-return-to-payment.md) | done | - | พา user จากรอรับเงินเช็คกลับไป step 04 / งวดชำระ พร้อมเปิดงวดที่ต้องยืนยันรับเงิน |
| [20260709-03-accounting-cheque-final-confirm-done-step.md](20260709-03-accounting-cheque-final-confirm-done-step.md) | done | - | ให้ Accounting ยืนยันรับเงินจริงจากเช็คได้แม้ Step 04 เป็น DONE แล้ว |
| [20260709-04-cheque-install-schedule-before-money.md](20260709-04-cheque-install-schedule-before-money.md) | done | - | Allow Sale to schedule install and close Step 04 after cheque receipt while Accounting can confirm actual money later from Step 04 |
| [20260709-05-pending-cheque-button-navigation.md](20260709-05-pending-cheque-button-navigation.md) | done | - | Improve Pending cheque status/buttons and navigate receive-cheque or receive-money actions to the correct Step 04 context |
| [20260710-01-cheque-workflow-hardening.md](20260710-01-cheque-workflow-hardening.md) | done | - | Add cheque due-date/deposit/failure tracking; reserve accounting lifecycle and final money approval for Account/Admin |
| [20260710-02-step5-cheque-account-navigation.md](20260710-02-step5-cheque-account-navigation.md) | done | - | Route Step 05 cheque receipt/final confirmation to Install > เก็บเงิน without requiring cheque-number input |
