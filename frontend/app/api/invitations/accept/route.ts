import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";

export async function POST(request: NextRequest) {
  const body = await request.text();
  try {
    const upstream = await fetch(`${API_URL}/invitations/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
    });
    const responseBody = await upstream.text();
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ message: "The API service is unavailable." }, { status: 503 });
  }
}
