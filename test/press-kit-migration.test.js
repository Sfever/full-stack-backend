import assert from "node:assert/strict";
import test from "node:test";

import {
  down as rollBackPressKitMigration,
  up as applyPressKitMigration,
} from "../migrations/002_create_press_kit_questions.mjs";

function captureSql(migration) {
  const statements = [];

  migration({
    sql(statement) {
      statements.push(statement);
    },
  });

  return statements.join("\n");
}

test("press kit questions reference journalist and answering users", () => {
  const migrationSql = captureSql(applyPressKitMigration);

  assert.match(migrationSql, /CREATE TABLE press_kit_questions/);
  assert.match(
    migrationSql,
    /journalist_id INTEGER NOT NULL REFERENCES users\(id\)/,
  );
  assert.match(
    migrationSql,
    /answered_by INTEGER REFERENCES users\(id\)/,
  );
});

test("answered press kit rows require a complete public answer state", () => {
  const migrationSql = captureSql(applyPressKitMigration);

  assert.match(
    migrationSql,
    /status IN \('pending', 'answered', 'rejected'\)/,
  );
  assert.match(migrationSql, /status = 'answered'[\s\S]+answer IS NOT NULL/);
  assert.match(migrationSql, /answered_by IS NOT NULL/);
  assert.match(migrationSql, /answered_at IS NOT NULL/);
});

test("rolling back press kit preserves shared tables", () => {
  const rollbackSql = captureSql(rollBackPressKitMigration);

  assert.match(rollbackSql, /DROP TABLE press_kit_questions/);
  assert.doesNotMatch(rollbackSql, /DROP TABLE (?:users|blog_posts)/);
});
