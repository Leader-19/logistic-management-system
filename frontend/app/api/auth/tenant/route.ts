import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("lms_session")?.value;
  const body: unknown = await request.json().catch(() => null);
  const tenantId = body && typeof body === "object" && "tenantId" in body ? body.tenantId : null;
  if (!token || typeof tenantId !== "string") {
    return NextResponse.json({ message: "Choose a valid workspace." }, { status: 400 });
  }

  const upstream = await fetch(`${API_URL}/auth/tenant-context`, {
    headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
    cache: "no-store",
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: "The workspace service is unavailable." }, { status: 503 });
  if (!upstream.ok) return NextResponse.json({ message: "You do not have access to that workspace." }, { status: 403 });

  const tenant = await upstream.json().catch(() => null);
  const response = NextResponse.json({ tenant });
  response.cookies.set("lms_tenant", tenantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return response;
}
