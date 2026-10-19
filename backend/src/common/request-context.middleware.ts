import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

type RequestWithId = Request & { requestId?: string; tenantId?: string; user?: { sub?: string } };
const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

/** Adds a safe correlation ID to each inbound API request and response. */
export function createRequestContextMiddleware() {
  return (request: RequestWithId, response: Response, next: NextFunction): void => {
    const startedAt = Date.now();
    const suppliedId = request.get("x-request-id");
    const requestId = suppliedId && UUID_PATTERN.test(suppliedId) ? suppliedId : randomUUID();
    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    response.on("finish", () => {
      console.info(JSON.stringify({
        level: response.statusCode >= 500 ? "error" : response.statusCode >= 400 ? "warn" : "info",
        event: "http.request.completed",
        requestId,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
        ...(request.tenantId ? { tenantId: request.tenantId } : {}),
        ...(request.user?.sub ? { actorId: request.user.sub } : {}),
      }));
    });
    next();
  };
}
