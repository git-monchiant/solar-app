/**
 * Reset every file/blob attachment column on leads back to NULL/0.
 * Pairs with deleting the public/uploads files — without this the app would
 * show broken thumbnails for URLs that point at files we just removed.
 */
import sql from "mssql";
import { readFileSync } from "fs";

const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const pool = await sql.connect({
  server: process.env.DB_SERVER, port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "solardb",
  options: { trustServerCertificate: true, encrypt: false },
});

const r = await pool.request().query(`
  UPDATE leads SET
    pre_slip_url = NULL,
    pre_bill_photo_url = NULL,
    house_reg_photo_url = NULL,
    id_card_photo_url = NULL,
    quotation_files = NULL,
    finance_documents = NULL,
    survey_photo_building_url = NULL,
    survey_photo_inverter_point_url = NULL,
    survey_photo_mdb_url = NULL,
    survey_photo_roof_structure_url = NULL,
    survey_customer_signature_url = NULL,
    survey_customer_signature_data = NULL,
    survey_customer_signature_mime = NULL,
    install_customer_signature_url = NULL,
    install_customer_signature_data = NULL,
    install_customer_signature_mime = NULL,
    warranty_customer_signature_url = NULL,
    warranty_customer_signature_data = NULL,
    warranty_customer_signature_mime = NULL,
    warranty_doc_url = NULL,
    warranty_inverter_cert_url = NULL,
    warranty_inverter_sn_photo_url = NULL,
    warranty_other_docs_url = NULL,
    warranty_panel_cert_url = NULL,
    warranty_panel_serials_url = NULL,
    grid_permit_doc_url = NULL
`);
console.log(`reset attachment columns on ${r.rowsAffected[0]} leads`);

await pool.close();
