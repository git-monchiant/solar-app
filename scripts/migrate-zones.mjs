// One-shot migration: replace zones with 3 Bangkok teams.
// Run: node scripts/migrate-zones.mjs
import sql from "mssql";
import { readFileSync } from "fs";

// Load .env.local manually (no dotenv dep).
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const config = {
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "solardb",
  options: { trustServerCertificate: true, encrypt: false, useUTC: false },
};

const NEW_ZONES = [
  { name: "กรุงเทพ ทีม 1", color: "#ef4444" }, // red
  { name: "กรุงเทพ ทีม 2", color: "#3b82f6" }, // blue
  { name: "กรุงเทพ ทีม 3", color: "#10b981" }, // emerald
];

const DEFAULT_ZONE = NEW_ZONES[0].name;

const pool = await sql.connect(config);

console.log("Before:");
const before = await pool.request().query("SELECT id, name, color, is_active FROM zones");
console.table(before.recordset);

// Reassign any leads on old zones to the default new zone.
const reassign = await pool.request()
  .input("def", sql.NVarChar(100), DEFAULT_ZONE)
  .query("UPDATE leads SET zone = @def WHERE zone IS NOT NULL");
console.log(`Reassigned ${reassign.rowsAffected[0]} leads to "${DEFAULT_ZONE}"`);

// Wipe + insert.
await pool.request().query("DELETE FROM zones");
for (const z of NEW_ZONES) {
  await pool.request()
    .input("name", sql.NVarChar(100), z.name)
    .input("color", sql.NVarChar(20), z.color)
    .query("INSERT INTO zones (name, color, is_active) VALUES (@name, @color, 1)");
}

console.log("After:");
const after = await pool.request().query("SELECT id, name, color, is_active FROM zones ORDER BY id");
console.table(after.recordset);

await pool.close();
