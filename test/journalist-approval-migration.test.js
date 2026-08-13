import assert from "node:assert/strict";
import test from "node:test";

import {
  down as rollBackJournalistApprovalMigration,
  up as applyJournalistApprovalMigration,
} from "../migrations/003_remove_journalist_approval.mjs";

function captureSql(migration) {
  const statements = [];

  migration({
    sql(statement) {
      statements.push(statement);
    },
  });

  return statements.join("\n");
}

test("pending journalist applications are promoted before removal", () => {
  const migrationSql = captureSql(applyJournalistApprovalMigration);
  const promotionPosition = migrationSql.indexOf("journalist = TRUE");
  const dropPosition = migrationSql.indexOf("DROP COLUMN pending_journalist");

  assert.notEqual(promotionPosition, -1);
  assert.notEqual(dropPosition, -1);
  assert.ok(promotionPosition < dropPosition);
});

test("journalist approval rollback restores only the pending state", () => {
  const rollbackSql = captureSql(rollBackJournalistApprovalMigration);

  assert.match(rollbackSql, /ADD COLUMN pending_journalist/);
  assert.match(rollbackSql, /ADD CONSTRAINT users_pending_role/);
  assert.doesNotMatch(rollbackSql, /journalist = FALSE/);
});
