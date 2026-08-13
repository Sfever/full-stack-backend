import { Router } from "express";

import { requireAdmin, requireJournalist } from "./auth-middleware.js";
import pool from "./database.js";
import {
  PressKitValidationError,
  rejectUnsupportedFields,
  requireObjectBody,
  validateAnswer,
  validateModerationStatus,
  validateQuestion,
  validateQuestionId,
} from "./press-kit-validation.js";

const questionFields = `
  questions.id,
  questions.question,
  questions.answer,
  questions.status,
  questions.answered_at,
  questions.created_at,
  questions.updated_at,
  questions.journalist_id,
  journalists.username AS journalist_username,
  questions.answered_by,
  answerers.username AS answerer_username
`;

const mutationQuestionFields = `
  questions.id,
  questions.question,
  questions.answer,
  questions.status,
  questions.answered_at,
  questions.created_at,
  questions.updated_at,
  questions.journalist_id,
  journalists.username AS journalist_username,
  questions.answered_by
`;

function serializeQuestion(row, { includeStatus = false } = {}) {
  const question = {
    id: row.id,
    question: row.question,
    answer: row.answer,
    answeredAt: row.answered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    journalist: {
      id: row.journalist_id,
      username: row.journalist_username,
    },
    answeredBy: row.answered_by
      ? {
          id: row.answered_by,
          username: row.answerer_username,
        }
      : null,
  };

  if (includeStatus) {
    question.status = row.status;
  }

  return question;
}

function handlePressKitError(error, response, next) {
  if (error instanceof PressKitValidationError) {
    return response.status(400).json({ error: error.message });
  }

  return next(error);
}

const router = Router();

router.get("/", async (_request, response, next) => {
  try {
    const result = await pool.query(`
      SELECT ${questionFields}
      FROM press_kit_questions AS questions
      JOIN users AS journalists ON journalists.id = questions.journalist_id
      JOIN users AS answerers ON answerers.id = questions.answered_by
      WHERE questions.status = 'answered'
        AND questions.deleted_at IS NULL
      ORDER BY questions.answered_at DESC, questions.created_at DESC
      LIMIT 100
    `);

    return response.json({
      questions: result.rows.map((row) => serializeQuestion(row)),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/mine", requireJournalist, async (request, response, next) => {
  try {
    const result = await pool.query(
      `
        SELECT ${questionFields}
        FROM press_kit_questions AS questions
        JOIN users AS journalists ON journalists.id = questions.journalist_id
        LEFT JOIN users AS answerers ON answerers.id = questions.answered_by
        WHERE questions.journalist_id = $1
          AND questions.deleted_at IS NULL
        ORDER BY questions.created_at DESC
      `,
      [request.user.id],
    );

    return response.json({
      questions: result.rows.map((row) =>
        serializeQuestion(row, { includeStatus: true }),
      ),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/questions", requireJournalist, async (request, response, next) => {
  try {
    const body = requireObjectBody(request.body);
    rejectUnsupportedFields(body, new Set(["question"]));
    const question = validateQuestion(body.question);
    const result = await pool.query(
      `
        INSERT INTO press_kit_questions (journalist_id, question)
        VALUES ($1, $2)
        RETURNING *
      `,
      [request.user.id, question],
    );
    const row = {
      ...result.rows[0],
      journalist_username: request.user.username,
      answerer_username: null,
    };

    return response.status(201).json({
      question: serializeQuestion(row, { includeStatus: true }),
    });
  } catch (error) {
    return handlePressKitError(error, response, next);
  }
});

router.get("/manage", requireAdmin, async (_request, response, next) => {
  try {
    const result = await pool.query(`
      SELECT ${questionFields}
      FROM press_kit_questions AS questions
      JOIN users AS journalists ON journalists.id = questions.journalist_id
      LEFT JOIN users AS answerers ON answerers.id = questions.answered_by
      WHERE questions.deleted_at IS NULL
      ORDER BY
        CASE questions.status
          WHEN 'pending' THEN 0
          WHEN 'answered' THEN 1
          ELSE 2
        END,
        questions.created_at DESC
    `);

    return response.json({
      questions: result.rows.map((row) =>
        serializeQuestion(row, { includeStatus: true }),
      ),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch(
  "/manage/:id/answer",
  requireAdmin,
  async (request, response, next) => {
    try {
      const id = validateQuestionId(request.params.id);
      const body = requireObjectBody(request.body);
      rejectUnsupportedFields(body, new Set(["answer"]));
      const answer = validateAnswer(body.answer);
      const result = await pool.query(
        `
          UPDATE press_kit_questions AS questions
          SET
            answer = $1,
            answered_by = $2,
            status = 'answered',
            answered_at = COALESCE(questions.answered_at, NOW()),
            updated_at = NOW()
          FROM users AS journalists
          WHERE questions.id = $3
            AND questions.deleted_at IS NULL
            AND journalists.id = questions.journalist_id
          RETURNING ${mutationQuestionFields}
        `,
        [answer, request.user.id, id],
      );

      if (result.rowCount === 0) {
        return response.status(404).json({ error: "Press question not found" });
      }

      const row = {
        ...result.rows[0],
        answerer_username: request.user.username,
      };

      // Answering and publication are intentionally the same operation. There
      // is no private or draft answer state in the Press Kit specification.
      return response.json({
        question: serializeQuestion(row, { includeStatus: true }),
      });
    } catch (error) {
      return handlePressKitError(error, response, next);
    }
  },
);

router.patch(
  "/manage/:id/status",
  requireAdmin,
  async (request, response, next) => {
    try {
      const id = validateQuestionId(request.params.id);
      const body = requireObjectBody(request.body);
      rejectUnsupportedFields(body, new Set(["status"]));
      const status = validateModerationStatus(body.status);
      const result = await pool.query(
        `
          UPDATE press_kit_questions AS questions
          SET status = $1::VARCHAR(16), updated_at = NOW()
          FROM users AS journalists
          WHERE questions.id = $2
            AND questions.status <> 'answered'
            AND questions.deleted_at IS NULL
            AND journalists.id = questions.journalist_id
          RETURNING ${mutationQuestionFields}
        `,
        [status, id],
      );

      if (result.rowCount === 0) {
        const existing = await pool.query(
          `
            SELECT status
            FROM press_kit_questions
            WHERE id = $1 AND deleted_at IS NULL
          `,
          [id],
        );

        if (existing.rowCount === 0) {
          return response.status(404).json({ error: "Press question not found" });
        }

        // Once answered, a Q&A is public by contract and cannot be quietly
        // moved back into the private moderation queue.
        return response.status(409).json({
          error: "Answered press questions cannot be unpublished",
        });
      }

      const row = {
        ...result.rows[0],
        answerer_username: null,
      };

      return response.json({
        question: serializeQuestion(row, { includeStatus: true }),
      });
    } catch (error) {
      return handlePressKitError(error, response, next);
    }
  },
);

export default router;
