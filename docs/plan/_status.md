# Plan Status

Use this file to track every plan created under `docs/plan/`.

Statuses:
- `backlog`: planned but not started
- `in-progress`: currently being implemented
- `done`: implemented and verified
- `cancelled`: no longer planned

| Plan | Status | Mockup | Notes |
| --- | --- | --- | --- |
| [20260811-02-quotation-approval-notifications.md](20260811-02-quotation-approval-notifications.md) | done | - | เพิ่ม in-app notification และย้ายทางเข้าหลักเป็นกระดิ่งพร้อม dropdown ที่ Header; ตรวจ desktop/mobile, API, lint, type และ build ผ่าน โดยไม่เชื่อม LINE |
| [20260811-01-quotation-om-editor.md](20260811-01-quotation-om-editor.md) | done | - | เพิ่ม O&M accordion, dropdown ตัวเลข 0–4, snapshot ต่อใบ, reset มาตรฐาน และสร้างข้อความ PDF แบบจัดเลขอัตโนมัติ; test/lint/type-check/build ผ่าน |
| [20260804-01-package-master-excel-alignment.md](20260804-01-package-master-excel-alignment.md) | in-progress | - | กำลังปรับ 22 Package/รายการอุปกรณ์ตาม Excel, ปิด Battery 4.8 ที่ไม่มีในต้นฉบับ และ refresh เฉพาะ Draft อัตโนมัติ พร้อม rollback |
| [20260801-02-survey-layout-sketch-upload.md](20260801-02-survey-layout-sketch-upload.md) | done | - | เพิ่มผังร่างใน Survey/Photos/PDF, apply migration 133 ที่ Development และตรวจ Build/PDF/schema ผ่าน |
| [20260801-01-quotation-terms-payment-alignment.md](20260801-01-quotation-terms-payment-alignment.md) | done | - | แยกข้อความท้ายใบตามประเภท Package, ล็อกงวด 20/80 ตาม Excel, apply Development และตรวจ Build/PDF จริงผ่าน |
| [20260730-01-sequential-quotation-approval.md](20260730-01-sequential-quotation-approval.md) | done | - | เพิ่ม approval chain Sale → Solar Sup → Sale Sup, apply migration Development และตรวจ build/transition ผ่าน; รอกำหนดผู้ใช้ role Solar Sup |
| [20260722-02-step3-quotation-document-bundle.md](20260722-02-step3-quotation-document-bundle.md) | in-progress | - | ใช้ Report template กลางร่วมกับ `/api/survey-report/[leadId]`; รอ regression PDF 17 หน้า, Business UAT และอนุญาตก่อน Production |
| [20260709-01-cheque-two-step-payment.md](20260709-01-cheque-two-step-payment.md) | done | - | เพิ่ม flow เช็ค 2 step: ยืนยันรับเช็ค -> รอรับเงิน -> ยืนยันรับเงิน |
| [20260709-02-cheque-return-to-payment.md](20260709-02-cheque-return-to-payment.md) | done | - | พา user จากรอรับเงินเช็คกลับไป step 04 / งวดชำระ พร้อมเปิดงวดที่ต้องยืนยันรับเงิน |
| [20260709-03-accounting-cheque-final-confirm-done-step.md](20260709-03-accounting-cheque-final-confirm-done-step.md) | done | - | ให้ Accounting ยืนยันรับเงินจริงจากเช็คได้แม้ Step 04 เป็น DONE แล้ว |
| [20260709-04-cheque-install-schedule-before-money.md](20260709-04-cheque-install-schedule-before-money.md) | done | - | Allow Sale to schedule install and close Step 04 after cheque receipt while Accounting can confirm actual money later from Step 04 |
| [20260709-05-pending-cheque-button-navigation.md](20260709-05-pending-cheque-button-navigation.md) | done | - | Improve Pending cheque status/buttons and navigate receive-cheque or receive-money actions to the correct Step 04 context |
| [20260710-01-cheque-workflow-hardening.md](20260710-01-cheque-workflow-hardening.md) | done | - | Add cheque due-date/deposit/failure tracking; reserve accounting lifecycle and final money approval for Account/Admin |
| [20260710-02-step5-cheque-account-navigation.md](20260710-02-step5-cheque-account-navigation.md) | done | - | Route Step 05 cheque receipt/final confirmation to Install > เก็บเงิน without requiring cheque-number input |
| [20260710-03-separate-install-extra-payments.md](20260710-03-separate-install-extra-payments.md) | done | - | Separate Step 05 extra-cost payments so Pending shows only the incremental unpaid amount |
| [20260710-04-after-install-installments-step5.md](20260710-04-after-install-installments-step5.md) | done | - | Move installments marked after installation to Step 05 collection without duplicate balance rows |
| [20260710-05-payment-intent-race-hardening.md](20260710-05-payment-intent-race-hardening.md) | done | - | Prevent post-confirmation payment drafts and repair approved SM-260077 Development data |
| [20260710-06-step5-cheque-action-layout.md](20260710-06-step5-cheque-action-layout.md) | done | - | Make Step 05 cheque confirmation and rejection actions match the requested full-width layout |
| [20260714-01-lead-tracking-source-column.md](20260714-01-lead-tracking-source-column.md) | done | - | เพิ่มคอลัมน์ที่มาใน Lead Tracking และ Excel สำหรับ Admin, Sales, Solar และ Account; ไม่แสดงให้ Leads Seeker/Smartify |
| [20260714-02-require-received-money-before-install.md](20260714-02-require-received-money-before-install.md) | done | - | บังคับรับเงินจริงครบทุกงวดก่อนติดตั้ง และยกเว้นเฉพาะงวดที่ติ๊กจ่ายหลังติดตั้ง |
| [20260714-03-combine-step5-final-payment.md](20260714-03-combine-step5-final-payment.md) | done | - | รวมงวดสุดท้ายหลังติดตั้งและค่าใช้จ่ายเพิ่มเติมเป็นการชำระครั้งเดียว โดยยังแจกแจงยอดในเอกสาร |
| [20260715-01-customer-insight-dashboard.md](20260715-01-customer-insight-dashboard.md) | done | [wireframe](../mockup/20260715-01-customer-insight-dashboard/) | Hybrid Dashboard แสดงข้อมูลครบ พร้อม responsive layout, drill-down, PDF และ Excel export ตาม Filter |
| [20260716-01-dashboard-iii-popup-excel.md](20260716-01-dashboard-iii-popup-excel.md) | done | - | ปรับ popup Dashboard III ตาม Dashboard I และเพิ่ม Excel เฉพาะรายการใน popup |
| [20260717-01-grid-tie-document-timeline.md](20260717-01-grid-tie-document-timeline.md) | backlog | [interactive mockup](../mockup/20260717-01-grid-tie-document-timeline/) | ออกแบบ Timeline ขอขนานไฟ 6 ขั้น พร้อม Checklist, เอกสารหลักฐาน และ Gate ตามประเภทโครงการ |
| [20260720-01-step5-gridtie-draft.md](20260720-01-step5-gridtie-draft.md) | done | - | เพิ่มขอขนานไฟแบบ Draft ใน Step 5 หลังตรวจ ใช้ข้อมูลร่วมกับ Step 7 และไม่บล็อกการส่งมอบงานติดตั้ง |
| [20260720-02-quotation-package-options.md](20260720-02-quotation-package-options.md) | done | [interactive mockup](../mockup/20260720-02-quotation-package-options/) | ออกแบบ Step 03 ให้สร้างใบเสนอราคาได้สูงสุด 3 ฉบับจากแพ็กเกจหลักและ Add-on โดยคงหน้าตาตามระบบเดิม |
| [20260722-01-quotation-system.md](20260722-01-quotation-system.md) | in-progress | [existing mockup](../mockup/20260720-02-quotation-package-options/) | Core Development implementation complete; รอ UAT, final 23-Package/PDF regression และอนุมัติก่อน Deploy |
| [20260807-01-package-price-periods.md](20260807-01-package-price-periods.md) | done | - | Package มีได้หลายช่วงราคา active ครั้งละ 1 ช่วง; ช่วงที่ใช้งานและเริ่มแล้วล็อกราคา ต้องเพิ่มช่วงใหม่ |
