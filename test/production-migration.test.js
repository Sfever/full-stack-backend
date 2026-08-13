import assert from "node:assert/strict";
import test from "node:test";

import { validateDatabaseUrls } from "../scripts/run-production-migrations.js";

const migrationUrl =
  "postgresql://schema_owner:owner-password@video-forge.postgres.database.azure.com:5432/video_forge?sslmode=verify-full";
const runtimeUrl =
  "postgresql://video_forge_api:runtime-password@video-forge.postgres.database.azure.com:5432/video_forge?sslmode=verify-full";

test("production migration accepts separate roles for the same database", () => {
  const result = validateDatabaseUrls(migrationUrl, runtimeUrl);

  assert.equal(result.migration.username, "schema_owner");
  assert.equal(result.runtime.username, "video_forge_api");
});

test("production migration rejects a shared administrator and runtime role", () => {
  assert.throws(
    () => validateDatabaseUrls(migrationUrl, migrationUrl),
    /must use separate roles/,
  );
});

test("production migration rejects different target databases", () => {
  const wrongDatabase = runtimeUrl.replace("/video_forge?", "/other_database?");

  assert.throws(
    () => validateDatabaseUrls(migrationUrl, wrongDatabase),
    /must target the same PostgreSQL database/,
  );
});

test("production migration requires certificate and hostname verification", () => {
  assert.throws(
    () => validateDatabaseUrls(migrationUrl, runtimeUrl.replace("verify-full", "require")),
    /must include sslmode=verify-full/,
  );
});
