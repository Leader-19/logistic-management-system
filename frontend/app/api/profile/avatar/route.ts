import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";

async function authenticated(request: NextRequest) {
  const token = request.cookies.get("lms_session")?.value;
  if (!token) return null;
  return fetch(`${API_URL}/auth/me/avatar`, {
    method: request.method,
    headers: { Authorization: `Bearer ${token}`, ...(request.method === "POST" ? { "Content-Type": request.headers.get("content-type") ?? "" } : {}) },
    ...(request.method === "POST" ? { body: await request.arrayBuffer() } : {}),
    cache: "no-store",
  }).catch(() => null);
}

export async function GET(request: NextRequest) {
  const upstream = await authenticated(request);
  if (!upstream) return NextResponse.json({ message: "Profile image service unavailable." }, { status: request.cookies.has("lms_session") ? 503 : 401 });
  if (!upstream.ok) return NextResponse.json({ message: "Profile picture not found." }, { status: upstream.status });
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream", "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  const upstream = await authenticated(request);
  if (!upstream) return NextResponse.json({ message: "Profile image service unavailable." }, { status: request.cookies.has("lms_session") ? 503 : 401 });
  return NextResponse.json(await upstream.json().catch(() => null), { status: upstream.status });
}
