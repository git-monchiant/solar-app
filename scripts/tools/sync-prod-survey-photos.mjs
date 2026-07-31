// Download missing Survey photos referenced by the Dev DB from Production.
// This is intentionally read-only toward both Production and the database.
// It never deletes or overwrites local files unless --overwrite is supplied.
//
// Usage:
//   node scripts/tools/sync-prod-survey-photos.mjs --dry-run
//   node scripts/tools/sync-prod-survey-photos.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sql from "mssql";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const uploadsDir = path.join(repoRoot, "public", "uploads");
const envPath = path.join(repoRoot, ".env.local");
const dryRun = process.argv.includes("--dry-run");
const overwrite = process.argv.includes("--overwrite");
const productionOrigin = "https://solar.senadigital.com";

function loadEnvFile(filename) {
  if (!fs.existsSync(filename)) return;
  for (const rawLine of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function collectUploadNames(value, names) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) collectUploadNames(item, names);
    return;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value)) collectUploadNames(item, names);
    return;
  }
  if (typeof value !== "string") return;

  const pattern = /\/(?:api\/files|uploads)\/([A-Za-z0-9._-]+)/g;
  for (const match of value.matchAll(pattern)) names.add(match[1]);

  if ((value.startsWith("{") || value.startsWith("[")) && value.length < 20_000_000) {
    try {
      collectUploadNames(JSON.parse(value), names);
    } catch {
      // Plain text fields can start with these characters; regex extraction above is enough.
    }
  }
}

loadEnvFile(envPath);

const database = process.env.DB_NAME || "solardb_dev";
if (!/_dev$/i.test(database)) {
  throw new Error(`Refusing to run: DB_NAME must be a Dev database, received "${database}"`);
}

const pool = await sql.connect({
  server: process.env.DB_SERVER || "172.41.1.73",
  port: Number(process.env.DB_PORT || 1433),
  user: process.env.DB_USER || "",
  password: process.env.DB_PASSWORD || "",
  database,
  options: { encrypt: false, trustServerCertificate: true, useUTC: false },
  requestTimeout: 120_000,
});

try {
  const names = new Set();
  const leads = await pool.request().query(`
    SELECT survey_photo_building_url,
           survey_photo_roof_structure_url,
           survey_photo_inverter_point_url,
           survey_photo_mdb_url,
           survey_photo_notes,
           survey_photos
    FROM leads
  `);
  for (const row of leads.recordset) collectUploadNames(row, names);

  const quotations = await pool.request().query(`
    SELECT document_snapshot_json
    FROM quotations
    WHERE document_snapshot_json IS NOT NULL
  `);
  for (const row of quotations.recordset) collectUploadNames(row.document_snapshot_json, names);

  fs.mkdirSync(uploadsDir, { recursive: true });
  const allNames = [...names].sort();
  const pending = allNames.filter((name) => overwrite || !fs.existsSync(path.join(uploadsDir, name)));

  console.log(`Database             : ${database}`);
  console.log(`Production origin    : ${productionOrigin}`);
  console.log(`Referenced photos    : ${allNames.length}`);
  console.log(`Already present      : ${allNames.length - pending.length}`);
  console.log(`Missing/to download  : ${pending.length}`);
  console.log(`Mode                 : ${dryRun ? "DRY-RUN" : overwrite ? "DOWNLOAD + OVERWRITE" : "DOWNLOAD MISSING ONLY"}`);

  if (dryRun || pending.length === 0) process.exitCode = 0;
  else {
    let downloaded = 0;
    let missing = 0;
    let failed = 0;

    for (const [index, name] of pending.entries()) {
      const url = `${productionOrigin}/api/files/${encodeURIComponent(name)}`;
      const destination = path.join(uploadsDir, name);
      const temporary = `${destination}.part`;
      try {
        const response = await fetch(url);
        if (response.status === 404) {
          missing++;
          console.warn(`[${index + 1}/${pending.length}] not found on Production: ${name}`);
          continue;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(temporary, buffer, { flag: "w" });
        fs.renameSync(temporary, destination);
        downloaded++;
        console.log(`[${index + 1}/${pending.length}] downloaded: ${name}`);
      } catch (error) {
        failed++;
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        console.error(`[${index + 1}/${pending.length}] failed: ${name} (${error.message})`);
      }
    }

    console.log(`Done. downloaded=${downloaded} not_found=${missing} failed=${failed}`);
    if (failed > 0) process.exitCode = 1;
  }
} finally {
  await pool.close();
}
