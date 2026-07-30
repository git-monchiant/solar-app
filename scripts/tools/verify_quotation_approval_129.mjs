// Verify migration 129 without persisting quotation changes.
// Usage: node --env-file=.env.local scripts/tools/verify_quotation_approval_129.mjs --db=solardb_dev

import sql from "mssql";

const dbArg = process.argv.find((arg) => arg.startsWith("--db="));
const database = dbArg?.split("=")[1];
if (database !== "solardb_dev") {
  console.error("Verification is restricted to --db=solardb_dev");
  process.exit(1);
}

const pool = await sql.connect({
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT || 1433),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database,
  options: { encrypt: false, trustServerCertificate: true },
});

try {
  const result = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM sys.columns
        WHERE object_id = OBJECT_ID('dbo.quotations')
          AND name IN ('solar_approved_by','solar_approved_at','solar_approval_note')) columns_ready,
      (SELECT COUNT(*) FROM quotations WHERE status = 'pending_approval') legacy_pending,
      (SELECT COUNT(*) FROM quotations WHERE status = 'pending_solar_sup') pending_solar,
      (SELECT COUNT(*) FROM quotations WHERE status = 'pending_sales_sup') pending_sales,
      (SELECT COUNT(*) FROM users
        WHERE is_active = 1
          AND EXISTS (SELECT 1 FROM OPENJSON(roles) WHERE value = 'solar_sup')) solar_sup_users;

    SELECT definition
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.quotations')
      AND name = 'CK_quotations_status';
  `);

  const checks = result.recordsets[0][0];
  const definition = result.recordsets[1][0]?.definition || "";
  if (checks.columns_ready !== 3) throw new Error("Migration columns are incomplete");
  if (!definition.includes("pending_solar_sup") || !definition.includes("pending_sales_sup")) {
    throw new Error("Quotation status constraint is incomplete");
  }
  if (checks.legacy_pending !== 0) throw new Error("Legacy pending rows were not migrated");

  const tx = new sql.Transaction(pool);
  await tx.begin();
  let transitionTest = "skipped-no-quotation";
  try {
    const sample = await new sql.Request(tx).query(`SELECT TOP 1 id FROM quotations ORDER BY id`);
    const quotationId = sample.recordset[0]?.id;
    if (quotationId) {
      const request = new sql.Request(tx).input("id", sql.Int, quotationId);
      await request.query(`UPDATE quotations SET status = 'pending_solar_sup' WHERE id = @id`);
      await request.query(`UPDATE quotations SET status = 'pending_sales_sup' WHERE id = @id`);
      await request.query(`UPDATE quotations SET status = 'changes_required' WHERE id = @id`);
      transitionTest = "passed-and-rolled-back";
    }
  } finally {
    await tx.rollback();
  }

  console.log(JSON.stringify({ ...checks, transition_test: transitionTest }));
} finally {
  await pool.close();
}
