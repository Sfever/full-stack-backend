import assert from "node:assert/strict";
import test from "node:test";

import {
  PressKitValidationError,
  rejectUnsupportedFields,
  requireObjectBody,
  validateAnswer,
  validateModerationStatus,
  validateQuestion,
  validateQuestionId,
} from "../src/press-kit-validation.js";

test("press kit validation trims valid questions and answers", () => {
  assert.equal(
    validateQuestion("  When will the game launch?  "),
    "When will the game launch?",
  );
  assert.equal(
    validateAnswer("  We will announce that soon.  "),
    "We will announce that soon.",
  );
  assert.equal(validateQuestionId("42"), 42);
});

test("press kit text limits match the database constraints", () => {
  assert.throws(() => validateQuestion(" "), PressKitValidationError);
  assert.throws(
    () => validateQuestion("q".repeat(2_001)),
    PressKitValidationError,
  );
  assert.throws(
    () => validateAnswer("a".repeat(8_001)),
    PressKitValidationError,
  );
});

test("moderation accepts only private non-answer states", () => {
  assert.equal(validateModerationStatus("pending"), "pending");
  assert.equal(validateModerationStatus("rejected"), "rejected");
  assert.throws(
    () => validateModerationStatus("answered"),
    PressKitValidationError,
  );
});

test("press kit payloads reject malformed bodies and extra fields", () => {
  assert.throws(() => requireObjectBody([]), PressKitValidationError);
  assert.throws(
    () =>
      rejectUnsupportedFields(
        { question: "Question", status: "answered" },
        new Set(["question"]),
      ),
    PressKitValidationError,
  );
});
