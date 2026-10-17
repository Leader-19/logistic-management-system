import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";

export async function GET(_request: NextRequest, context: { params: Promise<{ trackingNumber: string }> }) {
  const { trackingNumber } = await context.params;
  try {
    const response = await fetch(`${API_URL}/tracking/${encodeURIComponent(trackingNumber)}`, { cache: "no-store" });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ message: "Tracking service is unavailable." }, { status: 503 });
  }
}
