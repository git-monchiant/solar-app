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
