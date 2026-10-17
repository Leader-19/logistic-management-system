import { NextRequest, NextResponse } from "next/server";
const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";
type Context = { params: Promise<{ id: string }> };
async function upstream(request: NextRequest, context: Context) {
  const token = request.cookies.get("lms_session")?.value; const tenantId = request.cookies.get("lms_tenant")?.value;
  if (!token || !tenantId) return NextResponse.json({ message: "Sign in and choose a workspace." }, { status: 401 });
  const { id } = await context.params; const headers = new Headers({ Authorization: `Bearer ${token}`, "x-tenant-id": tenantId });
  const support = request.cookies.get("lms_support_session")?.value; if (support) headers.set("x-platform-support-session", support);
  let body: FormData | undefined;
  if (request.method === "POST") { body = await request.formData(); }
  const response = await fetch(`${API_URL}/products/${encodeURIComponent(id)}/image`, { method: request.method, headers, body, cache: "no-store" }).catch(() => null);
  if (!response) return NextResponse.json({ message: "The product image service is unavailable." }, { status: 503 });
  return new NextResponse(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "private, no-store" } });
}
export function GET(request: NextRequest, context: Context) { return upstream(request, context); }
export function POST(request: NextRequest, context: Context) { return upstream(request, context); }
