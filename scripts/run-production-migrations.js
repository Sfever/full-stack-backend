import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import pg from "pg";

const { Pool } = pg;

function parseDatabaseUrl(name, rawUrl) {
  if (!rawUrl) {
    throw new Error(`${name} is required`);
  }

  const url = new URL(rawUrl);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${name} must be a PostgreSQL URL`);
  }

  if (url.searchParams.get("sslmode") !== "verify-full") {
    throw new Error(`${name} must include sslmode=verify-full`);
  }

  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));

  if (!username || !password || !database) {
    throw new Error(`${name} must include a username, password, and database`);
  }

  return {
    database,
    hostname: url.hostname.toLowerCase(),
    password,
    port: url.port || "5432",
    username,
  };
}

export function validateDatabaseUrls(migrationUrl, runtimeUrl) {
  const migration = parseDatabaseUrl("MIGRATION_DATABASE_URL", migrationUrl);
  const runtime = parseDatabaseUrl("RUNTIME_DATABASE_URL", runtimeUrl);

  if (
    migration.hostname !== runtime.hostname ||
    migration.port !== runtime.port ||
    migration.database !== runtime.database
  ) {
    throw new Error(
      "Migration and runtime URLs must target the same PostgreSQL database",
    );
  }

  if (migration.username === runtime.username) {
    throw new Error("Migration and runtime URLs must use separate roles");
  }

  return { migration, runtime };
}

async function formatSql(client, template, values) {
  const result = await client.query(
    "SELECT format($1::text, VARIADIC $2::text[]) AS statement",
    [template, values],
  );

  return result.rows[0].statement;
}

async function configureRuntimeRole(pool, runtime) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const existingRole = await client.query(
      "SELECT 1 FROM pg_roles WHERE rolname = $1",
      [runtime.username],
    );
    const roleCommand = existingRole.rowCount
      ? "ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS"
      : "CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS";

    await client.query(
      await formatSql(client, roleCommand, [runtime.username, runtime.password]),
    );
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function runSchemaMigrations() {
  await new Promise((resolve, reject) => {
    const migration = spawn(
      process.execPath,
      [
        "node_modules/node-pg-migrate/bin/node-pg-migrate.js",
        "up",
        "--database-url-var",
        "MIGRATION_DATABASE_URL",
        "--reject-unauthorized",
      ],
      { env: process.env, stdio: "inherit" },
    );

    migration.once("error", reject);
    migration.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Schema migration failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`,
        ),
      );
    });
  });
}

async function grantRuntimePermissions(pool, runtime) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    // Default privileges belong to the connected migration role. Resolve its
    // exact PostgreSQL identifier on the server rather than trusting URL text.
    const currentRoleResult = await client.query("SELECT current_user AS role");
    const migrationRole = currentRoleResult.rows[0].role;
    const statements = [
      ["GRANT CONNECT ON DATABASE %I TO %I", [runtime.database, runtime.username]],
      ["GRANT USAGE ON SCHEMA public TO %I", [runtime.username]],
      [
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I",
        [runtime.username],
      ],
      [
        "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I",
        [runtime.username],
      ],
      [
        "ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I",
        [migrationRole, runtime.username],
      ],
      [
        "ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I",
        [migrationRole, runtime.username],
      ],
    ];

    for (const [template, values] of statements) {
      await client.query(await formatSql(client, template, values));
    }

    const migrationTable = await client.query(
      "SELECT to_regclass('public.pgmigrations') AS table_name",
    );
    if (migrationTable.rows[0].table_name) {
      await client.query(
        await formatSql(client, "REVOKE ALL ON TABLE public.pgmigrations FROM %I", [
          runtime.username,
        ]),
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const { runtime } = validateDatabaseUrls(
    process.env.MIGRATION_DATABASE_URL,
    process.env.RUNTIME_DATABASE_URL,
  );
  const pool = new Pool({
    connectionString: process.env.MIGRATION_DATABASE_URL,
    application_name: "video-forge-migrations",
    connectionTimeoutMillis: 10_000,
    max: 1,
  });

  try {
    await pool.query("SELECT 1");
    await configureRuntimeRole(pool, runtime);
    await runSchemaMigrations();
    await grantRuntimePermissions(pool, runtime);
    console.log("Production schema and runtime database permissions are ready");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Production migration failed:", error);
    process.exitCode = 1;
  });
}
