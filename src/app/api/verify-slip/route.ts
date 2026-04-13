import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json();
    if (!imageUrl) return NextResponse.json({ is_slip: false });
    return NextResponse.json({ is_slip: true });
  } catch (error) {
    console.error("verify-slip error:", error);
    return NextResponse.json({ is_slip: false });
  }
}
