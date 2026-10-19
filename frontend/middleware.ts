import { NextRequest, NextResponse } from "next/server";

const securityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function secure(response: NextResponse, csp?: string) {
  for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
  if (process.env.NODE_ENV === "production") response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (csp) response.headers.set("Content-Security-Policy", csp);
  return response;
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  const isUnsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(request.method);

  if (isApi && isUnsafeMethod) {
    const origin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");
    if ((origin && origin !== request.nextUrl.origin) || fetchSite === "cross-site") {
      return secure(NextResponse.json({ message: "Cross-origin request rejected." }, { status: 403 }));
    }
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const isAuthPage = path === "/login" || path === "/register";
  const isPublicTrackingPage = path === "/track";
  const isInvitationPage = path === "/accept-invitation";
  const isPublicAsset = path === "/image.jpg";
  const hasSession = Boolean(request.cookies.get("lms_session")?.value);
  const hasTenant = Boolean(request.cookies.get("lms_tenant")?.value);
  const isPlatformAdmin = request.cookies.get("lms_platform_admin")?.value === "1";
  let response: NextResponse;

  if (!isApi && path.startsWith("/platform") && (!hasSession || !isPlatformAdmin)) {
    response = NextResponse.redirect(new URL("/login", request.url));
  } else if (!isApi && !path.startsWith("/platform") && !isAuthPage && !isPublicTrackingPage && !isInvitationPage && !isPublicAsset && (!hasSession || !hasTenant)) {
    response = NextResponse.redirect(new URL("/login", request.url));
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }
  return secure(response, isApi ? undefined : csp);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };