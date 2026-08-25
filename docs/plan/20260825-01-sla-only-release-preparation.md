# เตรียม Release เฉพาะ SLA โดยไม่รวม Dashboard IV

## สถานะ

`done` — branch `release/sla-only` ประกอบและตรวจสอบครบ พร้อมให้ผู้ใช้อนุมัติ push; ยังไม่ push และไม่ deploy

## เป้าหมาย

เตรียมระบบ SLA ตั้งแต่ First Contact จนถึง Close Lead พร้อมหน้า `/sla`, Timeline, ownership และ migration 149–178 โดยไม่ส่งหน้า Dashboard IV (`/dashboard-sla`)

> Repository นี้ไม่มี Dashboard VI จึงตีความคำขอว่า Dashboard IV

## ฐานและวิธีประกอบ

- สร้าง `release/sla-only` จาก `origin/main` ที่ `f4e078f` (`v2.0.23`) ใน worktree แยก
- cherry-pick งาน SLA ตามลำดับเดิมตั้งแต่ `0e9ad97` ถึง `1861582`, ต่อด้วยงานหน้า `/sla` จาก `adc4bcf` และ `dc07a5f`
- แยก commit ผสม `478229b` แบบ selective: เก็บ Contact Retry แบบ sequential, migration 171–173, tests และหน้า `/sla`; ตัด Dashboard IV ทั้ง route, navigation, analytics API, เอกสารและ mockup
- cherry-pick กฎ milestone ล่าสุดจาก `d47bbc8` และการ์ด Solar จาก `0851c54`
- เพิ่ม patch version เป็น `2.0.24` เพื่อให้ production smoke test แยก container ใหม่จาก `v2.0.23` ได้

## ขอบเขตที่รวม

- `src/lib/sla-rules.ts`, `src/lib/sla-service.ts`, `src/lib/timeline-activities.ts`
- หน้า `/sla`, SLA badge, Lead SLA Timeline และ API ที่เกี่ยวข้อง
- workflow hooks ใน Lead, Activity, Booking, Quotation, Payment และ Website Lead
- migration `149_sales_sla_engine.sql` ถึง `178_latest_order_transition_sla.sql`
- SLA tests และ verification tools

## ขอบเขตที่ตัดออก

- `src/app/(app)/dashboard-sla/page.tsx`
- เมนูหรือ runtime reference ไป `/dashboard-sla`
- Dashboard IV drilldown, PDF capture และ report-only scope helper
- commits งาน Dashboard IV clarity pass หลัง `main`
- งานรายงานสำรวจที่ไม่เกี่ยวกับ SLA
- ไฟล์แก้ค้างใน worktree เดิม (`next.config.ts` และ `/sla/page.tsx`)

## Verification gates

ก่อนถือว่าพร้อม push ต้องผ่าน:

- `git grep "dashboard-sla" HEAD -- ':!docs/**'` ไม่พบ runtime reference
- migration 149–178 ครบและเรียงต่อเนื่อง
- `npm run test:sla`
- TypeScript type-check
- ESLint
- `npm run build`
- `git diff --check`
- route `/sla` ใช้งานได้ และ `/dashboard-sla` ได้ 404
- branch สะอาดและ diff เทียบ `origin/main` ไม่มี Dashboard IV

## Database และ Production gate

- การเตรียม branch และ push ไม่อนุญาตให้รัน migration Production หรือ deploy
- ทดสอบ migration เฉพาะ `solardb_dev` ก่อน โดยสำรองหรือ refresh ฐานตาม workflow
- ก่อน Production ต้องสำรอง `leads`, `lead_activities` และ SLA tables
- ตรวจ dry-run pending migrations ก่อน เพราะ `deploy_prd.sh` จะรันทุก migration ที่ค้าง
- ขออนุญาตผู้ใช้แยกอีกครั้งก่อน push และก่อน deploy

## Rollback

- ก่อน push สามารถทิ้งเฉพาะ worktree/release branch ได้โดยไม่แตะ worktree เดิม
- หลัง merge แต่ก่อน Production migration ให้ revert release PR
- หลัง Production migration ให้ rollback application แยกจาก data rollback; ห้าม drop SLA schema แบบกว้าง และใช้ backup/event keys สำหรับย้อนข้อมูลเท่านั้น

## ผลการดำเนินการ

- สร้าง `release/sla-only` จาก `origin/main@f4e078f` ใน worktree แยกสำเร็จ
- ประกอบ SLA 10 commits โดยแยก `478229b` เป็น commit ใหม่ `3f82d75` ที่ไม่มี Dashboard IV
- runtime เทียบกับ `main` ต่างเฉพาะการไม่มีหน้า Dashboard IV, analytics API ของ Dashboard IV และเมนู Dashboard IV
- migration dry-run พบ SQL 149–178 ครบ 30 ไฟล์ ไม่มีไฟล์อื่นปน
- `npm run test:sla`, TypeScript, targeted ESLint, production build และ `git diff --check` ผ่าน
- full-repository ESLint ยังพบ baseline errors 23 จุดในไฟล์นอก SLA; targeted ESLint ของไฟล์ release ผ่านทั้งหมด
- Development verification ผ่าน: BOOK_SURVEY anchor/version mismatch = 0, Proposal mismatch = 0, Deposit mismatch = 0
- HTTP smoke test: `/sla` = 200, `/dashboard-sla` = 404 และ `/api/version` = `2.0.24`
- ไม่มีการ push, apply migration Production หรือ deploy
