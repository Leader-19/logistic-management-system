import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";
type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: RouteContext) {
  const token = request.cookies.get("lms_session")?.value;
  const tenantId = request.cookies.get("lms_tenant")?.value;
  if (!token || !tenantId) return NextResponse.json({ message: "Sign in and choose a workspace." }, { status: 401 });

  const { path } = await context.params;
  const safePath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const target = new URL(API_URL + "/" + safePath);
  target.search = request.nextUrl.search;
  const headers = new Headers({ Authorization: "Bearer " + token, "x-tenant-id": tenantId });
  const supportSessionId = request.cookies.get("lms_support_session")?.value;
  if (supportSessionId) headers.set("x-platform-support-session", supportSessionId);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const requestId = request.headers.get("x-request-id");
  if (requestId) headers.set("x-request-id", requestId);
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

  try {
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: body === undefined ? undefined : body,
      cache: "no-store",
      // @ts-expect-error -- Node's fetch supports duplex half streaming/multipart bodies beyond the standard types.
      duplex: "half",
    });
    const responseBody = await upstream.text();
    const responseHeaders = new Headers();
    for (const name of ["content-type", "x-request-id", "retry-after", "ratelimit-limit", "ratelimit-remaining", "ratelimit-reset"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json({ message: "The API service is unavailable." }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
