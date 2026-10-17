import { NextResponse } from "next/server";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Complete all required fields." }, { status: 400 });
  }

  const upstream = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: "The registration service is unavailable." }, { status: 503 });
  const result: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok || !result || typeof result !== "object" || !("accessToken" in result) || !("tenant" in result)) {
    const message = result && typeof result === "object" && "message" in result && typeof result.message === "string"
      ? result.message
      : "Unable to create the workspace.";
    return NextResponse.json({ message }, { status: upstream.status || 502 });
  }

  const token = result.accessToken;
  const tenant = result.tenant;
  if (typeof token !== "string" || !tenant || typeof tenant !== "object" || !("id" in tenant) || typeof tenant.id !== "string") {
    return NextResponse.json({ message: "Invalid registration response." }, { status: 502 });
  }

  const tenantResponse = await fetch(`${API_URL}/auth/tenant-context`, {
    headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenant.id },
    cache: "no-store",
  }).catch(() => null);
  if (!tenantResponse?.ok) return NextResponse.json({ message: "Workspace created, but its access could not be verified. Please sign in." }, { status: 502 });

  const response = NextResponse.json({ user: "user" in result ? result.user : null, tenant });
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24,
  };
  response.cookies.set("lms_session", token, cookieOptions);
  response.cookies.set("lms_tenant", tenant.id, cookieOptions);
  return response;
}
