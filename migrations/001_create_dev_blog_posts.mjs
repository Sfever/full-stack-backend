export function up(pgm) {
  pgm.sql(`
    -- The users table predates the repository's migration runner. Baseline its
    -- existing contract here so a fresh database can satisfy blog_posts.author_id.
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      username VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL,
      credential TEXT NOT NULL,
      journalist BOOLEAN NOT NULL DEFAULT FALSE,
      admin BOOLEAN NOT NULL DEFAULT FALSE,
      pending_journalist BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      CONSTRAINT users_single_role CHECK (NOT (admin AND journalist)),
      CONSTRAINT users_pending_role CHECK (
        NOT pending_journalist OR (NOT admin AND NOT journalist)
      )
    );

    CREATE UNIQUE INDEX IF NOT EXISTS users_active_username_key
      ON users (LOWER(username))
      WHERE deleted_at IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS users_active_email_key
      ON users (LOWER(email))
      WHERE deleted_at IS NULL;

    CREATE OR REPLACE FUNCTION set_users_updated_at()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $function$;

    DROP TRIGGER IF EXISTS users_set_updated_at ON users;
    CREATE TRIGGER users_set_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION set_users_updated_at();

    CREATE TABLE blog_posts (
      id SERIAL PRIMARY KEY,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      title VARCHAR(200) NOT NULL,
      slug VARCHAR(220) NOT NULL,
      excerpt VARCHAR(500) NOT NULL,
      body_markdown TEXT NOT NULL,
      source_filename VARCHAR(255) NOT NULL,
      cover_image_url VARCHAR(2048),
      status VARCHAR(16) NOT NULL DEFAULT 'draft',
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      CONSTRAINT blog_posts_title_present CHECK (BTRIM(title) <> ''),
      CONSTRAINT blog_posts_slug_format CHECK (
        slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      ),
      CONSTRAINT blog_posts_excerpt_present CHECK (BTRIM(excerpt) <> ''),
      CONSTRAINT blog_posts_body_present CHECK (BTRIM(body_markdown) <> ''),
      CONSTRAINT blog_posts_body_size CHECK (
        OCTET_LENGTH(body_markdown) <= 262144
      ),
      CONSTRAINT blog_posts_status_allowed CHECK (
        status IN ('draft', 'published')
      )
    );

    CREATE UNIQUE INDEX blog_posts_active_slug_key
      ON blog_posts (LOWER(slug))
      WHERE deleted_at IS NULL;

    CREATE INDEX blog_posts_publication_order_idx
      ON blog_posts (published_at DESC, created_at DESC)
      WHERE status = 'published' AND deleted_at IS NULL;
  `);
}

export function down(pgm) {
  // Users may predate this baseline and can own data outside the blog feature.
  // Rolling back the blog migration must never remove that shared table.
  pgm.sql("DROP TABLE blog_posts;");
}
