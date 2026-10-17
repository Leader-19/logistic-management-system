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

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      cache: "no-store",
    });
    const responseBody = await upstream.text();
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
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
