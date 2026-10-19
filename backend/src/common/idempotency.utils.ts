import type { Request } from "express";
import { createHash } from "node:crypto";

const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const REQUIRED_KEY_PATHS = [
  /^\/api\/v1\/shipments\/?$/,
  /^\/api\/v1\/shipments\/batch(?:\/cancel)?\/?$/,
  /^\/api\/v1\/shipments\/[^/]+\/(?:events|assignment|deliver|cancel)\/?$/,
  /^\/api\/v1\/invoices\/?$/,
  /^\/api\/v1\/invoices\/from-shipment\/[^/]+\/?$/,
  /^\/api\/v1\/supply-chain\/purchase-orders\/?$/,
  /^\/api\/v1\/supply-chain\/purchase-orders\/[^/]+\/(?:issue|receive)\/?$/,
];

export function isValidIdempotencyKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export function requiresIdempotencyKey(method: string, path: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())
    && REQUIRED_KEY_PATHS.some(pattern => pattern.test(path));
}

export function hashIdempotentRequest(request: Pick<Request, "method" | "path" | "query" | "body">): string {
  const payload = JSON.stringify({ method: request.method.toUpperCase(), path: request.path, query: request.query, body: request.body });
  return createHash("sha256").update(payload).digest("hex");
}
