export type ApiPage<T> = { data: T[]; total: number; page: number; limit: number; totalPages: number };

const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 300;
const MAX_RETRY_AFTER_MS = 30_000;
const SAFE_RETRY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const IDEMPOTENT_MUTATION_PATHS = [
  /^shipments\/?$/,
  /^shipments\/batch(?:\/cancel)?\/?$/,
  /^shipments\/[^/]+\/(?:events|assignment|deliver|cancel)\/?$/,
  /^invoices\/?$/,
  /^invoices\/from-shipment\/[^/]+\/?$/,
  /^supply-chain\/purchase-orders\/?$/,
  /^supply-chain\/purchase-orders\/[^/]+\/(?:issue|receive)\/?$/,
];

export class ApiError extends Error {
  readonly status: number;
  readonly requestId?: string;

  constructor(message: string, status: number, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get("Retry-After");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason ?? new DOMException("The operation was aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function fetchWithRetry(url: string, init: RequestInit, retryable: boolean): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      if (!retryable || attempt >= MAX_RETRIES || init.signal?.aborted || !(error instanceof TypeError)) throw error;
      await waitForRetry(BASE_RETRY_DELAY_MS * 2 ** attempt, init.signal ?? undefined);
      continue;
    }

    if (!retryable || attempt >= MAX_RETRIES || !RETRYABLE_STATUS_CODES.has(response.status)) return response;
    const serverDelay = retryAfterMs(response);
    if (serverDelay !== undefined && serverDelay > MAX_RETRY_AFTER_MS) return response;
    const delay = serverDelay ?? BASE_RETRY_DELAY_MS * 2 ** attempt;
    await response.body?.cancel().catch(() => undefined);
    await waitForRetry(delay, init.signal ?? undefined);
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const requestInit: RequestInit = { ...init, headers, cache: "no-store" };
  const method = (requestInit.method ?? "GET").toUpperCase();
  const normalizedPath = path.replace(/^\//, "").split("?", 1)[0];
  const idempotentMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method)
    && IDEMPOTENT_MUTATION_PATHS.some(pattern => pattern.test(normalizedPath));
  if (idempotentMutation && !headers.has("Idempotency-Key")) headers.set("Idempotency-Key", crypto.randomUUID());
  const response = await fetchWithRetry(
    "/api/backend/" + path.replace(/^\//, ""),
    requestInit,
    SAFE_RETRY_METHODS.has(method) || (idempotentMutation && headers.has("Idempotency-Key")),
  );
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const payload = result && typeof result === "object" ? result as { message?: unknown; error?: unknown } : null;
    const responseMessage = payload?.message ?? (payload?.error && typeof payload.error === "object" && "message" in payload.error ? payload.error.message : undefined);
    const message = typeof responseMessage === "string"
      ? responseMessage
      : Array.isArray(responseMessage)
        ? responseMessage.filter((item): item is string => typeof item === "string").join(" ") || "The submitted data is invalid."
        : "The request could not be completed.";
    throw new ApiError(message, response.status, response.headers.get("X-Request-Id") ?? undefined);
  }
  return result as T;
}
