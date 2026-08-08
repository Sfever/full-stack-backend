import "dotenv/config";

import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to connect to PostgreSQL");
}

const pool = new Pool({ connectionString: databaseUrl });

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});

export async function verifyDatabaseConnection() {
  await pool.query("SELECT 1");
}

export default pool;
