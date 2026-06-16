import sql from "mssql";

const config: sql.config = {
  server: process.env.DB_SERVER || "172.41.1.73",
  port: parseInt(process.env.DB_PORT || "1433"),
  user: process.env.DB_USER || "",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "solardb",
  options: {
    trustServerCertificate: true,
    encrypt: false,
    useUTC: false,
  },
};

let pool: sql.ConnectionPool | null = null;

export async function getDb(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = await sql.connect(config);
  }
  return pool;
}

export { sql };

// Coerce a date-ish value into a Date for an mssql `sql.Date` param.
// Accepts a bare "YYYY-MM-DD" or any ISO string — fixDates() emits
// "YYYY-MM-DDTHH:MM:SS", which a round-tripping form posts straight back, so we
// keep only the date part and pin to local noon so the calendar day doesn't
// shift across timezones. Returns null for empty/unparseable input so callers
// never hand an Invalid Date to mssql (which throws EPARAM → 500).
export function toSqlDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T12:00:00");
  return isNaN(d.getTime()) ? null : d;
}

export function fixDates<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map(row => {
    const fixed = { ...row };
    for (const key of Object.keys(fixed)) {
      const val = fixed[key];
      if (val instanceof Date) {
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, "0");
        const d = String(val.getDate()).padStart(2, "0");
        const h = String(val.getHours()).padStart(2, "0");
        const min = String(val.getMinutes()).padStart(2, "0");
        const s = String(val.getSeconds()).padStart(2, "0");
        (fixed as Record<string, unknown>)[key] = `${y}-${m}-${d}T${h}:${min}:${s}`;
      }
    }
    return fixed;
  });
}
