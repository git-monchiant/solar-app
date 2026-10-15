import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb } from "@/lib/b2b/db";
import { isIsoDate } from "@/lib/b2b/project";
import { B2B_OM_ROLES } from "@/lib/b2b/om";
import { listVisitsInRange } from "@/lib/b2b/om-server";

// ปฏิทิน O&M B2B — แยกจากปฏิทิน O&M บ้าน (เคาะ 15 ต.ค.) · ?from=&to= (ไม่เกิน 62 วัน)
export async function GET(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, B2B_OM_ROLES);
  if (gate.error) return gate.error;
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return NextResponse.json({ error: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 62) return NextResponse.json({ error: "ช่วงวันที่ยาวเกินไป" }, { status: 400 });
  return NextResponse.json(await listVisitsInRange(await getB2bDb(), from, to));
}
