# ข้อตกลงการทำงานร่วมกัน (v2 บน prod + v3 คู่ขนาน)

อัปเดต 11 ส.ค. 2569 · เพิ่มงาน B2B 5 ต.ค. 2569 · ไม่มีระบบบังคับ เป็นข้อตกลงที่ตกลงกันในทีม

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

v3 ─────────────────────────────►  v3 (clone แยก: ../solar-app-v3)
  ├─ v3/<ชื่องานสั้นๆ> ──PR──► v3    ทีมพัฒนาทุกคนทำที่นี่
  ├─ v3/<ชื่องานสั้นๆ> ──PR──► v3
  └─ v3/b2b ──────────PR──► v3    ทีม B2B (BOQ โรงงาน/ไซต์ใหญ่) — ดูหัวข้อ "งาน B2B"
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

## รู้ได้ยังไงว่ากำลังทำ v ไหน

| ดูจาก | v2 | v3 | v3 งาน B2B |
|---|---|---|---|
| **URL ตอน dev** | `localhost:3010` | `localhost:3020` | `localhost:3030` |
| **หัวหน้าจอในแอป** | `Today v2.0.xx` | `Today v3.0.0-dev` | เหมือน v3 — ดูพอร์ตใน URL |
| **โฟลเดอร์** | `solar-app` | `solar-app-v3` | `solar-app-b2b` |
| **branch** | `git branch --show-current` → `main` | → `v3` | → `v3/b2b` |

`start.sh` เลือก port ตาม branch ให้อัตโนมัติ จึงเปิดทั้ง v2 และ v3 พร้อมกันได้
(กำหนดเองได้ด้วย `PORT=3030 ./start.sh`) · ngrok ผูกกับ port 3010 เท่านั้น
ฝั่ง v3 จะข้ามไปและใช้ localhost ตรงๆ

**สองโฟลเดอร์เป็น clone แยกขาดจากกัน** ไม่ใช้ `.git`, `node_modules`, `.env.local`
หรือ `public/uploads` ร่วมกันเลย ทำอะไรพังฝั่งไหนก็อยู่แค่ฝั่งนั้น ลบทิ้งแล้ว clone
ใหม่ได้ตลอด

## เริ่มงานวันแรก

```bash
git clone https://github.com/git-monchiant/solar-app.git
cd solar-app
npm install
cp .env.example .env.local        # แล้วเติมค่าจริง (ขอจากเจ้าของระบบ)
./start.sh                        # main → :3010 · v3 → :3020 (เลือกให้อัตโนมัติ)
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
6. deploy สำเร็จ → สคริปต์ tag `v<version>` ให้อัตโนมัติ แล้ว **merge main → v3**

```bash
# ในโฟลเดอร์ v2 — ให้ main ขึ้น origin ก่อน (deploy_prd.sh push ให้อยู่แล้ว)
cd ~/my-projects/sena-projects/solar-app && git push

# ในโฟลเดอร์ v3 — ดึงงานของ v2 ลงมา
cd ~/my-projects/sena-projects/solar-app-v3
git fetch origin && git merge origin/main && git push
```

### เจ้าของระบบเทส PR ยังไง

```bash
git fetch origin
git checkout fix/quotation-vat     # ชื่อ branch ของ PR นั้น
npm install                        # เผื่อมี dependency ใหม่
./start.sh                         # ลองใช้งานจริงกับ DB ของตัวเอง
```
เทสผ่านแล้วกลับไปกด merge บน GitHub (อย่า merge ในเครื่องแล้ว push ตรง — PR จะค้าง)

## งาน B2B (BOQ โรงงาน / ไซต์ใหญ่)

เพิ่ม 5 ต.ค. 2569 · ทีม B2B เป็นคนละทีมกับงาน solar rooftop (Sales / O&M) และทำคู่ขนานกัน
ตั้งต้นแตก `v3/b2b` จาก `v3-ui-consistency` (branch v3 ที่ใหม่ที่สุด ณ วันนั้น)

```
Sales/O&M (v3-ui-consistency) ──●──●─────●──●──────────►  ──PR──► v3
                                   \        \   merge ลงได้ตลอด
B2B (v3/b2b)                        ●──●──M──●──M──●───►  ──PR──► v3
  └─ v3/b2b-<งานย่อย> ──PR──► v3/b2b
```

| | Sales / O&M | B2B |
|---|---|---|
| branch | `v3-ui-consistency` | `v3/b2b` |
| โฟลเดอร์ | โฟลเดอร์ v3 หลัก | `../solar-app-b2b` (git worktree) |
| URL | `localhost:3020` | `localhost:3030` |
| DB | `solardb_v3` | `solardb_v3` (ใช้ร่วม — B2B สร้างตารางใหม่อย่างเดียว) |

`v3/b2b` เป็น branch หลักของทีม จึงอยู่นานกว่า 1 สัปดาห์ได้ แต่ต้องดึงงาน Sales/O&M
ลงมาทุกสัปดาห์ และส่ง PR เข้า `v3` เป็นรอบละ 1–2 สัปดาห์ — อย่ารอทำเสร็จทั้งโมดูล
(บทเรียนจาก `feature/om-module` ที่แยกอยู่ 5 สัปดาห์แล้วรวมทีเดียว)
ส่งงานที่ยังไม่เสร็จเข้า `v3` ได้ เพราะการ์ด B2B ผูกกับ role ของทีม B2B — คนอื่นไม่เห็น

### กติกา 4 ข้อ

1. **โค้ด B2B อยู่ในที่ของตัวเองทั้งหมด**

   | ส่วน | ที่อยู่ |
   |---|---|
   | หน้าเว็บ | `src/app/(app)/b2b/...` |
   | API | `src/app/api/b2b/...` (แบบเดียวกับ `api/om`) |
   | logic / component | `src/lib/b2b/...` · `src/components/b2b/...` |
   | ตาราง | ขึ้นต้น `b2b_*` สร้างใหม่เท่านั้น ไม่แก้ตารางเดิม |
   | migration | `scripts/migrations-v3/<timestamp>_b2b_xxx.sql` |

   ไฟล์ของ Sales/O&M (`QuotationBuilder.tsx`, `OrderStep.tsx`, `leads/[id]/route.ts`,
   `src/lib/om/*`) import ไปใช้ได้ แต่ **ไม่แก้ใน `v3/b2b`** — ถ้าต้องแก้ ให้แก้ฝั่ง
   Sales/O&M (หรือ PR เล็กเข้า `v3`) แล้วรอไหลลงมา
   ไฟล์กลางที่แตะได้คือ `src/lib/modules.tsx` (กลุ่ม + การ์ด) และไฟล์ role/สิทธิ์ — เพิ่มบรรทัดอย่างเดียว
   (+ `api/(lead)/journey-summary` บล็อกนับ badge ของ B2B เอง แบบเดียวกับบล็อก O&M)
2. **merge ทางเดียว Sales/O&M → `v3/b2b`** ห้าม `v3/b2b` → Sales/O&M
   merge เอามาทั้ง branch เลือกบางส่วนไม่ได้ — ถ้าย้อนทาง BOQ ที่ยังไม่เสร็จ + migration `b2b_*`
   จะติดไปกับ PR ของ O&M และ revert merge ทีหลังทำให้วันที่เอา BOQ เข้าจริง git ข้ามให้เงียบๆ
   ถ้า B2B แก้ของกลางที่ O&M ต้องใช้ด้วย → `git cherry-pick <commit>` เฉพาะ commit นั้น
3. **push Sales/O&M ก่อน `v3/b2b`** — commit ของ O&M จะได้ขึ้นไปใน branch ของมันเอง
   ไม่ใช่ติดขึ้นไปกับ `v3/b2b`
4. **ก่อนเปิด PR `v3/b2b` → `v3` ให้ merge `origin/v3` เข้า b2b ก่อนทุกครั้ง**
   และให้ PR ของ Sales/O&M เข้า `v3` ก่อน — เจ้าของระบบใช้ Squash and merge ซึ่งเปลี่ยน
   hash ของ commit O&M ถ้าไม่ merge `origin/v3` ลงมาก่อน PR ของ B2B จะโชว์ไฟล์ O&M ปนมา

### ตั้งเครื่อง (ครั้งเดียว)

ใช้ **git worktree** ไม่ใช่ clone ใหม่ — `.git` ตัวเดียวกัน แต่ได้โฟลเดอร์แยก เปิดสองงานพร้อมกันได้

```bash
# ในโฟลเดอร์ v3 หลัก
git fetch origin
git worktree add ../solar-app-b2b v3/b2b     # ยังไม่มีบน origin: git branch v3/b2b v3-ui-consistency ก่อน
cp .env.local ../solar-app-b2b/
cd ../solar-app-b2b && npm ci

# ไฟล์ที่อัปโหลดอยู่นอก git — ลิงก์ให้สองโฟลเดอร์ใช้ที่เดียวกัน ไม่งั้นรูปขึ้นกรอบว่าง
# (DB เดียวกัน แต่ไฟล์อยู่คนละโฟลเดอร์)
ln -s "<โฟลเดอร์ v3 หลัก>/public/uploads" public/uploads
ln -s "<โฟลเดอร์ v3 หลัก>/storage" storage
```

Windows (PowerShell) ใช้ junction แทน `ln -s`:

```powershell
New-Item -ItemType Junction -Path public\uploads -Target "<โฟลเดอร์ v3 หลัก>\public\uploads"
New-Item -ItemType Junction -Path storage -Target "<โฟลเดอร์ v3 หลัก>\storage"
```

### ทำงานประจำวัน

- เปิด VS Code สองหน้าต่าง (โฟลเดอร์ละหน้าต่าง) + แท็บ browser สองแท็บ
  **สลับงาน = สลับหน้าต่าง** ไม่ต้อง `git checkout` ไม่ต้องหยุด server ไม่ต้องเก็บงานที่ค้าง
- รันในโฟลเดอร์ b2b ด้วย `npm run dev -- --port 3030`
  **อย่าใช้ `start.sh`** — สคริปต์แจก `v3/*` → 3020 จะชนกับโฟลเดอร์หลัก
- login แยกพอร์ตละครั้ง (ผู้ใช้เก็บใน localStorage ซึ่งแยกตามพอร์ต) — ใช้คนละ role ได้
- งาน B2B อยากได้ของใหม่ฝั่ง O&M: ในโฟลเดอร์ b2b → `git merge v3-ui-consistency`
- ก่อนเปิด PR: ในโฟลเดอร์ b2b → `git fetch origin && git merge origin/v3 && git push`

### ข้อควรระวัง

- **ห้ามลบไฟล์ใน `public/uploads` / `storage` ของโฟลเดอร์ b2b** — เป็นที่เดียวกับของโฟลเดอร์หลัก
- จะเลิกใช้ worktree: ถอดลิงก์ก่อน (`rm public/uploads storage` ไม่ใส่ `-r` ·
  Windows ใช้ `cmd /c rmdir public\uploads` และ `cmd /c rmdir storage` — **อย่าใช้ `Remove-Item -Recurse`**
  จะไล่ลบไฟล์จริงตาม junction) แล้วค่อย `git worktree remove ../solar-app-b2b`
- เชื่อมบัญชี Google ให้ทำที่ 3020 — `GOOGLE_OAUTH_REDIRECT_URI` ใน `.env.local` ชี้พอร์ตนั้น

## วัน cutover ไป v3

1. tag `v2-final` + สร้าง branch `backup/prod-v2.x`
2. ซ้อมใหญ่: copy prod ล่าสุด → `solardb_v3` แล้วรัน migration v3 ทั้งชุดรวดเดียว
3. merge `v3` → `main` (ถ้า merge forward มาตลอดจะแทบไม่มี conflict)
4. รัน migration v3 บน prod → deploy
5. พัง → `git checkout v2-final` แล้ว deploy กลับ (ข้อมูลต้องยังอ่านได้ด้วยโค้ดเก่า)
