import assert from "node:assert/strict";
import test from "node:test";

import {
  BlogValidationError,
  validateBodyMarkdown,
  validateCoverImageUrl,
  validateSlug,
  validateSourceFilename,
  validateStatus,
} from "../src/blog-validation.js";

test("blog validation accepts Markdown upload fields", () => {
  assert.equal(validateSlug("release-notes-2"), "release-notes-2");
  assert.equal(validateBodyMarkdown("# Release notes\n"), "# Release notes\n");
  assert.equal(validateSourceFilename("release-notes.md"), "release-notes.md");
  assert.equal(validateStatus("published"), "published");
});

test("cover images must use a public HTTPS hostname", () => {
  assert.equal(
    validateCoverImageUrl("https://cdn.example.com/covers/update.png"),
    "https://cdn.example.com/covers/update.png",
  );
  assert.equal(validateCoverImageUrl(""), null);

  for (const url of [
    "http://cdn.example.com/cover.png",
    "https://localhost/cover.png",
    "https://127.0.0.1/cover.png",
    "https://user:password@example.com/cover.png",
  ]) {
    assert.throws(
      () => validateCoverImageUrl(url),
      BlogValidationError,
      url,
    );
  }
});

test("invalid slugs, file names, and statuses are rejected", () => {
  assert.throws(() => validateSlug("Not A Slug"), BlogValidationError);
  assert.throws(
    () => validateSourceFilename("../post.md"),
    BlogValidationError,
  );
  assert.throws(() => validateSourceFilename("post.html"), BlogValidationError);
  assert.throws(() => validateStatus("archived"), BlogValidationError);
});

test("Markdown uploads are capped at 256 KiB", () => {
  const oversizedMarkdown = "a".repeat(256 * 1_024 + 1);

  assert.throws(
    () => validateBodyMarkdown(oversizedMarkdown),
    BlogValidationError,
  );
});
