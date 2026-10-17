export type ApiPage<T> = { data: T[]; total: number; page: number; limit: number; totalPages: number };

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch("/api/backend/" + path.replace(/^\//, ""), {
    ...init,
    headers,
    cache: "no-store",
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result && typeof result === "object" && "message" in result && typeof result.message === "string"
      ? result.message
      : "The request could not be completed.";
    throw new ApiError(message, response.status);
  }
  return result as T;
}
