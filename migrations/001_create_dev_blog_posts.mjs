export function up(pgm) {
  pgm.sql(`
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
  pgm.sql("DROP TABLE blog_posts;");
}
