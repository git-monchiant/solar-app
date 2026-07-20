# Step 5 Grid-Tie Draft Sharing

## Status

done

## Goal

นำฟอร์ม `ขอขนานไฟ` ที่อยู่ใน Workflow Step 7 มาให้กรอกล่วงหน้าใน Workflow
Step 5 โดยทั้งสองตำแหน่งอ่านและเขียนข้อมูลชุดเดียวกัน ผู้ใช้สามารถปิด Step 5 ได้แม้
ข้อมูลขนานไฟยังไม่ครบ และกลับมากรอกต่อหรือแก้ไขข้อมูลล่าสุดใน Step 7 ได้

## Scope

- เพิ่ม Sub-step `ขอขนานไฟ` ใน Step 5 หลัง `ตรวจ` และก่อน `สรุป คชจ.`
- แยกฟอร์มขอขนานไฟออกเป็น Shared Component เพื่อใช้ใน Step 5 และ Step 7
- ใช้ `grid_*` fields และไฟล์เอกสารชุดเดียวกัน ไม่สร้างสำเนาข้อมูลอีกชุด
- Step 5 บันทึกข้อมูลเป็น Draft และไม่ใช้ความครบของข้อมูลขนานไฟเป็น Gate
- Step 7 แสดงข้อมูล Draft ล่าสุดและเป็นจุดตรวจความครบก่อนปิดงานขนานไฟ
- หลังบันทึกจากตำแหน่งใด อีกตำแหน่งต้องเห็นข้อมูลล่าสุดหลัง refresh
- เพิ่มสถานะย่อของเอกสารขนานไฟในหน้า `นัดหมาย` ของ Step 5 พร้อมปุ่มไปยัง
  Sub-step ขอขนานไฟ

## Out of Scope

- ยังไม่สร้าง Grid-Tie Timeline 6 ขั้นตามแผน
  `20260717-01-grid-tie-document-timeline.md`
- ยังไม่สร้างตารางเอกสารแบบหลายเวอร์ชันหรือ Checklist Template สำหรับ Admin
- ยังไม่เปลี่ยนโครงสร้างสถานะหลักของ Lead
- ไม่ทำสำเนาไฟล์หรือข้อมูลระหว่าง Step 5 และ Step 7

## Target Workflow

ลำดับ Sub-step ของ Step 5:

```text
นัดหมาย → ตรวจ → ขอขนานไฟ → สรุป คชจ. → เก็บเงิน → ส่งมอบ
```

พฤติกรรมที่ต้องได้:

1. หน้า `นัดหมาย` ยังคงปุ่มดาวน์โหลด Checklist เอกสารขอขนานไฟ
2. หน้า `นัดหมาย` แสดง Progress แบบย่อ เช่น `เอกสารขนานไฟ 3/6`
3. ปุ่ม `กรอกข้อมูล` เปิด Sub-step `ขอขนานไฟ`
4. ผู้ใช้กรอกข้อมูลบางส่วน อัปโหลดไฟล์ หรือข้าม Sub-step นี้ได้
5. การกดถัดไปและการยืนยันส่งมอบใน Step 5 ไม่ตรวจความครบของข้อมูลขนานไฟ
6. เมื่อ Step 5 เสร็จ Step 7 แสดงข้อมูลและไฟล์ที่บันทึกไว้ทั้งหมด
7. ผู้ใช้กรอกข้อมูลต่อใน Step 7 และปิดงานขนานไฟเมื่อผ่าน Final Gate

## Shared Component Design

แยกส่วนฟอร์มจาก `GridTieStep.tsx` เป็น Component กลาง เช่น
`GridTieForm.tsx` โดยรับค่าควบคุมพฤติกรรมอย่างน้อยดังนี้:

- `mode: "draft" | "final"`
- `lead`
- `refresh`
- callback สำหรับสถานะกำลังบันทึกและข้อผิดพลาด

### Draft Mode — Step 5

- แสดงข้อความว่าเป็นข้อมูลขนานไฟที่กรอกล่วงหน้า
- อนุญาตให้ข้อมูลไม่ครบ
- ไม่มีปุ่ม `ปิดงาน — ขนานไฟเสร็จสิ้น`
- การเปลี่ยน Sub-step ไม่ถูกบล็อกด้วย Checklist หรือเอกสารขนานไฟ
- แสดง Progress และรายการที่ยังขาดเพื่อช่วยเตรียมงานเท่านั้น

### Final Mode — Step 7

- แสดงข้อมูลเดียวกับ Draft Mode
- แสดงสถานะความครบและรายการที่ยังขาด
- มีปุ่มปิดงานขนานไฟ
- ตรวจ Final Gate ทั้งใน UI และ API ก่อนเปลี่ยน Lead เป็น `closed`

## Data Ownership

ใช้ข้อมูลเดิมบน Lead เป็นแหล่งข้อมูลเดียว:

- `grid_utility`
- `grid_app_no`
- `grid_applicant_type`
- `grid_document_checklist`
- `grid_application_doc_url`
- `grid_permit_doc_url`
- `grid_note`
- วันที่ `grid_*` เดิมที่ระบบยังรองรับ หากนำกลับมาแสดงในรอบ implementation

หากต้องเพิ่มประเภทโครงการเพื่อแยก `self_consumption` และ `sell_excess` ให้เพิ่ม
field กลางเพียงตัวเดียว เช่น `grid_project_type` และใช้ร่วมกันทั้งสอง Step

## Save and Synchronization Rules

- PATCH เฉพาะ field ที่เปลี่ยน เพื่อลดโอกาส autosave จากสองตำแหน่งเขียนทับกัน
- ก่อนเปลี่ยน Sub-step หรือปิด Step 5 ต้อง flush Draft ที่ยังรอบันทึก
- แสดงสถานะ `กำลังบันทึก`, `บันทึกแล้ว` และ `บันทึกไม่สำเร็จ`
- Error จาก autosave ต้องแสดงใน UI ไม่บันทึกเพียง `console.error`
- หลังอัปโหลดหรือลบเอกสารต้อง refresh Lead หรืออัปเดต state กลางทันที
- Summary ของ Step 5 และ Step 7 ต้องคำนวณจากข้อมูลล่าสุดชุดเดียวกัน

## Gate Rules

### Step 5 Completion Gate

คงเงื่อนไขงานติดตั้งเดิม เช่น รูปติดตั้ง บันทึกส่งมอบ การชำระเงิน และลายเซ็น
โดยไม่เพิ่มเงื่อนไขต่อไปนี้:

- ไม่บังคับเลือกการไฟฟ้า
- ไม่บังคับเลขที่คำขอ
- ไม่บังคับ Checklist ขนานไฟครบ
- ไม่บังคับเอกสารยื่นขนานไฟ
- ไม่บังคับใบอนุญาต/PPA

### Step 7 Final Gate

ก่อนเปลี่ยนสถานะเป็น `closed` ต้องตรวจอย่างน้อย:

- ระบุการไฟฟ้าและประเภทผู้ยื่นแล้ว
- ระบุเลขที่คำขอหรือหลักฐานรับคำขอตามกติกาที่ตกลงใช้
- Checklist ที่บังคับสำหรับงานนั้นได้รับครบ
- มีเอกสารชุดที่ยื่นขอขนานไฟ
- เอกสารใบอนุญาต/PPA ต้องใช้ตามประเภทโครงการ ไม่บังคับ PPA กับ
  `self_consumption`
- API ตรวจเงื่อนไขเดียวกับ UI เพื่อป้องกันการข้าม Gate ด้วย PATCH โดยตรง

รายละเอียด Final Gate ที่เกี่ยวกับ Timeline 6 ขั้น เช่น ผลตรวจ เปลี่ยนมิเตอร์ และ COD
ให้ดำเนินการในแผน Timeline แยกต่างหาก เว้นแต่ผู้ใช้ยืนยันให้นำมารวมในรอบนี้

## Implementation Areas

- `src/components/lead/detail/steps/InstallStep.tsx`
  - เพิ่ม Sub-step และ Navigation
  - เพิ่ม Progress ย่อในหน้า `นัดหมาย`
  - เรียก Shared Grid-Tie Form ใน Draft Mode
- `src/components/lead/detail/steps/GridTieStep.tsx`
  - ลดเหลือ Wrapper ของ Final Mode และ Done Summary
- `src/components/lead/detail/steps/GridTieForm.tsx`
  - ฟอร์ม Checklist, เอกสาร, หมายเหตุ และ autosave ที่ใช้ร่วมกัน
- `src/app/api/(lead)/leads/[id]/route.ts`
  - เพิ่ม server-side Final Gate เมื่อเปลี่ยนเป็น `closed`
  - validate ค่า enum และ JSON ที่เกี่ยวข้อง
- `src/components/lead/detail/steps/types.ts`
  - เพิ่ม type กลางสำหรับ Grid-Tie Draft และ Checklist
- SQL migration เฉพาะเมื่อจำเป็นต้องเพิ่ม `grid_project_type`

ก่อนแก้โค้ด Next.js ต้องอ่านคู่มือที่เกี่ยวข้องใน `node_modules/next/dist/docs/`
ตามข้อกำหนดของโปรเจกต์

## Implementation Sequence

1. สรุป Final Gate และตัดสินใจว่ารอบนี้ต้องเพิ่ม `grid_project_type` หรือไม่
2. แยก type, parser, progress calculation และ validation เป็น utilities กลาง
3. แยก Shared Grid-Tie Form โดยรักษาพฤติกรรม Step 7 เดิมก่อน
4. เพิ่ม Sub-step ขอขนานไฟใน Step 5 และปรับ index/navigation ทั้งหมด
5. เพิ่ม Draft status card ในหน้า `นัดหมาย`
6. แยก Step 5 Gate ออกจาก Grid-Tie Draft อย่างชัดเจน
7. เพิ่ม Final Gate ใน Step 7 และฝั่ง API
8. ทดสอบ autosave, upload/delete, refresh และการแก้ข้อมูลข้าม Step
9. รัน lint, TypeScript check และ production build

## Test Matrix

### Shared Data

- กรอกใน Step 5 แล้วเปิด Step 7 เห็นข้อมูลตรงกัน
- แก้ใน Step 7 แล้วกลับ Step 5 เห็นข้อมูลล่าสุด
- อัปโหลดและลบเอกสารจากทั้งสองตำแหน่งแล้วไม่เกิด URL คนละชุด
- เปลี่ยน MEA/PEA หรือประเภทผู้ยื่นแล้ว Checklist ไม่เขียนทับข้อมูลผิดชุด

### Step 5

- ข้าม Sub-step ขอขนานไฟได้เมื่อไม่มีข้อมูล
- ปิด Step 5 ได้เมื่อข้อมูลขนานไฟไม่ครบ แต่ Gate งานติดตั้งครบ
- ปิด Step 5 ไม่ได้เมื่อ Gate งานติดตั้งเดิมไม่ครบ
- การเพิ่ม Sub-step ไม่ทำให้ navigation และ localStorage index เดิมชี้ผิดหน้า

### Step 7

- เปิดต่อจาก Draft ที่กรอกบางส่วนได้
- UI แสดงรายการที่ยังขาดถูกต้อง
- ปิดงานไม่ได้เมื่อ Final Gate ไม่ครบ
- PATCH `status: "closed"` โดยตรงถูก API ปฏิเสธเมื่อ Final Gate ไม่ครบ
- ปิดงานได้เมื่อข้อมูลตามประเภทโครงการครบ

### Regression

- การนัดหมาย ตรวจก่อนส่งมอบ ค่าใช้จ่าย การเก็บเงิน และลายเซ็น Step 5 ทำงานเดิม
- หน้า Pipeline/Today ยังจัด Lead ตามสถานะเดิม
- Done Summary ของ Step 5 และ Step 7 แสดงได้หลัง refresh
- Mobile และ Desktop ใช้งาน Sub-step และ File Viewer ได้

## Acceptance Criteria

- Step 5 มีลำดับ `นัดหมาย → ตรวจ → ขอขนานไฟ → สรุป คชจ. → เก็บเงิน → ส่งมอบ`
- ฟอร์มใน Step 5 และ Step 7 ใช้ข้อมูลและเอกสารชุดเดียวกัน
- ผู้ใช้ปิด Step 5 ได้แม้ Grid-Tie Draft ว่างหรือไม่ครบ
- ข้อมูลที่กรอกใน Step 5 เปิดกรอกต่อใน Step 7 ได้โดยไม่สูญหาย
- การแก้ไขจาก Step 7 สะท้อนกลับใน Step 5 หลัง refresh
- Step 7 ปิดงานไม่ได้เมื่อ Final Gate ไม่ครบ และ API บังคับกติกาเดียวกัน
- ไม่มีการสร้างข้อมูล Grid-Tie ซ้ำอีกชุดในฐานข้อมูล
- lint, TypeScript check และ production build ผ่าน

## Rollout Notes

- ทดสอบกับ Lead อย่างน้อย 3 สถานะ: กำลังติดตั้ง, Step 5 เสร็จแต่ Grid-Tie
  ยังไม่ครบ และ Grid-Tie พร้อมปิดงาน
- ถ้ามี migration ให้ apply และตรวจ dev database ก่อน production
- หลัง deploy ตรวจ Lead เดิมที่มี `grid_document_checklist` และไฟล์เอกสารอยู่แล้วว่า
  เปิดได้จากทั้งสอง Step โดยไม่ต้อง backfill

## Implementation Result

- เพิ่ม Sub-step `ขอขนานไฟ` ใน Step 5 หลัง `ตรวจ` เรียบร้อยแล้ว
- เพิ่มสถานะย่อและปุ่มไปกรอกข้อมูลขนานไฟในหน้า `นัดหมาย`
- Step 5 และ Step 7 ใช้ `GridTieForm` และ `grid_*` data ชุดเดียวกัน
- Draft ใน Step 5 ข้ามได้และไม่เพิ่ม Gate ให้การส่งมอบงานติดตั้ง
- Draft ถูก flush ก่อนออกจาก Sub-step และแสดงสถานะบันทึก/ข้อผิดพลาด
- Step 7 และ API ตรวจ Final Gate ก่อนเปลี่ยนสถานะเป็น `closed`
- เปลี่ยน localStorage key ของ Install Sub-step เป็น V2 เพื่อไม่ให้ index เดิมเปิดผิดหน้า
- ไม่ต้องเพิ่ม migration หรือข้อมูล Grid-Tie ชุดใหม่
- Targeted ESLint ผ่าน
- `npx tsc --noEmit` ผ่าน
- `npm run build` ผ่านบน Next.js 16.2.3
- Dev route `/leads/1?focus=1` ตอบ HTTP 200
