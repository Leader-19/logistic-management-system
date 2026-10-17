import { NextRequest, NextResponse } from "next/server";
const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";
async function proxy(request: NextRequest) {
  const token = request.cookies.get("lms_session")?.value; const tenantId = request.cookies.get("lms_tenant")?.value;
  if (!token || !tenantId) return NextResponse.json({ message: "Sign in and choose a workspace." }, { status: 401 });
  const headers = new Headers({ Authorization: `Bearer ${token}`, "x-tenant-id": tenantId });
  const support = request.cookies.get("lms_support_session")?.value; if (support) headers.set("x-platform-support-session", support);
  const body = request.method === "POST" ? await request.formData() : undefined;
  const response = await fetch(`${API_URL}/tenants/current/logo`, { method: request.method, headers, body, cache: "no-store" }).catch(() => null);
  if (!response) return NextResponse.json({ message: "The company logo service is unavailable." }, { status: 503 });
  if (request.method === "POST") return NextResponse.json(await response.json().catch(() => null), { status: response.status });
  return new NextResponse(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "private, no-store" } });
}
export function GET(request: NextRequest) { return proxy(request); }
export function POST(request: NextRequest) { return proxy(request); }
