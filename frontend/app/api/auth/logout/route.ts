import { NextResponse, type NextRequest } from "next/server";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("lms_session")?.value;
  const tenantId = request.cookies.get("lms_tenant")?.value;
  const supportSessionId = request.cookies.get("lms_support_session")?.value;
  if (token && tenantId && supportSessionId) {
    await fetch(`${API_URL}/platform/support-sessions/${encodeURIComponent(supportSessionId)}/end`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    }).catch(() => null);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("lms_session");
  response.cookies.delete("lms_tenant");
  response.cookies.delete("lms_platform_admin");
  response.cookies.delete("lms_support_session");
  return response;
}
