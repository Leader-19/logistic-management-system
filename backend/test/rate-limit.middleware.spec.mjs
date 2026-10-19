import assert from "node:assert/strict";
import { test } from "node:test";
import { createRateLimitMiddleware } from "../src/common/rate-limit.middleware.ts";

const originalEnvironment = {
  window: process.env.RATE_LIMIT_WINDOW_MS,
  general: process.env.RATE_LIMIT_MAX_REQUESTS,
  auth: process.env.RATE_LIMIT_AUTH_MAX_REQUESTS,
  maxKeys: process.env.RATE_LIMIT_MAX_KEYS,
};

function setTestLimits() {
  process.env.RATE_LIMIT_WINDOW_MS = "60000";
  process.env.RATE_LIMIT_MAX_REQUESTS = "2";
  process.env.RATE_LIMIT_AUTH_MAX_REQUESTS = "1";
  process.env.RATE_LIMIT_MAX_KEYS = "100";
}

function restoreEnvironment() {
  const entries = [
    ["RATE_LIMIT_WINDOW_MS", originalEnvironment.window],
    ["RATE_LIMIT_MAX_REQUESTS", originalEnvironment.general],
    ["RATE_LIMIT_AUTH_MAX_REQUESTS", originalEnvironment.auth],
    ["RATE_LIMIT_MAX_KEYS", originalEnvironment.maxKeys],
  ];
  for (const [key, value] of entries) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function send(middleware, path = "/api/v1/customers") {
  const headers = {};
  let statusCode = 200;
  let body;
  let continued = false;
  const request = { path, ip: "192.0.2.10", socket: { remoteAddress: "192.0.2.10" } };
  const response = {
    setHeader(name, value) { headers[name] = value; },
    status(value) { statusCode = value; return this; },
    json(value) { body = value; return this; },
  };
  middleware(request, response, () => { continued = true; });
  return { headers, statusCode, body, continued };
}

test("allows requests within the general limit and rejects the next request", () => {
  setTestLimits();
  try {
    const middleware = createRateLimitMiddleware();
    assert.equal(send(middleware).continued, true);
    assert.equal(send(middleware).continued, true);
    const rejected = send(middleware);
    assert.equal(rejected.statusCode, 429);
    assert.equal(rejected.continued, false);
    assert.equal(rejected.body.error.code, "RATE_LIMIT_EXCEEDED");
    assert.ok(Number(rejected.headers["Retry-After"]) > 0);
  } finally {
    restoreEnvironment();
  }
});

test("applies the stricter authentication limit to login and registration", () => {
  setTestLimits();
  try {
    const middleware = createRateLimitMiddleware();
    assert.equal(send(middleware, "/api/v1/auth/login").continued, true);
    assert.equal(send(middleware, "/api/v1/auth/login").statusCode, 429);
    assert.equal(send(middleware, "/api/v1/auth/register").continued, true);
  } finally {
    restoreEnvironment();
  }
});
