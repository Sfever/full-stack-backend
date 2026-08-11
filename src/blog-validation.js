import { isIP } from "node:net";

const titleMaxLength = 200;
const slugMaxLength = 220;
const excerptMaxLength = 500;
const sourceFilenameMaxLength = 255;
const coverImageUrlMaxLength = 2_048;
const bodyMarkdownMaxBytes = 256 * 1_024;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const markdownFilenamePattern = /\.(?:md|markdown)$/i;

export class BlogValidationError extends Error {}

export function requireObjectBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BlogValidationError("Request body must be a JSON object");
  }

  return body;
}

export function rejectUnsupportedFields(body, allowedFields) {
  const unsupportedFields = Object.keys(body).filter(
    (field) => !allowedFields.has(field),
  );

  if (unsupportedFields.length > 0) {
    throw new BlogValidationError(
      `Unsupported field(s): ${unsupportedFields.join(", ")}`,
    );
  }
}

export function validateTitle(value) {
  const title = typeof value === "string" ? value.trim() : "";

  if (!title) {
    throw new BlogValidationError("title is required");
  }

  if (title.length > titleMaxLength) {
    throw new BlogValidationError(
      `title must be ${titleMaxLength} characters or fewer`,
    );
  }

  return title;
}

export function validateSlug(value) {
  const slug = typeof value === "string" ? value.trim() : "";

  if (!slug) {
    throw new BlogValidationError("slug is required");
  }

  if (slug.length > slugMaxLength || !slugPattern.test(slug)) {
    throw new BlogValidationError(
      "slug must contain only lowercase letters, numbers, and single hyphens",
    );
  }

  return slug;
}

export function validateExcerpt(value) {
  const excerpt = typeof value === "string" ? value.trim() : "";

  if (!excerpt) {
    throw new BlogValidationError("excerpt is required");
  }

  if (excerpt.length > excerptMaxLength) {
    throw new BlogValidationError(
      `excerpt must be ${excerptMaxLength} characters or fewer`,
    );
  }

  return excerpt;
}

export function validateBodyMarkdown(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BlogValidationError("bodyMarkdown is required");
  }

  if (Buffer.byteLength(value, "utf8") > bodyMarkdownMaxBytes) {
    throw new BlogValidationError("Markdown files must be 256 KiB or smaller");
  }

  return value;
}

export function validateSourceFilename(value) {
  const sourceFilename = typeof value === "string" ? value.trim() : "";

  if (!sourceFilename) {
    throw new BlogValidationError("sourceFilename is required");
  }

  if (
    sourceFilename.length > sourceFilenameMaxLength ||
    sourceFilename.includes("/") ||
    sourceFilename.includes("\\") ||
    !markdownFilenamePattern.test(sourceFilename)
  ) {
    throw new BlogValidationError(
      "sourceFilename must be the name of a .md or .markdown file",
    );
  }

  return sourceFilename;
}

export function validateCoverImageUrl(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || value.length > coverImageUrlMaxLength) {
    throw new BlogValidationError(
      "coverImageUrl must be a valid public HTTPS URL",
    );
  }

  let imageUrl;

  try {
    imageUrl = new URL(value);
  } catch {
    throw new BlogValidationError(
      "coverImageUrl must be a valid public HTTPS URL",
    );
  }

  const hostname = imageUrl.hostname.toLowerCase().replace(/\.$/, "");
  const isLocalHostname =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local");

  // The backend does not fetch arbitrary user URLs. These checks still keep
  // browsers from being directed to local hosts and enforce encrypted images.
  if (
    imageUrl.protocol !== "https:" ||
    imageUrl.username ||
    imageUrl.password ||
    (imageUrl.port && imageUrl.port !== "443") ||
    !hostname ||
    isLocalHostname ||
    isIP(hostname)
  ) {
    throw new BlogValidationError(
      "coverImageUrl must be a valid public HTTPS URL",
    );
  }

  return imageUrl.href;
}

export function validateStatus(value) {
  if (value !== "draft" && value !== "published") {
    throw new BlogValidationError("status must be draft or published");
  }

  return value;
}

export function validatePostId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new BlogValidationError("post ID must be a positive integer");
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id)) {
    throw new BlogValidationError("post ID must be a positive integer");
  }

  return id;
}
