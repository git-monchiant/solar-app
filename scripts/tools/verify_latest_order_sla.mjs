import fs from "node:fs";
import sql from "mssql";

const database = (process.argv.find(arg => arg.startsWith("--db=")) || "").split("=")[1];
const migration = (process.argv.find(arg => arg.startsWith("--migration=")) || "").split("=")[1];
const repeat = Number((process.argv.find(arg => arg.startsWith("--repeat=")) || "--repeat=1").split("=")[1]);

if (database !== "solardb_dev") {
  console.error("Verification is restricted to --db=solardb_dev");
  process.exit(1);
}

const pool = await sql.connect({
  server: "172.41.1.73",
  port: 1433,
  user: "monchiant",
  password: "monchiant",
  database,
  options: { encrypt: false, trustServerCertificate: true },
});

const transaction = migration ? new sql.Transaction(pool) : null;
if (transaction) {
  await transaction.begin();
  const source = fs.readFileSync(migration, "utf8");
  for (let run = 0; run < repeat; run += 1) {
    await new sql.Request(transaction).batch(source);
  }
}

const request = transaction ? new sql.Request(transaction) : pool.request();
const result = await request.query(`
  ;WITH latest_order AS (
    SELECT l.id lead_id,latest.id activity_id,latest.created_at occurred_at
    FROM leads l
    CROSS APPLY (
      SELECT TOP 1 a.id,a.created_at
      FROM lead_activities a
      WHERE a.lead_id=l.id AND a.activity_type='status_change' AND a.new_status='order'
        AND a.title NOT LIKE N'%rollback%' AND a.title NOT LIKE N'%revert%' AND a.title NOT LIKE N'%ย้อนกลับ%'
      ORDER BY a.created_at DESC,a.id DESC
    ) latest
    WHERE l.status IN ('order','install','warranty','gridtie','closed')
  )
  SELECT
    (SELECT COUNT(*) FROM sla_policies WHERE policy_code='PROPOSAL_ROI' AND version=5 AND is_active=1) proposal_v5,
    (SELECT COUNT(*) FROM sla_policies WHERE policy_code='DEPOSIT_CLOSE' AND version=4 AND is_active=1) deposit_v4,
    (SELECT COUNT(*) FROM lead_sla_instances si JOIN latest_order o ON o.lead_id=si.lead_id
      WHERE si.policy_code='PROPOSAL_ROI' AND si.status NOT IN ('cancelled','superseded')
        AND (si.completed_at<>o.occurred_at OR ISNULL(si.completion_activity_id,-1)<>o.activity_id)) proposal_mismatch,
    (SELECT COUNT(*) FROM lead_sla_instances si JOIN latest_order o ON o.lead_id=si.lead_id
      WHERE si.policy_code='DEPOSIT_CLOSE' AND si.status NOT IN ('cancelled','superseded')
        AND si.started_at<>o.occurred_at) deposit_mismatch,
    (SELECT COUNT(*) FROM lead_sla_events WHERE event_key LIKE 'sla-completion-latest-order:%') proposal_corrections,
    (SELECT COUNT(*) FROM lead_sla_events WHERE event_key LIKE 'sla-anchor-latest-order:%') deposit_corrections;

  SELECT si.policy_code,si.policy_version,si.started_at,si.due_at,si.status,
         si.completed_at,si.completion_activity_id
  FROM lead_sla_instances si
  WHERE si.lead_id=882 AND si.policy_code IN ('PROPOSAL_ROI','DEPOSIT_CLOSE')
  ORDER BY si.policy_code;
`);

console.log(JSON.stringify({ summary: result.recordsets[0][0], lead882: result.recordsets[1] }, null, 2));

if (transaction) await transaction.rollback();
await pool.close();

const summary = result.recordsets[0][0];
if (summary.proposal_v5 !== 1 || summary.deposit_v4 !== 1
  || summary.proposal_mismatch !== 0 || summary.deposit_mismatch !== 0) {
  process.exit(2);
}
