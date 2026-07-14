# Lead Tracking Source Column

## Status

done

## Goal

เพิ่มคอลัมน์ `ที่มา` ในตาราง Lead Tracking ตรงตำแหน่งระหว่าง `ชื่อ` กับ
`สถานะ` ตามกรอบแดง โดยแสดงข้อมูลเดียวกับหัวข้อ
`ที่มา (ช่องทางที่ลูกค้ารู้จักเรา)` ในหน้ารายละเอียดลูกค้า สำหรับ Role
`admin`, `sales`, `solar` และ `account` เท่านั้น

## Current State

- ข้อมูลที่มาเก็บอยู่แล้วใน `leads.source` จึงไม่ต้องเพิ่ม migration หรือแก้ schema
- API `/api/lifecycle` ยังไม่ได้เลือก `l.source` ส่งให้หน้า Lead Tracking
- หน้า Lead Tracking และไฟล์ Excel export ยังไม่มีคอลัมน์ `ที่มา`
- ชื่อและสีของที่มามี source of truth อยู่แล้วที่ `src/lib/source-tag.ts`
- เมนู Lead Tracking ปัจจุบันเปิดให้ `admin`, `sales`, `solar`, `smartify`
  และ `account`; แผนนี้ไม่เปลี่ยนสิทธิ์เข้าเมนู แต่คอลัมน์ใหม่จะซ่อนสำหรับ
  `smartify` ตามขอบเขตที่ผู้ใช้ยืนยัน

## Implementation

1. อัปเดต `src/app/api/(lead)/lifecycle/route.ts`
   - เพิ่ม `l.source` ในผลลัพธ์ของ `GET /api/lifecycle`
   - ใช้ auth และขอบเขตข้อมูลเดิมทั้งหมด ไม่เพิ่ม role-specific response

2. อัปเดต `src/app/(app)/lifecycle/page.tsx`
   - เพิ่ม `source: string | null` ในชนิดข้อมูล `Row`
   - ใช้ `useActiveRoles()` ตรวจ Role ที่กำลังใช้งาน และเปิดคอลัมน์เมื่อมี
     `admin`, `sales`, `solar` หรือ `account`
   - import และใช้ `getSourceStyle()` เพื่อให้ label รองรับทั้งรหัสปัจจุบัน,
     legacy value และค่า `other:<รายละเอียด>` เหมือนหน้ารายละเอียดลูกค้า
   - เพิ่มหัวคอลัมน์ `ที่มา` หลัง `ชื่อ` และก่อน `สถานะ`
   - แสดงเป็น chip ขนาดกะทัดรัดพร้อม tooltip; ถ้าไม่มีข้อมูลให้แสดง `—`
   - ปรับ `colgroup`, group-header `colSpan` และ empty-state `colSpan`
     ให้จำนวนคอลัมน์ตรงกันและไม่ทำให้หัวตารางเหลื่อม

3. อัปเดต Excel export ในไฟล์เดียวกัน
   - เพิ่มคอลัมน์ `ที่มา` ในกลุ่ม `ลีด` โดยวางหลัง `ชื่อ` เฉพาะเมื่อ Role
     ที่กำลังใช้งานเป็น `admin`, `sales`, `solar` หรือ `account`
   - export เป็น label ที่อ่านได้จาก `getSourceStyle().label` ไม่ใช่รหัสดิบ
   - สำหรับ `smartify` ให้ Excel คงรูปแบบเดิมโดยไม่มีคอลัมน์ `ที่มา`
   - คำนวณจำนวนคอลัมน์กลุ่ม, merge และความกว้างคอลัมน์ตามสิทธิ์ เพื่อไม่ให้
     หัวตารางหรือข้อมูลเหลื่อมกัน

## Role Scope

- แสดงคอลัมน์และส่งออก Excel พร้อม `ที่มา`: `admin`, `sales`, `solar`, `account`
- ไม่แสดงคอลัมน์ `ที่มา`: `smartify`
- ไม่เพิ่มสิทธิ์ Lead Tracking และไม่แสดงคอลัมน์นี้ให้ `leadsseeker`
- ถ้าเลือก Active Role พร้อมกันหลาย Role ให้แสดงคอลัมน์เมื่อมีอย่างน้อยหนึ่ง Role
  ในกลุ่มที่ได้รับสิทธิ์ (`admin`, `sales`, `solar`, `account`)

## Verification

- API response มี `source` ครบทั้งค่าปัจจุบัน, legacy, `other:<รายละเอียด>` และ null
- ตารางแสดง `ที่มา` ตรงระหว่าง `ชื่อ` กับ `สถานะ` ทุกแถว
- ค่า null แสดง `—` และค่าที่ไม่รู้จักยังแสดง fallback ได้โดยไม่ทำให้หน้า error
- สลับเป็น `admin`, `sales`, `solar`, `account` แล้วเห็นคอลัมน์และค่าเดียวกัน
- สลับเป็น `smartify` เพียง Role เดียวแล้วไม่เห็นคอลัมน์ในหน้าเว็บและ Excel
- `leadsseeker` ยังคงไม่มีเมนู Lead Tracking ตามสิทธิ์เดิม
- การค้นหา, filter, sticky header, horizontal scroll และลิงก์ชื่อ Lead ยังทำงานเดิม
- Excel ที่ export มีคอลัมน์ `ที่มา` ตำแหน่งเดียวกัน และหัวกลุ่ม/สี/format ไม่เหลื่อม
- รัน targeted ESLint, TypeScript check และ `git diff --check`

## Out of Scope

- ไม่แก้ข้อมูล `source` เดิมในฐานข้อมูล
- ไม่เพิ่ม filter ตามที่มา เว้นแต่ผู้ใช้ขอเพิ่มเติม
- ไม่เปลี่ยนสิทธิ์การเข้า Lead Tracking และไม่ deploy

## Result

- `/api/lifecycle` ส่งค่า `leads.source` ให้หน้า Lead Tracking แล้ว
- ตารางแสดง chip `ที่มา` ระหว่าง `ชื่อ` กับ `สถานะ` สำหรับ Active Role
  `admin`, `sales`, `solar` และ `account`
- `smartify` ไม่เห็นคอลัมน์นี้ และ `leadsseeker` ยังคงไม่มีสิทธิ์เมนูตามเดิม
- ค่าแสดงผลใช้ `getSourceStyle()` ร่วมกับหน้ารายละเอียดลูกค้า และค่า null แสดง `—`
- Excel Export เพิ่ม/ซ่อนคอลัมน์ตาม Role เดียวกับหน้าเว็บ พร้อมปรับ merge และความกว้าง
- Targeted ESLint, TypeScript (`tsc --noEmit`) และ `git diff --check` ผ่าน
