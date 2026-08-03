// Cancel every quotation for one lead and reset it to a fresh Step 03.
// Historical quotation rows, items, approval events and PDF artifacts remain.
// Development database only; dry-run unless --yes is supplied.
//
//   node scripts/tools/reset_lead_quotations.mjs --lead=730
//   node scripts/tools/reset_lead_quotations.mjs --lead=730 --yes
import sql from "mssql";

const args = process.argv.slice(2);
const leadId = Number(
  args.find((argument) => argument.startsWith("--lead="))?.slice(7),
);
const execute = args.includes("--yes");

if (!Number.isInteger(leadId) || leadId <= 0) {
  console.error("Missing or invalid --lead=<id>");
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

const before = await pool.request().input("lead", sql.Int, leadId).query(`
  SELECT id, full_name, status, quotation_doc_no, quotation_amount,
    quotation_accepted_idx, order_total
  FROM leads WHERE id=@lead;

  SELECT id, option_no, revision_no, doc_no, status,
    contract_total_incl_vat
  FROM quotations WHERE lead_id=@lead
  ORDER BY option_no, revision_no;

  SELECT id, step_no, amount, confirmed_at
  FROM payments WHERE lead_id=@lead AND step_no>=3 ORDER BY id;
`);

const lead = before.recordsets[0]?.[0];
const quotations = before.recordsets[1] || [];
const orderPayments = before.recordsets[2] || [];

if (!lead) {
  console.error(`Lead ${leadId} not found in solardb_dev.`);
  await pool.close();
  process.exit(1);
}

console.log(`Target DB: solardb_dev · Mode: ${execute ? "EXECUTE" : "DRY-RUN"}`);
console.table([lead]);
console.table(quotations);
console.log(`Order payments: ${orderPayments.length}`);

if (orderPayments.length > 0) {
  console.error("Refusing reset: this lead has Step 04+ payment records.");
  await pool.close();
  process.exit(1);
}

if (!execute) {
  console.log(
    "Would mark all quotations cancelled, clear quotation/order handoff fields, and set status='quote'.",
  );
  await pool.close();
  process.exit(0);
}

const tx = new sql.Transaction(pool);
await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
try {
  const lockedLead = await new sql.Request(tx)
    .input("lead", sql.Int, leadId)
    .query(`SELECT id,status FROM leads WITH (UPDLOCK,HOLDLOCK) WHERE id=@lead`);
  if (!lockedLead.recordset[0]) throw new Error("Lead disappeared during reset");

  const paymentGuard = await new sql.Request(tx)
    .input("lead", sql.Int, leadId)
    .query(`SELECT COUNT(*) AS count FROM payments WHERE lead_id=@lead AND step_no>=3`);
  if (Number(paymentGuard.recordset[0].count) > 0) {
    throw new Error("Order payment appeared during reset");
  }

  await new sql.Request(tx)
    .input("lead", sql.Int, leadId)
    .input("by", sql.Int, 1)
    .input("old_status", sql.NVarChar(30), lead.status)
    .query(`
      INSERT quotation_approval_events(
        quotation_id, action, from_status, to_status, note, acted_by
      )
      SELECT id, 'cancelled', status, 'cancelled',
        N'ยกเลิกใบเสนอราคาเดิมทั้งหมดเพื่อเริ่ม Step 03 ใหม่', @by
      FROM quotations
      WHERE lead_id=@lead AND status<>'cancelled';

      UPDATE quotations SET
        status='cancelled',
        updated_by=@by,
        updated_at=GETDATE()
      WHERE lead_id=@lead AND status<>'cancelled';

      UPDATE leads SET
        status='quote',
        quotation_note=NULL,
        quotation_files=NULL,
        quotation_amount=NULL,
        quotation_by=NULL,
        quotation_doc_no=NULL,
        quotation_sent_date=NULL,
        quote_sent_by=NULL,
        quotation_type=NULL,
        quotation_accepted_idx=NULL,
        order_total=NULL,
        order_pct_before=NULL,
        order_pct_after=NULL,
        order_before_paid=0,
        order_before_slip=NULL,
        order_after_paid=0,
        order_after_slip=NULL,
        order_before_paid_by=NULL,
        order_after_paid_by=NULL,
        order_installments=NULL,
        order_discount_pct=NULL,
        order_discount_amount=NULL,
        order_discount_note=NULL,
        updated_at=SYSUTCDATETIME()
      WHERE id=@lead;

      INSERT lead_activities(
        lead_id, activity_type, title, old_status, new_status,
        created_by, created_at
      )
      VALUES(
        @lead, 'quotation',
        N'ยกเลิกใบเสนอราคาเดิมทั้งหมดและเริ่ม Step 03 ใหม่',
        @old_status, 'quote', @by, SYSUTCDATETIME()
      );
    `);

  await tx.commit();
} catch (error) {
  await tx.rollback();
  console.error("FAILED, rolled back:", error.message);
  await pool.close();
  process.exit(1);
}

const after = await pool.request().input("lead", sql.Int, leadId).query(`
  SELECT id, full_name, status, quotation_files, quotation_doc_no,
    quotation_amount, quotation_accepted_idx, order_total
  FROM leads WHERE id=@lead;
  SELECT id, option_no, revision_no, doc_no, status
  FROM quotations WHERE lead_id=@lead ORDER BY option_no, revision_no;
`);
console.log("After:");
console.table(after.recordsets[0]);
console.table(after.recordsets[1]);
await pool.close();
