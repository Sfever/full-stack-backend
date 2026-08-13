export function up(pgm) {
  pgm.sql(`
    -- connect-pg-simple created this table at runtime before migrations owned
    -- it, so the baseline must also accept an existing installation.
    CREATE TABLE IF NOT EXISTS user_sessions (
      sid VARCHAR NOT NULL COLLATE "default",
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL,
      CONSTRAINT user_sessions_pkey PRIMARY KEY (sid)
    );

    CREATE INDEX IF NOT EXISTS user_sessions_expire_idx
      ON user_sessions (expire);
  `);
}

export function down(_pgm) {
  // Existing deployments can predate this baseline. Preserve their active
  // sessions on rollback rather than dropping a table this migration may not
  // have created.
}
