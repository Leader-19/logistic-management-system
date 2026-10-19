import type { NextFunction, Request, Response } from "express";

type RateLimitBucket = { count: number; resetAt: number };

const readPositiveInteger = (value: string | undefined, fallback: number): number => {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Per-process fixed-window limiter. Keep the map bounded so arbitrary client
 * addresses cannot grow memory without limit. Configure trusted proxy hops in
 * Express at deployment when the API is behind a known reverse proxy.
 */
export function createRateLimitMiddleware() {
  const windowMs = readPositiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
  const generalLimit = readPositiveInteger(process.env.RATE_LIMIT_MAX_REQUESTS, 300);
  const authLimit = readPositiveInteger(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS, 10);
  const maxKeys = readPositiveInteger(process.env.RATE_LIMIT_MAX_KEYS, 10_000);
  const buckets = new Map<string, RateLimitBucket>();
  let requestCount = 0;

  return (request: Request, response: Response, next: NextFunction): void => {
    const now = Date.now();
    const path = request.path;
    const isAuthAttempt = /^\/api\/v1\/auth\/(?:login|register)(?:\/|$)/.test(path);
    const limit = isAuthAttempt ? authLimit : generalLimit;
    const key = `${request.ip || request.socket.remoteAddress || "unknown"}:${isAuthAttempt ? path : "all"}`;
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      if (buckets.size >= maxKeys) {
        const oldestKey = buckets.keys().next().value as string | undefined;
        if (oldestKey !== undefined) buckets.delete(oldestKey);
      }
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, limit - bucket.count);
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    response.setHeader("RateLimit-Limit", String(limit));
    response.setHeader("RateLimit-Remaining", String(remaining));
    response.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > limit) {
      response.setHeader("Retry-After", String(resetSeconds));
      response.status(429).json({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please try again later.",
          details: { retryAfterSeconds: resetSeconds },
          requestId: (request as Request & { requestId?: string }).requestId,
      },
      });
    return;
  }

  requestCount += 1;
  if (requestCount % 1000 === 0) {
    for (const [bucketKey, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(bucketKey);
    }
  }
  next();
};
}
