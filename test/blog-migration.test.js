import assert from "node:assert/strict";
import test from "node:test";

import {
  down as rollBackBlogMigration,
  up as applyBlogMigration,
} from "../migrations/001_create_dev_blog_posts.mjs";

function captureSql(migration) {
  const statements = [];

  migration({
    sql(statement) {
      statements.push(statement);
    },
  });

  return statements.join("\n");
}

test("users are baselined before the blog author foreign key", () => {
  const migrationSql = captureSql(applyBlogMigration);
  const usersTablePosition = migrationSql.indexOf(
    "CREATE TABLE IF NOT EXISTS users",
  );
  const blogTablePosition = migrationSql.indexOf("CREATE TABLE blog_posts");

  assert.notEqual(usersTablePosition, -1);
  assert.notEqual(blogTablePosition, -1);
  assert.ok(usersTablePosition < blogTablePosition);
  assert.match(
    migrationSql,
    /author_id INTEGER NOT NULL REFERENCES users\(id\)/,
  );
});

test("rolling back the blog migration preserves the shared users table", () => {
  const rollbackSql = captureSql(rollBackBlogMigration);

  assert.match(rollbackSql, /DROP TABLE blog_posts/);
  assert.doesNotMatch(rollbackSql, /DROP TABLE users/);
});
