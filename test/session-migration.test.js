import assert from "node:assert/strict";
import test from "node:test";

import {
  down as rollBackSessionMigration,
  up as applySessionMigration,
} from "../migrations/004_baseline_user_sessions.mjs";

function captureSql(migration) {
  const statements = [];

  migration({
    sql(statement) {
      statements.push(statement);
    },
  });

  return statements.join("\n");
}

test("session storage is baselined without replacing an existing table", () => {
  const migrationSql = captureSql(applySessionMigration);

  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS user_sessions/);
  assert.match(migrationSql, /PRIMARY KEY \(sid\)/);
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS/);
});

test("rolling back the session baseline preserves existing sessions", () => {
  const rollbackSql = captureSql(rollBackSessionMigration);

  assert.equal(rollbackSql, "");
});
