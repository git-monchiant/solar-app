import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb } from "@/lib/b2b/db";
import { B2B_OM_ROLES, isOmTab } from "@/lib/b2b/om";
import { listVisits } from "@/lib/b2b/om-server";

// ครั้งเข้างาน O&M B2B ตามแท็บ (แผน 20261015-09) — ?tab= due · scheduled · onsite · upcoming · done · all
export async function GET(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, B2B_OM_ROLES);
  if (gate.error) return gate.error;
  const tab = req.nextUrl.searchParams.get("tab") ?? "due";
  if (!isOmTab(tab)) return NextResponse.json({ error: "tab ไม่ถูกต้อง" }, { status: 400 });
  return NextResponse.json(await listVisits(await getB2bDb(), tab));
}
