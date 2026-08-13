const questionMaxLength = 2_000;
const answerMaxLength = 8_000;

export class PressKitValidationError extends Error {}

export function requireObjectBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new PressKitValidationError("Request body must be a JSON object");
  }

  return body;
}

export function rejectUnsupportedFields(body, allowedFields) {
  const unsupportedFields = Object.keys(body).filter(
    (field) => !allowedFields.has(field),
  );

  if (unsupportedFields.length > 0) {
    throw new PressKitValidationError(
      `Unsupported field(s): ${unsupportedFields.join(", ")}`,
    );
  }
}

function validateRequiredText(value, field, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw new PressKitValidationError(`${field} is required`);
  }

  if (text.length > maxLength) {
    throw new PressKitValidationError(
      `${field} must be ${maxLength} characters or fewer`,
    );
  }

  return text;
}

export function validateQuestion(value) {
  return validateRequiredText(value, "question", questionMaxLength);
}

export function validateAnswer(value) {
  return validateRequiredText(value, "answer", answerMaxLength);
}

export function validateModerationStatus(value) {
  if (value !== "pending" && value !== "rejected") {
    throw new PressKitValidationError(
      "status must be pending or rejected",
    );
  }

  return value;
}

export function validateQuestionId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new PressKitValidationError(
      "question ID must be a positive integer",
    );
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id)) {
    throw new PressKitValidationError(
      "question ID must be a positive integer",
    );
  }

  return id;
}
