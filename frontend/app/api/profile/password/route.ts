import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("lms_session")?.value;
  if (!token) return NextResponse.json({ message: "Sign in to change your password." }, { status: 401 });
  const upstream = await fetch(`${API_URL}/auth/me/password`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: await request.text(),
    cache: "no-store",
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: "The password service is unavailable." }, { status: 503 });
  return NextResponse.json(await upstream.json().catch(() => null), { status: upstream.status });
}
