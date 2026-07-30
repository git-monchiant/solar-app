// Revert a development lead from Step 04 (order) to Step 03 (quote), located
// by quotation document number. Scope is status only: quotation, order and
// payment data remain intact for testing. Every applied change is audited.
//
// Dry-run:
//   node scripts/tools/revert_lead_by_quotation_to_quote.mjs --doc=SM-QT-26-0007
// Apply to development:
//   node scripts/tools/revert_lead_by_quotation_to_quote.mjs --doc=SM-QT-26-0007 --yes
import sql from "mssql";

const args = process.argv.slice(2);
const docNo = args.find((arg) => arg.startsWith("--doc="))?.slice(6).trim();
const execute = args.includes("--yes");

if (!docNo) {
  console.error("Missing required --doc=SM-QT-YY-XXXX");
  process.exit(1);
}

const pool = await sql.connect({
  server: process.env.DB_SERVER || "172.41.1.73",
  port: Number(process.env.DB_PORT || 1433),
  user: process.env.DB_USER || "monchiant",
  password: process.env.DB_PASSWORD || "monchiant",
  database: "solardb_dev",
  options: { encrypt: false, trustServerCertificate: true },
});

const lookup = await pool
  .request()
  .input("doc", sql.NVarChar(50), docNo)
  .query(`
    SELECT
      l.id, l.full_name, l.status, l.quotation_doc_no,
      l.quotation_amount, l.quotation_accepted_idx, l.order_total,
      q.id AS quotation_id, q.doc_no, q.status AS quotation_status,
      (SELECT COUNT(*) FROM payments p WHERE p.lead_id = l.id) AS payment_count
    FROM quotations q
    INNER JOIN leads l ON l.id = q.lead_id
    WHERE q.doc_no = @doc
  `);

if (lookup.recordset.length !== 1) {
  console.error(
    `Expected exactly one lead for ${docNo}, found ${lookup.recordset.length}.`,
  );
  await pool.close();
  process.exit(1);
}

const lead = lookup.recordset[0];
console.log("Target DB: solardb_dev");
console.log(`Mode: ${execute ? "EXECUTE" : "DRY-RUN"}`);
console.table([lead]);

if (!execute) {
  console.log("Would update leads.status to 'quote' and add an activity log.");
  await pool.close();
  process.exit(0);
}

if (lead.status !== "order") {
  console.error(`Refusing to apply: current status is '${lead.status}', not 'order'.`);
  await pool.close();
  process.exit(1);
}

const tx = new sql.Transaction(pool);
await tx.begin();
try {
  await new sql.Request(tx).input("id", sql.Int, lead.id).query(`
    UPDATE leads
    SET status = 'quote', updated_at = SYSUTCDATETIME()
    WHERE id = @id AND status = 'order'
  `);

  await new sql.Request(tx)
    .input("id", sql.Int, lead.id)
    .input("by", sql.Int, 1)
    .input("doc", sql.NVarChar(50), docNo)
    .query(`
      INSERT lead_activities(
        lead_id, activity_type, title, old_status, new_status,
        created_by, created_at
      )
      VALUES(
        @id, 'status_change',
        N'ถอยกลับ Step 03 ใบเสนอราคาเพื่อทดสอบ (' + @doc + N' · เก็บข้อมูลเดิมทั้งหมด)',
        'order', 'quote',
        @by, SYSUTCDATETIME()
      )
    `);
  await tx.commit();
} catch (error) {
  await tx.rollback();
  console.error("FAILED, rolled back:", error.message);
  await pool.close();
  process.exit(1);
}

const after = await pool
  .request()
  .input("id", sql.Int, lead.id)
  .query(`SELECT id, full_name, status, quotation_doc_no FROM leads WHERE id=@id`);
console.log("After:");
console.table(after.recordset);
await pool.close();
