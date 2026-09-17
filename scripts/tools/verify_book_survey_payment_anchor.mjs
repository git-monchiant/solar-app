import sql from "mssql";

const database = (process.argv.find((arg) => arg.startsWith("--db=")) || "").split("=")[1];
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

const result = await pool.request().query(`
  SELECT
    (SELECT COUNT(*) FROM sla_policies
      WHERE policy_code='BOOK_SURVEY' AND version=5 AND is_active=1) active_v5,
    (SELECT COUNT(*) FROM lead_sla_instances si JOIN leads l ON l.id=si.lead_id
      WHERE si.policy_code='BOOK_SURVEY'
        AND si.status IN ('active','warning','critical','breached')
        AND ISNULL(l.payment_confirmed,0)=0) open_unpaid,
    (SELECT COUNT(*) FROM lead_sla_instances si JOIN leads l ON l.id=si.lead_id
      WHERE si.policy_code='BOOK_SURVEY'
        AND si.status IN ('active','warning','critical','breached')
        AND l.payment_confirmed=1 AND si.policy_version<>5) open_paid_wrong_version,
    (SELECT COUNT(*) FROM leads
      WHERE payment_confirmed=1 AND survey_ready_at IS NULL) paid_missing_anchor,
    (SELECT COUNT(*) FROM lead_sla_instances
      WHERE policy_code='BOOK_SURVEY' AND status='completed') completed_history
`);

console.log(JSON.stringify(result.recordset[0], null, 2));
await pool.close();

const row = result.recordset[0];
if (row.active_v5 !== 1 || row.open_unpaid !== 0 || row.open_paid_wrong_version !== 0 || row.paid_missing_anchor !== 0) {
  process.exit(2);
}
