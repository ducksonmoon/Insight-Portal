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
    // Keep one connection warm. Observed in practice (rule-engine runs
    // against a real on-prem box over a flaky LAN/VPN path): once the pool
    // drops to zero live connections, the next handshake to Rahkaran fails
    // far more often than it succeeds, and every rule after that point in a
    // sequential run times out at connectionTimeout even though the server
    // itself is fine. A pinned warm connection avoids re-negotiating
    // TCP+TLS+auth from scratch for every rule.
    min: 1,
    idleTimeoutMillis: 30000,
  },
};

let pool: sql.ConnectionPool | null = null;
/** Shared in-flight connect attempt so concurrent callers don't each race their own handshake. */
let connecting: Promise<sql.ConnectionPool> | null = null;

export function isRahkaranConfigured(): boolean {
  return Boolean(
    rahkaranConfig.server &&
      rahkaranConfig.database &&
      rahkaranConfig.user &&
      rahkaranConfig.password,
  );
}

/**
 * A single connect() timeout is not enough signal that Rahkaran is actually
 * down — on this kind of on-prem/VPN network path a handshake can simply
 * drop. Retry a few times with a short backoff before giving up; a rule
 * that's really unreachable still fails, just not on the network's first
 * bad day.
 */
async function connectWithRetry(attempts = 3): Promise<sql.ConnectionPool> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await new sql.ConnectionPool(rahkaranConfig).connect();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }
  throw lastError;
}

export async function getRahkaranPool(): Promise<sql.ConnectionPool> {
  if (!isRahkaranConfigured()) {
    throw new Error("Rahkaran database is not configured. Check .env.local.");
  }

  if (pool?.connected) return pool;

  if (!connecting) {
    connecting = connectWithRetry().finally(() => {
      connecting = null;
    });
  }

  pool = await connecting;
  return pool;
}

export async function queryRahkaran<T extends Record<string, unknown>>(
  queryText: string,
): Promise<T[]> {
  const connection = await getRahkaranPool();
  const result = await connection.request().query<T>(queryText);
  return result.recordset;
}
