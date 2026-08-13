import "dotenv/config";

import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const isProduction = process.env.NODE_ENV === "production";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to connect to PostgreSQL");
}

if (isProduction) {
  const sslMode = new URL(databaseUrl).searchParams.get("sslmode");

  // Azure PostgreSQL requires TLS. Requiring verify-full here also prevents a
  // production secret from silently weakening certificate or hostname checks.
  if (sslMode !== "verify-full") {
    throw new Error(
      "Production DATABASE_URL must include sslmode=verify-full",
    );
  }
}

function readPositiveInteger(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue === undefined) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: readPositiveInteger("DB_POOL_MAX", isProduction ? 5 : 10),
  connectionTimeoutMillis: readPositiveInteger(
    "DB_CONNECTION_TIMEOUT_MS",
    5_000,
  ),
  idleTimeoutMillis: readPositiveInteger("DB_IDLE_TIMEOUT_MS", 30_000),
  statement_timeout: readPositiveInteger("DB_STATEMENT_TIMEOUT_MS", 10_000),
  application_name: "video-forge-backend",
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

export async function verifyDatabaseConnection() {
  await pool.query("SELECT 1");
}

export default pool;
