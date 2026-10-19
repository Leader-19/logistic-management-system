import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, apiRequest } from "../../frontend/app/lib/api-client.ts";

const originalFetch = globalThis.fetch;

test("retries temporary failures for GET and returns the successful response", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1 ? new Response("temporary", { status: 503 }) : Response.json({ ok: true });
  };
  try {
    assert.deepEqual(await apiRequest("health"), { ok: true });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("retries idempotent mutations with the same key after a temporary server error", async () => {
  let calls = 0;
  const keys = [];
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    keys.push(new Headers(init.headers).get("Idempotency-Key"));
    return calls === 1 ? new Response("temporary", { status: 503 }) : Response.json({ id: "created" });
  };
  try {
    assert.deepEqual(await apiRequest("shipments", { method: "POST", body: "{}" }), { id: "created" });
    assert.equal(calls, 2);
    assert.match(keys[0], /^[A-Za-z0-9._:-]{16,128}$/);
    assert.equal(keys[1], keys[0]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not retry a client validation error", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ message: "Invalid input" }, { status: 400 });
  };
  try {
    await assert.rejects(apiRequest("shipments"), (error) => error instanceof ApiError && error.status === 400);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
