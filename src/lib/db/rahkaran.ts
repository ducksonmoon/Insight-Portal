import sql from "mssql";

const rahkaranConfig: sql.config = {
  server: process.env.RAHKARAN_DB_SERVER ?? "",
  database: process.env.RAHKARAN_DB_NAME ?? "",
  user: process.env.RAHKARAN_DB_USER ?? "",
  password: process.env.RAHKARAN_DB_PASSWORD ?? "",
  options: {
    encrypt: process.env.RAHKARAN_DB_ENCRYPT !== "false",
    trustServerCertificate:
      process.env.RAHKARAN_DB_TRUST_SERVER_CERTIFICATE !== "false",
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool: sql.ConnectionPool | null = null;

export function isRahkaranConfigured(): boolean {
  return Boolean(
    rahkaranConfig.server &&
      rahkaranConfig.database &&
      rahkaranConfig.user &&
      rahkaranConfig.password,
  );
}

export async function getRahkaranPool(): Promise<sql.ConnectionPool> {
  if (!isRahkaranConfigured()) {
    throw new Error("Rahkaran database is not configured. Check .env.local.");
  }

  if (!pool) {
    pool = await new sql.ConnectionPool(rahkaranConfig).connect();
  }

  return pool;
}

export async function queryRahkaran<T extends Record<string, unknown>>(
  queryText: string,
): Promise<T[]> {
  const connection = await getRahkaranPool();
  const result = await connection.request().query<T>(queryText);
  return result.recordset;
}
