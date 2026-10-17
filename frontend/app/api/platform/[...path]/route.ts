import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";
type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: RouteContext) {
  const token = request.cookies.get("lms_session")?.value;
  if (!token || request.cookies.get("lms_platform_admin")?.value !== "1") {
    return NextResponse.json({ message: "Platform administrator sign-in required." }, { status: 401 });
  }
  const { path } = await context.params;
  const safePath = path.map(segment => encodeURIComponent(segment)).join("/");
  const target = new URL(`${API_URL}/platform/${safePath}`);
  target.search = request.nextUrl.search;
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  if (request.headers.has("content-type")) headers.set("content-type", request.headers.get("content-type")!);
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      cache: "no-store",
    });
    const responseBody = await upstream.text();
    const response = new NextResponse(responseBody, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
    if (upstream.ok && request.method === "POST" && path.length === 1 && path[0] === "support-sessions") {
      const session = JSON.parse(responseBody) as { id?: string; tenantId?: string; expiresAt?: string };
      if (session.id && session.tenantId) {
        const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 4 };
        response.cookies.set("lms_tenant", session.tenantId, options);
        response.cookies.set("lms_support_session", session.id, options);
      }
    }
    if (upstream.ok && request.method === "POST" && path[path.length - 1] === "end") {
      response.cookies.delete("lms_tenant");
      response.cookies.delete("lms_support_session");
    }
    return response;
  } catch {
    return NextResponse.json({ message: "The platform service is unavailable." }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
