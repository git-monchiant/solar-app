import sql from 'mssql';
import fs from 'fs';

const pool = await sql.connect({
  server: '172.41.1.73', port: 1433, user: 'monchiant', password: 'monchiant',
  database: 'SolarDB', options: { encrypt: false, trustServerCertificate: true }
});

const outFile = 'sql/solardb_clone.sql';
const lines = [];

lines.push(`-- Clone of SolarDB generated ${new Date().toISOString()}`);
lines.push(`-- Usage: sqlcmd -S ... -d SolarDb_UAT -i this-file.sql`);
lines.push(``);

// 1. Tables + columns
const tables = (await pool.request().query(`
  SELECT t.object_id, t.name
  FROM sys.tables t
  WHERE t.is_ms_shipped = 0
  ORDER BY t.name
`)).recordset;

console.log(`${tables.length} tables`);

const escape = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Date) return `'${v.toISOString().replace('T', ' ').replace('Z', '')}'`;
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  const s = String(v).replace(/'/g, "''");
  return `N'${s}'`;
};

const typeStr = (c) => {
  const t = c.type_name;
  if (['int', 'bigint', 'smallint', 'tinyint', 'bit', 'date', 'datetime', 'datetime2', 'smalldatetime', 'uniqueidentifier', 'money', 'smallmoney', 'real', 'float', 'image', 'text', 'ntext', 'xml', 'geography'].includes(t)) return t;
  if (['decimal', 'numeric'].includes(t)) return `${t}(${c.precision},${c.scale})`;
  if (['char', 'varchar'].includes(t)) return `${t}(${c.max_length === -1 ? 'MAX' : c.max_length})`;
  if (['nchar', 'nvarchar'].includes(t)) return `${t}(${c.max_length === -1 ? 'MAX' : c.max_length / 2})`;
  if (['binary', 'varbinary'].includes(t)) return `${t}(${c.max_length === -1 ? 'MAX' : c.max_length})`;
  if (t === 'time') return `time(${c.scale})`;
  return t;
};

// Load all columns + identity + default per table
for (const t of tables) {
  const cols = (await pool.request().input('oid', sql.Int, t.object_id).query(`
    SELECT c.name, TYPE_NAME(c.user_type_id) AS type_name, c.max_length, c.precision, c.scale,
      c.is_nullable, c.is_identity,
      IDENT_SEED(OBJECT_NAME(c.object_id)) AS seed, IDENT_INCR(OBJECT_NAME(c.object_id)) AS incr,
      dc.definition AS default_def
    FROM sys.columns c
    LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
    WHERE c.object_id = @oid
    ORDER BY c.column_id
  `)).recordset;

  lines.push(`-- ==== Table: ${t.name} ====`);
  lines.push(`IF OBJECT_ID('dbo.${t.name}', 'U') IS NOT NULL DROP TABLE dbo.${t.name};`);
  lines.push(`GO`);
  const colDefs = cols.map(c => {
    let def = `  [${c.name}] ${typeStr(c)}`;
    if (c.is_identity) def += ` IDENTITY(${c.seed || 1},${c.incr || 1})`;
    def += c.is_nullable ? ' NULL' : ' NOT NULL';
    if (c.default_def) def += ` DEFAULT ${c.default_def}`;
    return def;
  });
  lines.push(`CREATE TABLE dbo.${t.name} (`);
  lines.push(colDefs.join(',\n'));
  lines.push(`);`);
  lines.push(`GO`);

  // Data
  const hasIdentity = cols.some(c => c.is_identity);
  const data = (await pool.request().query(`SELECT * FROM dbo.${t.name}`)).recordset;
  if (data.length > 0) {
    if (hasIdentity) lines.push(`SET IDENTITY_INSERT dbo.${t.name} ON;`);
    const colList = cols.map(c => `[${c.name}]`).join(', ');
    // batch 100 per insert
    for (let i = 0; i < data.length; i += 100) {
      const batch = data.slice(i, i + 100);
      const valuesList = batch.map(row => {
        const vals = cols.map(c => escape(row[c.name]));
        return `(${vals.join(', ')})`;
      }).join(',\n  ');
      lines.push(`INSERT INTO dbo.${t.name} (${colList}) VALUES\n  ${valuesList};`);
    }
    if (hasIdentity) lines.push(`SET IDENTITY_INSERT dbo.${t.name} OFF;`);
    lines.push(`GO`);
  }
  lines.push(``);
  console.log(`  ${t.name}: ${cols.length} cols, ${data.length} rows`);
}

// 2. Primary keys
lines.push(`-- ==== Primary Keys ====`);
const pks = (await pool.request().query(`
  SELECT kc.name AS constraint_name, OBJECT_NAME(kc.parent_object_id) AS table_name,
    STUFF((SELECT ', [' + c.name + ']'
           FROM sys.index_columns ic
           JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
           WHERE ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
           ORDER BY ic.key_ordinal
           FOR XML PATH('')), 1, 2, '') AS cols
  FROM sys.key_constraints kc
  WHERE kc.type = 'PK'
`)).recordset;
for (const pk of pks) {
  lines.push(`ALTER TABLE dbo.${pk.table_name} ADD CONSTRAINT ${pk.constraint_name} PRIMARY KEY (${pk.cols});`);
}
lines.push(`GO`);

// 3. Foreign keys
lines.push(`-- ==== Foreign Keys ====`);
const fks = (await pool.request().query(`
  SELECT fk.name AS fk_name, OBJECT_NAME(fk.parent_object_id) AS tbl,
    STUFF((SELECT ', [' + pc.name + ']' FROM sys.foreign_key_columns fkc
           JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
           WHERE fkc.constraint_object_id = fk.object_id ORDER BY fkc.constraint_column_id
           FOR XML PATH('')), 1, 2, '') AS p_cols,
    OBJECT_NAME(fk.referenced_object_id) AS ref_tbl,
    STUFF((SELECT ', [' + rc.name + ']' FROM sys.foreign_key_columns fkc
           JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
           WHERE fkc.constraint_object_id = fk.object_id ORDER BY fkc.constraint_column_id
           FOR XML PATH('')), 1, 2, '') AS r_cols
  FROM sys.foreign_keys fk
`)).recordset;
for (const fk of fks) {
  lines.push(`ALTER TABLE dbo.${fk.tbl} ADD CONSTRAINT ${fk.fk_name} FOREIGN KEY (${fk.p_cols}) REFERENCES dbo.${fk.ref_tbl}(${fk.r_cols});`);
}
lines.push(`GO`);

fs.writeFileSync(outFile, lines.join('\n'));
console.log(`\n✓ Script: ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB)`);
console.log(`  PKs: ${pks.length}, FKs: ${fks.length}`);
await pool.close();
