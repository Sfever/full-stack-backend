export function up(pgm) {
  pgm.sql(`
    ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_pending_role;

    -- Preserve every existing application by promoting it before the obsolete
    -- pending state is removed.
    UPDATE users
    SET
      journalist = TRUE,
      pending_journalist = FALSE,
      updated_at = NOW()
    WHERE pending_journalist = TRUE;

    ALTER TABLE users
      DROP COLUMN pending_journalist;
  `);
}

export function down(pgm) {
  // A rollback can restore the approval-state column, but cannot infer which
  // journalists were previously pending, so promoted roles remain intact.
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN pending_journalist BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE users
      ADD CONSTRAINT users_pending_role CHECK (
        NOT pending_journalist OR (NOT admin AND NOT journalist)
      );
  `);
}
