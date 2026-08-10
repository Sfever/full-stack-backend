import { Router } from "express";

import { requireAuthentication } from "./auth-middleware.js";
import pool from "./database.js";
import { hashPassword } from "./password.js";

const usernameMaxLength = 100;
const emailMaxLength = 254;
const passwordMinLength = 8;
const passwordMaxLength = 128;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class RequestValidationError extends Error {}

function requireObjectBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestValidationError("Request body must be a JSON object");
  }

  return body;
}

function rejectUnsupportedFields(body, allowedFields) {
  const unsupportedFields = Object.keys(body).filter(
    (field) => !allowedFields.has(field),
  );

  if (unsupportedFields.length > 0) {
    throw new RequestValidationError(
      `Unsupported field(s): ${unsupportedFields.join(", ")}`,
    );
  }
}

function validateUsername(value) {
  const username = typeof value === "string" ? value.trim() : "";

  if (!username) {
    throw new RequestValidationError("username is required");
  }

  if (username.length > usernameMaxLength) {
    throw new RequestValidationError(
      `username must be ${usernameMaxLength} characters or fewer`,
    );
  }

  return username;
}

function validateEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (!email) {
    throw new RequestValidationError("email is required");
  }

  if (email.length > emailMaxLength || !emailPattern.test(email)) {
    throw new RequestValidationError("email must be a valid email address");
  }

  return email;
}

function validatePassword(value) {
  if (typeof value !== "string") {
    throw new RequestValidationError("password is required");
  }

  if (value.length < passwordMinLength || value.length > passwordMaxLength) {
    throw new RequestValidationError(
      `password must be between ${passwordMinLength} and ${passwordMaxLength} characters`,
    );
  }

  return value;
}

function validatePendingJournalist(value) {
  if (value === undefined) {
    return false;
  }

  if (typeof value !== "boolean") {
    throw new RequestValidationError("pendingJournalist must be a boolean");
  }

  return value;
}

function validateId(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RequestValidationError("id must be a positive integer");
  }

  return value;
}

function validateQueryId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new RequestValidationError("id query parameter must be a positive integer");
  }

  return validateId(Number(value));
}

function serializeUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    pendingJournalist: row.pending_journalist,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializePublicUser(row) {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function handleDatabaseError(error, response, next) {
  if (error.code === "23505") {
    const uniqueFields = {
      users_active_email_key: "email",
      users_active_username_key: "username",
    };
    const field = uniqueFields[error.constraint];

    if (field) {
      return response.status(409).json({ error: `${field} is already in use` });
    }
  }

  return next(error);
}

const router = Router();

router.get("/info", async (request, response, next) => {
  try {
    const id = validateQueryId(request.query.id);
    const result = await pool.query(
      `
        SELECT id, username, created_at, updated_at
        FROM users
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [id],
    );

    if (result.rowCount === 0) {
      return response.status(404).json({ error: "User not found" });
    }

    return response.json({ user: serializePublicUser(result.rows[0]) });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return response.status(400).json({ error: error.message });
    }

    return next(error);
  }
});

router.post("/create", async (request, response, next) => {
  try {
    const body = requireObjectBody(request.body);
    rejectUnsupportedFields(
      body,
      new Set(["username", "email", "password", "pendingJournalist"]),
    );

    const username = validateUsername(body.username);
    const email = validateEmail(body.email);
    const password = validatePassword(body.password);
    const pendingJournalist = validatePendingJournalist(body.pendingJournalist);
    const credential = await hashPassword(password);
    const result = await pool.query(
      `
        INSERT INTO users (username, email, credential, pending_journalist)
        VALUES ($1, $2, $3, $4)
        RETURNING id, username, email, pending_journalist, created_at, updated_at
      `,
      [username, email, credential, pendingJournalist],
    );

    return response.status(201).json({ user: serializeUser(result.rows[0]) });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return response.status(400).json({ error: error.message });
    }

    return handleDatabaseError(error, response, next);
  }
});

router.post("/update", requireAuthentication, async (request, response, next) => {
  try {
    const body = requireObjectBody(request.body);
    rejectUnsupportedFields(
      body,
      new Set(["id", "username", "email", "password", "pendingJournalist"]),
    );

    const id = validateId(body.id);

    // Self-service routes may only mutate the authenticated account. Administrative
    // user management belongs in a separate route with an explicit role check.
    if (id !== request.user.id) {
      return response.status(403).json({ error: "Cannot update another user" });
    }

    const assignments = [];
    const values = [id];

    if (body.username !== undefined) {
      values.push(validateUsername(body.username));
      assignments.push(`username = $${values.length}`);
    }

    if (body.email !== undefined) {
      values.push(validateEmail(body.email));
      assignments.push(`email = $${values.length}`);
    }

    if (body.password !== undefined) {
      values.push(await hashPassword(validatePassword(body.password)));
      assignments.push(`credential = $${values.length}`);
    }

    if (body.pendingJournalist !== undefined) {
      values.push(validatePendingJournalist(body.pendingJournalist));
      assignments.push(`pending_journalist = $${values.length}`);
    }

    if (assignments.length === 0) {
      throw new RequestValidationError("At least one field to update is required");
    }

    const result = await pool.query(
      `
        UPDATE users
        SET ${assignments.join(", ")}
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, username, email, pending_journalist, created_at, updated_at
      `,
      values,
    );

    if (result.rowCount === 0) {
      return response.status(404).json({ error: "User not found" });
    }

    return response.json({ user: serializeUser(result.rows[0]) });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return response.status(400).json({ error: error.message });
    }

    return handleDatabaseError(error, response, next);
  }
});

router.post("/delete", requireAuthentication, async (request, response, next) => {
  try {
    const body = requireObjectBody(request.body);
    rejectUnsupportedFields(body, new Set(["id"]));
    const id = validateId(body.id);

    if (id !== request.user.id) {
      return response.status(403).json({ error: "Cannot delete another user" });
    }

    const result = await pool.query(
      `
        UPDATE users
        SET deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, deleted_at
      `,
      [id],
    );

    if (result.rowCount === 0) {
      return response.status(404).json({ error: "User not found" });
    }

    return response.json({
      id: result.rows[0].id,
      deletedAt: result.rows[0].deleted_at,
    });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return response.status(400).json({ error: error.message });
    }

    return next(error);
  }
});

export default router;
