// Revert a single lead activity. Useful when sales logs the wrong follow-up
// note or schedules a date by mistake and the lead's next_follow_up now points
// at a stale value.
//
// Behaviour:
//   1. Print the lead + its recent activities (BEFORE).
//   2. Delete the target activity (latest by default, or a specific id).
//   3. Recompute leads.next_follow_up from the most recent remaining
//      activity that carries a follow_up_date (else NULL).
//   4. Print the lead + activities (AFTER).
//
// Usage:
//   node scripts/tools/revert_lead_activity.mjs --db=solardb_dev --lead=437
//   node scripts/tools/revert_lead_activity.mjs --db=solardb     --lead=437 --activity=1207 --yes
//
// --db is REQUIRED. --yes is REQUIRED to actually mutate.

import sql from "mssql";
import { readFileSync } from "fs";

const args = process.argv.slice(2);
const dbArg = args.find(a => a.startsWith("--db="));
const leadArg = args.find(a => a.startsWith("--lead="));
const actArg = args.find(a => a.startsWith("--activity="));
const execute = args.includes("--yes");

if (!dbArg || !leadArg) {
  console.error("Usage: node scripts/tools/revert_lead_activity.mjs --db=<solardb|solardb_dev> --lead=<id> [--activity=<id>] [--yes]");
  process.exit(1);
}

const database = dbArg.split("=")[1];
const leadId = parseInt(leadArg.split("=")[1]);
const targetActivityId = actArg ? parseInt(actArg.split("=")[1]) : null;

// Borrow DB password from .env.local so the script doesn't carry secrets.
try {
  const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
} catch { /* fall through to literal defaults */ }

const pool = await sql.connect({
  server: process.env.DB_SERVER || "172.41.1.73",
  port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER || "monchiant",
  password: process.env.DB_PASSWORD || "monchiant",
  database,
  options: { encrypt: false, trustServerCertificate: true },
});

console.log(`Target DB:  ${database}`);
if (database === "solardb") console.log("⚠️  PRODUCTION DATABASE");
console.log(`Lead:       ${leadId}`);
console.log(`Activity:   ${targetActivityId ?? "latest"}`);
console.log(`Mode:       ${execute ? "EXECUTE" : "DRY-RUN (pass --yes to apply)"}\n`);

const showLead = async (label) => {
  const r = await pool.request().input("id", sql.Int, leadId).query(`
    SELECT id, full_name, status, next_follow_up FROM leads WHERE id = @id
  `);
  console.log(`${label} — lead:`);
  console.table(r.recordset);
  const a = await pool.request().input("id", sql.Int, leadId).query(`
    SELECT TOP 5 id, activity_type, title, note, follow_up_date, followup_date, created_at
    FROM lead_activities WHERE lead_id = @id ORDER BY created_at DESC
  `);
  console.log(`${label} — recent activities (top 5):`);
  console.table(a.recordset);
};

await showLead("BEFORE");

// Pick the activity to delete.
let activityIdToDelete = targetActivityId;
if (!activityIdToDelete) {
  const r = await pool.request().input("id", sql.Int, leadId).query(`
    SELECT TOP 1 id FROM lead_activities WHERE lead_id = @id ORDER BY created_at DESC
  `);
  activityIdToDelete = r.recordset[0]?.id ?? null;
}
if (!activityIdToDelete) {
  console.log("No activities to delete — exit.");
  await pool.close();
  process.exit(0);
}
console.log(`Will delete activity id=${activityIdToDelete}`);

if (!execute) {
  console.log("\nDry-run only. Pass --yes to delete + recompute next_follow_up.");
  await pool.close();
  process.exit(0);
}

// Delete the target activity.
const del = await pool.request().input("id", sql.Int, activityIdToDelete)
  .input("lead", sql.Int, leadId)
  .query(`DELETE FROM lead_activities WHERE id = @id AND lead_id = @lead`);
console.log(`Deleted ${del.rowsAffected[0]} row(s).`);

// Recompute next_follow_up = max(follow_up_date) of remaining activities,
// or NULL if no such row exists.
const recompute = await pool.request().input("id", sql.Int, leadId).query(`
  SELECT MAX(follow_up_date) AS next_follow_up
  FROM lead_activities
  WHERE lead_id = @id AND follow_up_date IS NOT NULL
`);
const newNext = recompute.recordset[0]?.next_follow_up ?? null;

await pool.request()
  .input("id", sql.Int, leadId)
  .input("nfu", sql.Date, newNext)
  .query(`UPDATE leads SET next_follow_up = @nfu, updated_at = GETDATE() WHERE id = @id`);
console.log(`Updated lead.next_follow_up → ${newNext ? newNext.toISOString().slice(0, 10) : "NULL"}`);

await showLead("\nAFTER");

await pool.close();
