// Copy DEFAULT constraints from solardb (prod) to solardb_dev. Standalone fix
// for cases where copy_db.mjs ran and SELECT INTO stripped them. Idempotent —
// drops the dev default first if present, then re-adds with the prod definition.

import sql from 'mssql';

const SRC = 'solardb';
const DST = 'solardb_dev';
const EXECUTE = process.argv.includes('--yes');

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433,
  user: 'monchiant', password: 'monchiant',
  database: 'master',
  options: { encrypt: false, trustServerCertificate: true },
});

const defaults = (await pool.request().query(`
  SELECT t.name AS tbl, c.name AS col, dc.name AS dc_name, dc.definition AS def
  FROM [${SRC}].sys.default_constraints dc
  JOIN [${SRC}].sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
  JOIN [${SRC}].sys.tables t ON c.object_id = t.object_id
  ORDER BY t.name, c.name
`)).recordset;

console.log(`${defaults.length} defaults in ${SRC}\n`);

let ok = 0, skip = 0, err = 0;
for (const d of defaults) {
  // Check column exists in dst
  const exists = (await pool.request().query(`
    SELECT COUNT(*) AS n
    FROM [${DST}].sys.columns c
    JOIN [${DST}].sys.tables t ON c.object_id = t.object_id
    WHERE t.name = '${d.tbl}' AND c.name = '${d.col}'
  `)).recordset[0].n;
  if (!exists) {
    console.log(`SKIP ${d.tbl}.${d.col} — not in dst`);
    skip++;
    continue;
  }

  if (!EXECUTE) {
    console.log(`WOULD ADD ${d.tbl}.${d.col} DEFAULT ${d.def}`);
    continue;
  }

  try {
    // Drop existing default constraint on this column in dst (if any)
    await pool.request().query(`
      DECLARE @name SYSNAME;
      SELECT @name = dc.name
      FROM [${DST}].sys.default_constraints dc
      JOIN [${DST}].sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
      JOIN [${DST}].sys.tables t ON c.object_id = t.object_id
      WHERE t.name = '${d.tbl}' AND c.name = '${d.col}';
      IF @name IS NOT NULL EXEC('ALTER TABLE [${DST}].dbo.[${d.tbl}] DROP CONSTRAINT [' + @name + ']');
    `);

    await pool.request().query(`
      ALTER TABLE [${DST}].dbo.[${d.tbl}]
      ADD CONSTRAINT [${d.dc_name}] DEFAULT ${d.def} FOR [${d.col}]
    `);
    console.log(`OK   ${d.tbl}.${d.col} ${d.def}`);
    ok++;
  } catch (e) {
    console.log(`ERR  ${d.tbl}.${d.col}: ${e.message}`);
    err++;
  }
}

console.log(`\nDone. ok=${ok} skip=${skip} err=${err}${EXECUTE ? '' : ' (dry-run, pass --yes to apply)'}`);
await pool.close();
