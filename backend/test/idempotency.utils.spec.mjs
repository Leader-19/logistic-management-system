import assert from "node:assert/strict";
import { test } from "node:test";
import { hashIdempotentRequest, isValidIdempotencyKey, requiresIdempotencyKey } from "../src/common/idempotency.utils.ts";

test("requires idempotency keys for shipment, invoice, and receiving mutations", () => {
  assert.equal(requiresIdempotencyKey("POST", "/api/v1/shipments"), true);
  assert.equal(requiresIdempotencyKey("POST", "/api/v1/shipments/4e15a0bf-3152-48d8-9207-78f2abcf8229/events"), true);
  assert.equal(requiresIdempotencyKey("POST", "/api/v1/invoices/from-shipment/4e15a0bf-3152-48d8-9207-78f2abcf8229"), true);
  assert.equal(requiresIdempotencyKey("POST", "/api/v1/supply-chain/purchase-orders/4e15a0bf-3152-48d8-9207-78f2abcf8229/receive"), true);
  assert.equal(requiresIdempotencyKey("GET", "/api/v1/shipments"), false);
  assert.equal(requiresIdempotencyKey("POST", "/api/v1/auth/register"), false);
});

test("validates idempotency key length and allowed characters", () => {
  assert.equal(isValidIdempotencyKey("a1b2c3d4-e5f6-7890-abcd"), true);
  assert.equal(isValidIdempotencyKey("short"), false);
  assert.equal(isValidIdempotencyKey("invalid key value 123"), false);
});

test("hashes the method, path, query, and body so keys cannot be reused for another request", () => {
  const base = { method: "POST", path: "/api/v1/shipments", query: {}, body: { recipientName: "A" } };
  assert.equal(hashIdempotentRequest(base), hashIdempotentRequest(base));
  assert.notEqual(hashIdempotentRequest(base), hashIdempotentRequest({ ...base, body: { recipientName: "B" } }));
  assert.notEqual(hashIdempotentRequest(base), hashIdempotentRequest({ ...base, path: "/api/v1/invoices" }));
});
