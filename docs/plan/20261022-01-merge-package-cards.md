# รวมการ์ด Package + แพ็กเกจ O&M บนหน้า Home เป็นใบเดียว

สถานะ: **done 22 ต.ค. 69** · ผู้ใช้สั่ง "แก้เลย" หลังดู mockup → ทำตามที่แนะนำ D1–D4 = ก ทุกข้อ · mockup: [docs/mockup/20261022-01-merge-package-cards/](../mockup/20261022-01-merge-package-cards/)

## ผลที่ทำ (22 ต.ค. 69)

- `src/lib/modules.tsx` — ลบโมดูล `om_package` + ออกจาก `ModuleKey` · การ์ด `package` desc "แพ็กเกจ Solar · O&M · แคตตาล็อก · จัดการ"
  เมนู 2 กลุ่ม `defaultOpen` Solar Rooftop (sun / archive) · O&M (wrench / clipboard) · `MODULE_ALIASES` ใน `getModule()` แปลง `om_package` → `package`
- `src/components/layout/BottomNav.tsx` — ตอนย่อเมนู ป้าย hover ของลูกกลุ่ม = "กลุ่ม · เมนู" (มีผลทุกโมดูลที่มีกลุ่ม เช่น Sales "ติดตั้ง · รอติดตั้ง")
- ตรวจ: `npx tsc --noEmit` ผ่าน · curl `/home` `/packages` `/packages/manage` `/om/packages` `/om/packages/manage` = 200
  · puppeteer admin พอร์ต 3020: `/home` 1440 SETUP เหลือ Package + Setup การ์ดสูงเท่าใบอื่น · 390 คำอธิบายบรรทัดเดียวไม่ถูกตัด
  · กดการ์ด → `/packages` + `activeModule=package` เมนูกางครบ 2 กลุ่ม แคตตาล็อก active ถูกตัว
  · ย่อเมนูบน `/om/packages` ไอคอน 4 อันไม่ซ้ำ ชี้แล้วขึ้น "O&M · แคตตาล็อก"
  · ตั้ง `activeModule=om_package` แล้วเปิด `/om/packages/manage` → เมนูซ้ายเป็น PACKAGE (ไม่ตกไป Seeker)

## โจทย์

หมวด SETUP ของ `/home` มีการ์ด "Package" กับ "แพ็กเกจ O&M" แยกกัน 2 ใบ — ผู้ใช้ต้องการรวมเป็นใบเดียว

## ของเดิม (`src/lib/modules.tsx`)

| การ์ด | key | เมนู | สิทธิ์ | badge |
| --- | --- | --- | --- | --- |
| Package 📦 `bg-violet-50` | `package` | แคตตาล็อก `/packages` · จัดการ Package `/packages/manage` | admin | ไม่มี |
| แพ็กเกจ O&M 📋 `bg-orange-50` | `om_package` | แคตตาล็อก `/om/packages` · จัดการแพ็กเกจ O&M `/om/packages/manage` | admin | ไม่มี |

- ทั้ง 2 ใบ admin อย่างเดียว ไม่มี steps/subs → รวมแล้ว**สิทธิ์และตัวเลขของใครไม่เปลี่ยน**
- ทีมอื่นดูแคตตาล็อกจากเมนูในโมดูลตัวเอง (Sales / Seeker → `/packages` · O&M → `/om/packages`) — ไม่แตะ
- แถบล่างมือถือผูกกับ role ไม่ใช่โมดูล — ไม่กระทบ

## ข้อเสนอ (แบบ A — แนะนำ)

**การ์ด** — คง key `package` (admin ที่เคยกดการ์ด Package ไว้ เครื่องยังจำโมดูลเดิมได้)

- label "Package" · 📦 · `bg-violet-50` · group `setup` · roles `["admin"]`
- desc "แพ็กเกจ Solar · O&M · แคตตาล็อก · จัดการ" (มือถือตัดท้ายบรรทัดเดียว → ขึ้นต้นด้วยประเภทให้เห็นก่อน)
  - ลองแล้ว "แพ็กเกจ Solar · แพ็กเกจ O&M · แคตตาล็อก · จัดการ" ยาวไป บนจอคอมตัดบรรทัดกลางคำ "แคตตา|ล็อก"
- กดการ์ด → `/packages` เหมือนเดิม — ไม่ต้องตั้ง `defaultHref` เพราะ `enter()` ในหน้า Home หาเมนูลูกตัวแรกของกลุ่มให้อยู่แล้ว

**เมนูซ้าย** — กลุ่มพับได้ 2 กลุ่ม ยกบล็อกเดียวกับกลุ่ม "ใบเสนอราคา" / "ติดตั้ง" ของโมดูล Sales · กางค้างทั้งคู่ (`defaultOpen` แบบโมดูลบัญชี)

```text
PACKAGE
☀ SOLAR ROOFTOP  ˅
    • แคตตาล็อก         /packages             (ไอคอนตอนย่อ: sun)
    • จัดการแพ็กเกจ      /packages/manage      (archive)
🔧 O&M  ˅
    • แคตตาล็อก         /om/packages          (wrench)
    • จัดการแพ็กเกจ      /om/packages/manage   (clipboard)
```

เหตุผล: หัวกลุ่มบอกประเภท ชื่อเมนูข้างในจึงสั้นและเหมือนกันทั้ง 2 กลุ่ม · มีแพ็กเกจประเภทใหม่ (เช่น B2B) ก็เพิ่มกลุ่มต่อได้

### ทางเลือกอื่น

- **แบบ B — เมนูเรียบ 4 บรรทัด** "แคตตาล็อก Solar · จัดการแพ็กเกจ Solar · แคตตาล็อก O&M · จัดการแพ็กเกจ O&M"
  แก้น้อยสุด ไม่มีปัญหาป้ายซ้ำตอนย่อเมนู แต่คำซ้ำทุกบรรทัด ต้องอ่านท้ายคำถึงรู้ประเภท
- **แบบ C — หน้าเดียวมีแท็บ Solar | O&M** (ไม่แนะนำ) ต้องรวม 2 หน้าที่ตารางข้อมูลคนละชุด (`packages` / `om_packages`)
  และหน้าเหล่านี้ถูกลิงก์จากโมดูลอื่นแยกกัน — งานใหญ่เกินโจทย์ ไม่ทำ mockup

## จุดที่ต้องกันไว้ตอนลงมือ

1. **admin ที่กดการ์ด O&M ไว้ล่าสุด** — localStorage `activeModule` ยังเป็น `om_package` → `getModule()` คืน null
   → `BottomNav` ตกไปโมดูลแรก (Seeker) ทั้งที่อยู่หน้า `/om/packages/manage` → ให้ `getModule()` แปลง `om_package` → `package`
2. ลบ `"om_package"` ออกจาก `ModuleKey`
3. **ตอนย่อเมนู (rail)** กลุ่มแสดงลูกเป็นไอคอนเรียงกัน → ไอคอนทั้ง 4 ต้องไม่ซ้ำ
   และป้ายตอนชี้ใช้ `c.label` อย่างเดียว "แคตตาล็อก" จะขึ้นซ้ำ 2 อัน → D3
4. สะกด "แพ็คเกจ" ในคำอธิบายเดิม → "แพ็กเกจ" ตามที่ใช้ทั้งระบบ · ชื่อเมนู "จัดการ Package" → "จัดการแพ็กเกจ"
5. หัวหน้าทั้ง 4 หน้าคงเดิม (Solar Rooftop Packages · จัดการ Packages · แพ็กเกจบริการ O&M · จัดการแพ็กเกจ O&M)

## ไฟล์ที่จะแก้ (ตอนลงมือ)

- `src/lib/modules.tsx` — ลบโมดูล `om_package` · เมนูของ `package` เป็น 2 กลุ่ม · desc ใหม่ · alias ใน `getModule()` · `ModuleKey`
- ถ้า D3 = ก: `src/components/layout/BottomNav.tsx` — ป้าย hover ของลูกกลุ่มตอนย่อเป็น "กลุ่ม · เมนู"

## ให้เคาะ

| ข้อ | คำถาม | ก (แนะนำ) | ข |
| --- | --- | --- | --- |
| D1 | เมนูซ้าย | แยก 2 กลุ่มพับได้ Solar Rooftop / O&M | เมนูเรียบ 4 บรรทัด |
| D2 | ชื่อ/คำอธิบายการ์ด | "Package" · "แพ็กเกจ Solar · O&M · แคตตาล็อก · จัดการ" | "แพ็กเกจ" · คำอธิบายเดียวกัน |
| D3 | ป้ายตอนชี้ไอคอนในเมนูที่ย่อ (เฉพาะแบบ A) | ใส่ชื่อกลุ่มนำหน้า "O&M · แคตตาล็อก" — มีผลทุกโมดูลที่มีกลุ่ม (Sales จะขึ้น "ติดตั้ง · รอติดตั้ง") | ไม่แก้ ใช้ไอคอนต่างกันพอ |
| D4 | กดการ์ดแล้วลงหน้า | แคตตาล็อก Solar (เหมือนเดิม) | จัดการแพ็กเกจ Solar |

## ตรวจตอนเสร็จ

- `npx tsc --noEmit` · curl `/home` `/packages` `/packages/manage` `/om/packages` `/om/packages/manage` ได้ 200
- `/home` ที่ 1366 / 1900 / 390 — SETUP เหลือ 2 ใบ การ์ดสูงเท่าใบอื่น
- เมนูซ้ายกาง/ย่อ · เมนู active ถูกตัวทั้ง 4 หน้า · ตั้ง localStorage `activeModule=om_package` แล้วเปิด `/om/packages/manage` ต้องได้เมนู Package
- role ที่ไม่ใช่ admin ไม่เห็นการ์ด · เมนูแคตตาล็อกในโมดูล Sales / Seeker / O&M ยังเข้าได้
