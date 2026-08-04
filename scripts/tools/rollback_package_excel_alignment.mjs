// Restore Package Master data from backups created before migration 135.
// Schema columns added by migration 135 are retained and cleared; dropping
// additive nullable columns is intentionally a separate, non-emergency step.
//
// Usage:
//   node --env-file=.env.local scripts/tools/rollback_package_excel_alignment.mjs \
//     --db=solardb_dev \
//     --packages-backup=packages_bak_20260804_112819 \
//     --items-backup=package_items_bak_20260804_112819 \
//     --yes

import sql from "mssql";

const args = process.argv.slice(2);
const valueOf = (prefix) =>
  args.find((arg) => arg.startsWith(`${prefix}=`))?.slice(prefix.length + 1);

const database = valueOf("--db");
const packagesBackup = valueOf("--packages-backup");
const itemsBackup = valueOf("--items-backup");
const execute = args.includes("--yes");

if (!database || !packagesBackup || !itemsBackup) {
  console.error(
    "Usage: node --env-file=.env.local scripts/tools/rollback_package_excel_alignment.mjs --db=<solardb|solardb_dev> --packages-backup=<table> --items-backup=<table> [--yes]",
  );
  process.exit(1);
}
if (!["solardb", "solardb_dev"].includes(database)) {
  console.error(`Unsupported database "${database}".`);
  process.exit(1);
}
const validBackupName = /^(packages|package_items)_bak_\d{8}_\d{6}$/;
if (
  !validBackupName.test(packagesBackup) ||
  !validBackupName.test(itemsBackup) ||
  !packagesBackup.startsWith("packages_bak_") ||
  !itemsBackup.startsWith("package_items_bak_")
) {
  console.error("Backup table names do not match the expected timestamped format.");
  process.exit(1);
}

console.log(`Target DB:        ${database}`);
console.log(`Packages backup: ${packagesBackup}`);
console.log(`Items backup:    ${itemsBackup}`);
console.log(`Mode:            ${execute ? "EXECUTE" : "DRY-RUN (pass --yes to restore)"}`);
if (database === "solardb") console.log("WARNING: PRODUCTION DATABASE");
if (!execute) process.exit(0);

for (const required of ["DB_SERVER", "DB_USER", "DB_PASSWORD"]) {
  if (!process.env[required]) {
    console.error(`Missing ${required}; run with --env-file=.env.local.`);
    process.exit(1);
  }
}

const pool = await sql.connect({
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT || 1433),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database,
  options: { encrypt: false, trustServerCertificate: true, useUTC: false },
});

const transaction = new sql.Transaction(pool);
try {
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  const request = new sql.Request(transaction);
  const affectedIds = "1,2,3,4,5,6,7,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32";
  await request.batch(`
    SET XACT_ABORT ON;
    IF OBJECT_ID(N'dbo.${packagesBackup}', N'U') IS NULL
      THROW 50135, 'Packages backup table not found.', 1;
    IF OBJECT_ID(N'dbo.${itemsBackup}', N'U') IS NULL
      THROW 50135, 'Package-items backup table not found.', 1;
    IF (SELECT COUNT(*) FROM dbo.${packagesBackup}) <> 23
      THROW 50135, 'Unexpected packages backup row count.', 1;

    UPDATE p SET
      name=b.name, kwp=b.kwp, phase=b.phase, has_battery=b.has_battery,
      battery_kwh=b.battery_kwh, battery_brand=b.battery_brand,
      inverter_kw=b.inverter_kw, inverter_brand=b.inverter_brand,
      price=b.price, monthly_installment=b.monthly_installment,
      monthly_saving=b.monthly_saving, warranty_years=b.warranty_years,
      is_active=b.is_active, is_upgrade=b.is_upgrade,
      has_panel=b.has_panel, has_inverter=b.has_inverter,
      start_date=b.start_date, expire_date=b.expire_date,
      existing_kw=b.existing_kw, additional_kwp=b.additional_kwp,
      battery_count=b.battery_count, battery_cost=b.battery_cost,
      bms_count=b.bms_count, bms_cost=b.bms_cost,
      panel_brand=b.panel_brand, panel_cost_per_unit=b.panel_cost_per_unit,
      remark=b.remark
    FROM dbo.packages p
    JOIN dbo.${packagesBackup} b ON b.id=p.id;

    IF COL_LENGTH('dbo.packages','installed_kwp') IS NOT NULL
      UPDATE dbo.packages SET installed_kwp=NULL WHERE id IN (${affectedIds});
    IF COL_LENGTH('dbo.packages','panel_count') IS NOT NULL
      UPDATE dbo.packages SET panel_count=NULL WHERE id IN (${affectedIds});
    IF COL_LENGTH('dbo.packages','panel_watt') IS NOT NULL
      UPDATE dbo.packages SET panel_watt=NULL WHERE id IN (${affectedIds});
    IF COL_LENGTH('dbo.packages','inverter_model') IS NOT NULL
      UPDATE dbo.packages SET inverter_model=NULL WHERE id IN (${affectedIds});
    IF COL_LENGTH('dbo.packages','battery_model') IS NOT NULL
      UPDATE dbo.packages SET battery_model=NULL WHERE id IN (${affectedIds});

    UPDATE pi SET
      package_id=b.package_id, item_name=b.item_name, quantity=b.quantity,
      unit=b.unit, sort_order=b.sort_order, is_active=b.is_active,
      created_at=b.created_at, updated_at=b.updated_at
    FROM dbo.package_items pi
    JOIN dbo.${itemsBackup} b ON b.id=pi.id;

    UPDATE pi SET is_active=0, updated_at=GETDATE()
    FROM dbo.package_items pi
    WHERE pi.package_id IN (${affectedIds})
      AND NOT EXISTS (SELECT 1 FROM dbo.${itemsBackup} b WHERE b.id=pi.id);

    UPDATE q SET
      package_name_snapshot=p.name,
      package_price_snapshot=p.price,
      document_snapshot_json=NULL,
      financial_snapshot_json=NULL,
      document_snapshot_at=NULL,
      updated_at=GETDATE()
    FROM dbo.quotations q
    JOIN dbo.packages p ON p.id=q.package_id
    WHERE q.status=N'draft';

    DELETE a
    FROM dbo.quotation_document_artifacts a
    JOIN dbo.quotations q ON q.id=a.quotation_id
    WHERE q.status=N'draft';

    DELETE qi
    FROM dbo.quotation_items qi
    JOIN dbo.quotations q ON q.id=qi.quotation_id
    WHERE q.status=N'draft' AND qi.source_type=N'package';

    INSERT dbo.quotation_items(
      quotation_id,source_type,package_item_id,item_name_snapshot,
      quantity,unit,unit_price,line_total,sort_order
    )
    SELECT q.id,N'package',pi.id,pi.item_name,pi.quantity,pi.unit,0,0,pi.sort_order
    FROM dbo.quotations q
    JOIN dbo.package_items pi ON pi.package_id=q.package_id AND pi.is_active=1
    WHERE q.status=N'draft';

    ;WITH ranked AS (
      SELECT qi.id,
        ROW_NUMBER() OVER(PARTITION BY qi.quotation_id ORDER BY qi.sort_order,qi.id)-1 rn,
        c.cnt
      FROM dbo.quotation_items qi
      JOIN dbo.quotations q ON q.id=qi.quotation_id
      CROSS APPLY (
        SELECT COUNT(*) cnt FROM dbo.quotation_items pqi
        WHERE pqi.quotation_id=qi.quotation_id AND pqi.source_type=N'package'
      ) c
      WHERE q.status=N'draft' AND qi.source_type<>N'package'
    )
    UPDATE qi SET sort_order=ranked.cnt+ranked.rn
    FROM dbo.quotation_items qi JOIN ranked ON ranked.id=qi.id;

    DELETE dbo.app_settings WHERE [key]=N'migration_135_package_excel_v0';
  `);
  await transaction.commit();
  console.log("Rollback completed. Additive schema columns were retained and cleared.");
} catch (error) {
  try {
    await transaction.rollback();
  } catch {}
  console.error(`Rollback failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  await pool.close();
}
