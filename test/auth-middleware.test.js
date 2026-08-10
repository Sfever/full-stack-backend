import assert from "node:assert/strict";
import test from "node:test";

import { requireAuthentication } from "../src/auth-middleware.js";

test("authenticated requests continue to protected handlers", () => {
  let nextCalled = false;
  const request = { isAuthenticated: () => true };

  requireAuthentication(request, {}, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("anonymous requests receive a JSON 401 response", () => {
  let statusCode;
  let responseBody;
  const request = { isAuthenticated: () => false };
  const response = {
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      responseBody = value;
      return this;
    },
  };

  requireAuthentication(request, response, () => {
    assert.fail("anonymous request should not continue");
  });

  assert.equal(statusCode, 401);
  assert.deepEqual(responseBody, { error: "Authentication required" });
});
