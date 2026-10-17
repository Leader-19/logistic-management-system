import { NextResponse } from "next/server";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";
const SESSION_COOKIE = "lms_session";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("email" in body) || !("password" in body)) {
    return NextResponse.json({ message: "Enter your email and password." }, { status: 400 });
  }

  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null);

  if (!response) return NextResponse.json({ message: "The sign-in service is unavailable." }, { status: 503 });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result !== "object" || !("accessToken" in result)) {
    const message = result && typeof result === "object" && "message" in result && typeof result.message === "string"
      ? result.message
      : "Unable to sign in with those details.";
    return NextResponse.json({ message }, { status: response.status || 401 });
  }

  const token = result.accessToken;
  if (typeof token !== "string") return NextResponse.json({ message: "Invalid sign-in response." }, { status: 502 });

  const memberships = "memberships" in result && Array.isArray(result.memberships) ? result.memberships : [];
  const hasActiveWorkspace = memberships.some((membership) =>
    membership && typeof membership === "object" && "tenantStatus" in membership && membership.tenantStatus === "ACTIVE",
  );
  const isPlatformAdmin = "isPlatformAdmin" in result && result.isPlatformAdmin === true;
  if (!hasActiveWorkspace && !isPlatformAdmin) {
    return NextResponse.json({ message: "This account does not have an active workspace." }, { status: 403 });
  }

  const nextResponse = NextResponse.json({ user: "user" in result ? result.user : null, memberships, platformAdmin: isPlatformAdmin });
  nextResponse.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  if (isPlatformAdmin) {
    nextResponse.cookies.set("lms_platform_admin", "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }
  return nextResponse;
}
