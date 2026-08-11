<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:project-planning-rules -->
## Project Planning Records

When creating a plan for this project, save it in `docs/plan/` using:

```text
yyyymmdd-01-clear-plan-name.md
```

If multiple plans are created on the same day, increment the sequence:

```text
yyyymmdd-02-clear-plan-name.md
```

Use a short, understandable English slug for `clear-plan-name`.

When creating a mockup, save it under `docs/mockup/` using the same base name as the plan. For example:

```text
docs/plan/20260708-01-lead-detail-redesign.md
docs/mockup/20260708-01-lead-detail-redesign/
```

Track plan status in `docs/plan/_status.md`. Keep each plan marked as `backlog`, `in-progress`, `done`, or `cancelled` so the user can ask later which plans are completed and which remain in backlog.
<!-- END:project-planning-rules -->

<!-- BEGIN:git-workflow-rules -->
## Git Workflow

Whenever a feature is completed, ask the user whether to create a git commit.
If the user wants a commit, write the commit message in Thai and make it easy to understand.

### Branch & Release (ตั้งแต่เริ่มทำ v3 คู่ขนาน)

| branch | คือ | ใครแตะ |
|---|---|---|
| `main` | v2 = สิ่งที่อยู่บน prod | เฉพาะ bug fix / งานด่วน แล้ว deploy |
| `v3` | release branch ของ v3 (worktree: `../solar-app-v3`) | ทีม v3 |
| `v3/<feature>` | งานย่อยของ v3 | PR เข้า `v3` |

- **merge ทางเดียว `main → v3` เท่านั้น** ทำทุกครั้งหลัง deploy v2 (อย่างน้อยสัปดาห์ละครั้ง)
  ห้าม merge v3 กลับ main จนถึงวัน cutover — ไม่งั้นบั๊กที่แก้บน v2 จะหายไปตอน v3 ขึ้น
  และ conflict จะบานปลายในไฟล์ที่แก้บ่อย (OrderStep, QuotationBuilder)
- `deploy_prd.sh` ปฏิเสธทุกอย่างที่ไม่ใช่ `main` + tree สะอาด + sync กับ origin
  (ข้ามได้ด้วย `ALLOW_DIRTY=1` เฉพาะกรณีฉุกเฉิน) และ tag `v<version>` ให้อัตโนมัติเมื่อสำเร็จ
- DB: `solardb` = prod · `solardb_dev` = ทดสอบ fix ของ v2 · `solardb_v3` = ทีม v3
  (v3 มี migration ที่แก้ตารางเดิม ใช้ร่วมกับ dev ไม่ได้)
  refresh: `node scripts/tools/copy_db.mjs --dst=solardb_v3 --yes`
- migration ของ v3 อยู่ `scripts/migrations-v3/` (ดู README ในโฟลเดอร์)
<!-- END:git-workflow-rules -->

<!-- icm:start -->
## Persistent Memory (ICM) - Mandatory

This project uses [ICM](https://github.com/rtk-ai/icm) for persistent memory across sessions.
Use it actively for project context, decisions, preferences, and resolved errors.

If `icm` is not available in the current shell yet, use:

```powershell
& "$env:LOCALAPPDATA\icm\bin\icm.exe" <command>
```

### Recall Before Work

```bash
icm recall "query"
icm recall "query" -t "topic-name"
icm recall-context "query" --limit 5
```

### Store Required Events

Call `icm store` when any of these happen:

1. Error resolved: `icm store -t errors-resolved -c "description" -i high -k "keyword1,keyword2"`
2. Architecture or design decision: `icm store -t decisions-solar-v0 -c "description" -i high`
3. User preference discovered: `icm store -t preferences -c "description" -i critical`
4. Significant task completed: `icm store -t context-solar-v0 -c "summary of work done" -i high`
5. Conversation exceeds about 20 tool calls without a store: store a progress summary

Do not store trivial details, information already present in AGENTS.md, ephemeral logs, or raw git status.

### Other Commands

```bash
icm update <id> -c "updated content"
icm health
icm topics
```
<!-- icm:end -->
