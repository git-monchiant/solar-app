# ข้อตกลงการทำงานร่วมกัน (v2 บน prod + v3 คู่ขนาน)

อัปเดต 11 ส.ค. 2569 · ไม่มีระบบบังคับ เป็นข้อตกลงที่ตกลงกันในทีม

## ใครทำอะไร

| งาน | ตอนนี้ | อนาคต |
|---|---|---|
| เขียนโค้ด, เปิด PR | ทุกคน | ทุกคน |
| **เขียนไฟล์ migration** | ทุกคน | ทุกคน |
| **รัน migration** | เจ้าของระบบคนเดียว | ส่งต่อให้ทีมเมื่อพร้อม |
| **deploy prod** | เจ้าของระบบคนเดียว | ส่งต่อให้ทีมเมื่อพร้อม |
| **ทดสอบก่อนขึ้น prod** | เจ้าของระบบคนเดียว | ส่งต่อให้ทีมเมื่อพร้อม |

รหัสเข้า prod (ssh + DB) อยู่ในโค้ดอยู่แล้ว ทุกคนที่ clone จึงรันได้ในทางเทคนิค —
**ข้อตกลงคือไม่รัน** จนกว่าจะมีการส่งมอบอย่างเป็นทางการ

## Branch

```
main ───────────────────────────►  v2 = สิ่งที่อยู่บน prod
                                    เจ้าของระบบดูแลคนเดียว (bug fix + deploy)

v3 ─────────────────────────────►  v3 (worktree: ../solar-app-v3)
  ├─ v3/<ชื่องานสั้นๆ> ──PR──► v3    ทีมพัฒนาทุกคนทำที่นี่
  └─ v3/<ชื่องานสั้นๆ> ──PR──► v3
```

**ทีมพัฒนาแตก branch จาก `v3` เสมอ** และเปิด PR กลับเข้า `v3` เท่านั้น
ไม่ต้องยุ่งกับ `main` เลย (ถ้ามี bug บน prod ที่ต้องแก้ด่วน เจ้าของระบบจัดการเอง
แล้ว merge `main → v3` ลงมาให้)

- **merge ทางเดียว `main → v3`** ทำทุกครั้งหลัง deploy v2 (อย่างน้อยสัปดาห์ละครั้ง)
  ห้าม merge v3 กลับ main จนถึงวัน cutover
- branch งานย่อยอายุไม่ควรเกิน 1 สัปดาห์ ยิ่งอยู่นานยิ่ง conflict เยอะ
  โดยเฉพาะไฟล์ที่แก้บ่อย: `OrderStep.tsx`, `QuotationBuilder.tsx`, `leads/[id]/route.ts`
- `deploy_prd.sh` จะปฏิเสธถ้าไม่ได้อยู่ `main` + tree สะอาด + sync กับ origin
  (ข้ามได้ด้วย `ALLOW_DIRTY=1` แต่ไม่ควรใช้)

## เริ่มงานวันแรก

```bash
git clone https://github.com/git-monchiant/solar-app.git
cd solar-app
npm install
cp .env.example .env.local        # แล้วเติมค่าจริง (ขอจากเจ้าของระบบ)
./start.sh                        # เปิดที่ http://localhost:3010
```

`git clone` จะได้ **`main` (= v2 บน prod)** เสมอ เพราะเป็น default branch
ถ้าทำ v3 ให้สลับก่อน: `git checkout v3`

## คำสั่งที่ dev ใช้ประจำ

```bash
git checkout v3 && git pull                # เริ่มจาก v3 ล่าสุดเสมอ
git checkout -b v3/redesign-lead-list      # ตั้งชื่อตามสิ่งที่ทำ

# ...เขียนโค้ด + ทดสอบกับ DB ของตัวเอง...

git add -A && git commit -m "ปรับหน้ารายการ lead"
git push -u origin v3/redesign-lead-list
# เปิด PR บน GitHub → base ต้องเป็น v3 (ไม่ใช่ main)
```

รอบถัดไปเริ่มใหม่จากบรรทัดแรกเสมอ — `git checkout v3 && git pull` เพื่อดึงงานของ
คนอื่นที่ merge เข้าไปแล้ว และงาน v2 ที่ merge forward ลงมา

- **ชื่อ branch ตั้งตามสิ่งที่ทำ** ไม่ต้องแบ่งเป็นโมดูล เช่น `v3/redesign-lead-list`,
  `v3/new-report-page`, `fix/quotation-vat` — ขอแค่อ่านแล้วรู้ว่าคืองานอะไร
- 1 branch = 1 เรื่อง อย่ารวมหลายงานไว้ด้วยกัน จะเทสแยกไม่ได้
- ถ้างานใหญ่จนแบ่งไม่ออกจริงๆ ให้ส่งเป็น PR ย่อยหลายรอบตามลำดับที่ทำเสร็จ
  ดีกว่าเปิด PR เดียวยาว 3 สัปดาห์ที่ไม่มีใครรีวิวไหว
- `git pull` ก่อนแตก branch เสมอ ไม่งั้นทำงานบนของเก่า
- push เข้า `main` ตรงๆ ไม่ได้ (GitHub บังคับให้ผ่าน PR) — ต้องแตก branch เท่านั้น
- มี migration ให้เขียนไฟล์ไว้ใน PR **แต่ไม่ต้องรัน** และเขียนบอกในคำอธิบาย PR

## ฐานข้อมูล

| DB | ใช้ทำอะไร | ใครแตะ |
|---|---|---|
| `solardb` | **prod** | เจ้าของระบบเท่านั้น |
| `solardb_dev` | ทดสอบ fix ของ v2 | ทีม v2 |
| `solardb_v3` | ทีม v3 ใช้ตลอด 3 เดือน | ทีม v3 |
| `solardb_dev_<ชื่อ>` | ถ้าใครต้องลอง migration หนักๆ ค่อยแตกของตัวเอง | คนนั้น |

สร้าง/รีเฟรชจาก prod: `node scripts/tools/copy_db.mjs --dst=<db> --yes`

แต่ละคนมี `.env.local` ของตัวเอง (ไม่ commit) ต่างกันที่ `DB_NAME` และต้องตั้ง
`LINE_ENABLED=false` เสมอ ไม่งั้นจะยิง LINE หาลูกค้าจริงตอนเทส

## Migration

- **ชื่อไฟล์ใช้ timestamp** `20260811-1030_add_xxx.sql` ไม่ใช้เลขรัน
  (สองคนจองเลขเดียวกันพร้อมกันแน่ถ้าใช้ `145_`)
- v2 → `scripts/migrations/` · v3 → `scripts/migrations-v3/`
- เขียนให้รันซ้ำได้ (`IF NOT EXISTS` / `IF COL_LENGTH(...) IS NULL`)
- **ห้ามลบคอลัมน์/ตาราง หรือเปลี่ยนชนิดข้อมูล** — โค้ด rollback ได้ใน 5 นาที
  แต่ DB ย้อนไม่ได้ ถ้าจะเลิกใช้คอลัมน์ให้ปล่อยว่างไว้ก่อน ค่อยลบรอบถัดไป
- ผู้เขียนทดสอบกับ DB ของตัวเองให้ผ่านก่อน แล้วแจ้งในคำอธิบาย PR ว่ามี migration

## รอบการส่งงาน

**ทุกงานเข้าเป็น PR เสมอ ไม่มีข้อยกเว้น** — ทั้งงาน v2 และ v3
ห้าม push ตรงเข้า `main` หรือ `v3` แม้ว่า `v3` จะไม่ได้ตั้งกฎบล็อกไว้ก็ตาม
**เจ้าของระบบเป็นคนกด merge เท่านั้น**

1. dev แตก branch จาก `main` (งาน v2) หรือ `v3` (งาน v3) → เขียน → push → เปิด PR
2. กรอกตามฟอร์มที่ขึ้นมาให้: แก้อะไร, ทดสอบยังไง, **มี migration ไหม**
   (`.github/pull_request_template.md` — GitHub เติมให้เองตอนเปิด PR)
3. `.github/CODEOWNERS` ใส่เจ้าของระบบเป็น reviewer ให้อัตโนมัติ ไม่ต้องขอเอง
4. เจ้าของระบบดึงมาเทสกับ DB ของตัวเอง แล้วกด **Squash and merge** บน GitHub
   (บีบเป็น commit เดียว ประวัติ main/v3 อ่านง่าย) → ลบ branch ทิ้ง
5. เจ้าของระบบรัน migration + `./deploy_prd.sh` (bump version ก่อนทุกครั้ง)
6. deploy สำเร็จ → สคริปต์ tag `v<version>` ให้อัตโนมัติ → merge `main` → `v3`

### เจ้าของระบบเทส PR ยังไง

```bash
git fetch origin
git checkout fix/quotation-vat     # ชื่อ branch ของ PR นั้น
npm install                        # เผื่อมี dependency ใหม่
./start.sh                         # ลองใช้งานจริงกับ DB ของตัวเอง
```
เทสผ่านแล้วกลับไปกด merge บน GitHub (อย่า merge ในเครื่องแล้ว push ตรง — PR จะค้าง)

## วัน cutover ไป v3

1. tag `v2-final` + สร้าง branch `backup/prod-v2.x`
2. ซ้อมใหญ่: copy prod ล่าสุด → `solardb_v3` แล้วรัน migration v3 ทั้งชุดรวดเดียว
3. merge `v3` → `main` (ถ้า merge forward มาตลอดจะแทบไม่มี conflict)
4. รัน migration v3 บน prod → deploy
5. พัง → `git checkout v2-final` แล้ว deploy กลับ (ข้อมูลต้องยังอ่านได้ด้วยโค้ดเก่า)
