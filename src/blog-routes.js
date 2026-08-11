import { Router } from "express";

import { requireAdmin } from "./auth-middleware.js";
import {
  BlogValidationError,
  rejectUnsupportedFields,
  requireObjectBody,
  validateBodyMarkdown,
  validateCoverImageUrl,
  validateExcerpt,
  validatePostId,
  validateSlug,
  validateSourceFilename,
  validateStatus,
  validateTitle,
} from "./blog-validation.js";
import pool from "./database.js";

const blogPostFields = `
  posts.id,
  posts.title,
  posts.slug,
  posts.excerpt,
  posts.cover_image_url,
  posts.status,
  posts.published_at,
  posts.created_at,
  posts.updated_at,
  posts.author_id,
  users.username AS author_username
`;

function serializeBlogPost(row, { includeBody = false, includeStatus = false } = {}) {
  const post = {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    coverImageUrl: row.cover_image_url,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: {
      id: row.author_id,
      username: row.author_username,
    },
  };

  if (includeBody) {
    post.bodyMarkdown = row.body_markdown;
  }

  if (includeStatus) {
    post.status = row.status;
    post.sourceFilename = row.source_filename;
  }

  return post;
}

function handleBlogError(error, response, next) {
  if (error instanceof BlogValidationError) {
    return response.status(400).json({ error: error.message });
  }

  if (error.code === "23505" && error.constraint === "blog_posts_active_slug_key") {
    return response.status(409).json({ error: "slug is already in use" });
  }

  return next(error);
}

const router = Router();

router.get("/", async (_request, response, next) => {
  try {
    const result = await pool.query(`
      SELECT ${blogPostFields}
      FROM blog_posts AS posts
      JOIN users ON users.id = posts.author_id
      WHERE posts.status = 'published'
        AND posts.deleted_at IS NULL
      ORDER BY posts.published_at DESC, posts.created_at DESC
      LIMIT 100
    `);

    return response.json({
      posts: result.rows.map((row) => serializeBlogPost(row)),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/manage", requireAdmin, async (_request, response, next) => {
  try {
    const result = await pool.query(`
      SELECT
        ${blogPostFields},
        posts.source_filename
      FROM blog_posts AS posts
      JOIN users ON users.id = posts.author_id
      WHERE posts.deleted_at IS NULL
      ORDER BY posts.created_at DESC
    `);

    return response.json({
      posts: result.rows.map((row) =>
        serializeBlogPost(row, { includeStatus: true }),
      ),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/manage", requireAdmin, async (request, response, next) => {
  try {
    const body = requireObjectBody(request.body);
    rejectUnsupportedFields(
      body,
      new Set([
        "title",
        "slug",
        "excerpt",
        "bodyMarkdown",
        "sourceFilename",
        "coverImageUrl",
        "status",
      ]),
    );

    const title = validateTitle(body.title);
    const slug = validateSlug(body.slug);
    const excerpt = validateExcerpt(body.excerpt);
    const bodyMarkdown = validateBodyMarkdown(body.bodyMarkdown);
    const sourceFilename = validateSourceFilename(body.sourceFilename);
    const coverImageUrl = validateCoverImageUrl(body.coverImageUrl);
    const status = validateStatus(body.status);
    const result = await pool.query(
      `
        INSERT INTO blog_posts (
          author_id,
          title,
          slug,
          excerpt,
          body_markdown,
          source_filename,
          cover_image_url,
          status,
          published_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
          CASE WHEN $8::VARCHAR(16) = 'published' THEN NOW() ELSE NULL END
        )
        RETURNING *
      `,
      [
        request.user.id,
        title,
        slug,
        excerpt,
        bodyMarkdown,
        sourceFilename,
        coverImageUrl,
        status,
      ],
    );
    const row = {
      ...result.rows[0],
      author_username: request.user.username,
    };

    return response.status(201).json({
      post: serializeBlogPost(row, { includeStatus: true }),
    });
  } catch (error) {
    return handleBlogError(error, response, next);
  }
});

router.patch(
  "/manage/:id/status",
  requireAdmin,
  async (request, response, next) => {
    try {
      const id = validatePostId(request.params.id);
      const body = requireObjectBody(request.body);
      rejectUnsupportedFields(body, new Set(["status"]));
      const status = validateStatus(body.status);
      const result = await pool.query(
        `
          UPDATE blog_posts AS posts
          SET
            status = $1::VARCHAR(16),
            published_at = CASE
              WHEN $1::VARCHAR(16) = 'published'
                AND posts.published_at IS NULL THEN NOW()
              ELSE posts.published_at
            END,
            updated_at = NOW()
          FROM users
          WHERE posts.id = $2
            AND posts.deleted_at IS NULL
            AND users.id = posts.author_id
          RETURNING
            ${blogPostFields},
            posts.source_filename
        `,
        [status, id],
      );

      if (result.rowCount === 0) {
        return response.status(404).json({ error: "Blog post not found" });
      }

      return response.json({
        post: serializeBlogPost(result.rows[0], { includeStatus: true }),
      });
    } catch (error) {
      return handleBlogError(error, response, next);
    }
  },
);

router.delete("/manage/:id", requireAdmin, async (request, response, next) => {
  try {
    const id = validatePostId(request.params.id);
    const result = await pool.query(
      `
        UPDATE blog_posts
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id
      `,
      [id],
    );

    if (result.rowCount === 0) {
      return response.status(404).json({ error: "Blog post not found" });
    }

    return response.status(204).end();
  } catch (error) {
    return handleBlogError(error, response, next);
  }
});

router.get("/:slug", async (request, response, next) => {
  try {
    const slug = validateSlug(request.params.slug);
    const result = await pool.query(
      `
        SELECT
          ${blogPostFields},
          posts.body_markdown
        FROM blog_posts AS posts
        JOIN users ON users.id = posts.author_id
        WHERE LOWER(posts.slug) = LOWER($1)
          AND posts.status = 'published'
          AND posts.deleted_at IS NULL
      `,
      [slug],
    );

    if (result.rowCount === 0) {
      return response.status(404).json({ error: "Blog post not found" });
    }

    return response.json({
      post: serializeBlogPost(result.rows[0], { includeBody: true }),
    });
  } catch (error) {
    return handleBlogError(error, response, next);
  }
});

export default router;
