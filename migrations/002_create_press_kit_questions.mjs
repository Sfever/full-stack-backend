export function up(pgm) {
  pgm.sql(`
    CREATE TABLE press_kit_questions (
      id SERIAL PRIMARY KEY,
      journalist_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      question TEXT NOT NULL,
      answer TEXT,
      answered_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      answered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      CONSTRAINT press_kit_questions_question_present CHECK (
        BTRIM(question) <> ''
      ),
      CONSTRAINT press_kit_questions_question_size CHECK (
        CHAR_LENGTH(question) <= 2000
      ),
      CONSTRAINT press_kit_questions_answer_present CHECK (
        answer IS NULL OR BTRIM(answer) <> ''
      ),
      CONSTRAINT press_kit_questions_answer_size CHECK (
        answer IS NULL OR CHAR_LENGTH(answer) <= 8000
      ),
      CONSTRAINT press_kit_questions_status_allowed CHECK (
        status IN ('pending', 'answered', 'rejected')
      ),
      -- An answered row is immediately public. Keeping the lifecycle fields in
      -- one constraint prevents a partial answer from leaking through a query.
      CONSTRAINT press_kit_questions_answer_state CHECK (
        (
          status = 'answered'
          AND answer IS NOT NULL
          AND answered_by IS NOT NULL
          AND answered_at IS NOT NULL
        )
        OR
        (
          status IN ('pending', 'rejected')
          AND answer IS NULL
          AND answered_by IS NULL
          AND answered_at IS NULL
        )
      )
    );

    CREATE INDEX press_kit_questions_public_order_idx
      ON press_kit_questions (answered_at DESC, created_at DESC)
      WHERE status = 'answered' AND deleted_at IS NULL;

    CREATE INDEX press_kit_questions_journalist_order_idx
      ON press_kit_questions (journalist_id, created_at DESC)
      WHERE deleted_at IS NULL;

    CREATE INDEX press_kit_questions_management_order_idx
      ON press_kit_questions (status, created_at DESC)
      WHERE deleted_at IS NULL;
  `);
}

export function down(pgm) {
  // Press Kit rollback must not remove shared users or development blog data.
  pgm.sql("DROP TABLE press_kit_questions;");
}
