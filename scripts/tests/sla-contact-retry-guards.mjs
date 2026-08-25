import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const service = read("src/lib/sla-service.ts");
const timelineRoute = read("src/app/api/(lead)/leads/[id]/sla/route.ts");
const dashboardRoute = read("src/app/api/(lead)/sla/dashboard/route.ts");
const todayRoute = read("src/app/api/(lead)/today/route.ts");
const leadsRoute = read("src/app/api/(lead)/leads/route.ts");
const leadRoute = read("src/app/api/(lead)/leads/[id]/route.ts");
const migration171 = read("scripts/migrations/171_replay_contact_retry_backfill.sql");
const migration180 = read("scripts/migrations/180_contact_retry_legacy_guard.sql");

for (const [name, source] of [
  ["timeline", timelineRoute],
  ["dashboard", dashboardRoute],
  ["today", todayRoute],
  ["leads", leadsRoute],
  ["lead detail", leadRoute],
]) {
  assert.match(source, /superseded_at IS NULL/i, `${name} must ignore superseded SLA instances`);
}

assert.match(
  service,
  /policy_code = 'FIRST_CONTACT' OR \(policy_code = 'CONTACT_RETRY' AND policy_version = 2\)/,
  "contact processing must use only the sequential CONTACT_RETRY policy",
);
assert.match(service, /WHERE si\.status IN[\s\S]{0,160}si\.superseded_at IS NULL/, "state refresh must ignore superseded instances");
assert.match(migration171, /NOT EXISTS\([\s\S]*policy_version>=2[\s\S]*sequentialActualStart/, "migration 171 must not replay over v2");
assert.match(migration180, /status='superseded'/, "migration 180 must retire legacy rows without deleting them");
assert.doesNotMatch(migration180, /DELETE\s+FROM\s+dbo\.lead_sla_/i, "migration 180 must preserve SLA audit rows");

console.log("SLA CONTACT_RETRY guard checks passed");
