import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { deployVersion } from "@/lib/om/richmenu";
import { omErrorText } from "@/lib/om/api-error";

// POST — เผยแพร่เวอร์ชันนี้ (blue-green) · ใช้ทั้งตอน deploy ใหม่และตอน rollback กลับเวอร์ชันเก่า
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const { id } = await ctx.params;
  try {
    const result = await deployVersion(Number(id), gate.userId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: omErrorText(e, "เผยแพร่เมนูไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "POST /api/om/line-oa/richmenu/[id]/deploy") },
      { status: 500 },
    );
  }
}
