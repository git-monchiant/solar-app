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
