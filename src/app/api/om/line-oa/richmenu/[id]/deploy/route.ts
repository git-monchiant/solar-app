import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { deployVersion } from "@/lib/om/richmenu";

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
      { error: e instanceof Error ? e.message : "เผยแพร่ไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
