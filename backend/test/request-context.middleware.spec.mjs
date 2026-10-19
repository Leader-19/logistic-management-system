import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequestContextMiddleware } from "../src/common/request-context.middleware.ts";

test("sets a generated UUID request ID on the request and response", () => {
  const middleware = createRequestContextMiddleware();
  let continued = false;
  let responseId = "";
  const request = { get: () => undefined };
  const response = { setHeader: (name, value) => { if (name === "X-Request-Id") responseId = value; }, on() {} };
  middleware(request, response, () => { continued = true; });
  assert.match(request.requestId, /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
  assert.equal(responseId, request.requestId);
  assert.equal(continued, true);
});

test("accepts only UUID-form request IDs from clients", () => {
  const middleware = createRequestContextMiddleware();
  const suppliedId = "123e4567-e89b-42d3-a456-426614174000";
  const request = { get: () => suppliedId };
  const response = { setHeader() {}, on() {} };
  middleware(request, response, () => {});
  assert.equal(request.requestId, suppliedId);
});
