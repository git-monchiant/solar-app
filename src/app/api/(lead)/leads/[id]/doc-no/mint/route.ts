import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { mintDocNo, type DocType } from "@/lib/doc-number";

export const runtime = "nodejs";

const ALLOWED: DocType[] = ["booking", "quotation", "survey", "warranty", "install_checklist"];

// POST /api/leads/:id/doc-no/mint?type=quotation
//
// Idempotent — returns the existing doc-no when one is already stored on the
// lead, otherwise mints the next value scoped to (type, current year). Used
// by QuoteStep / WarrantyStep so the frontend never has to know the prefix or
// counter rules; bumping doc_digits_* in /settings flows through automatically.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    if (!leadId) return NextResponse.json({ error: "invalid lead id" }, { status: 400 });

    const type = req.nextUrl.searchParams.get("type") as DocType | null;
    if (!type || !ALLOWED.includes(type)) {
      return NextResponse.json({ error: `type must be one of ${ALLOWED.join("|")}` }, { status: 400 });
    }

    const db = await getDb();
    const docNo = await mintDocNo(db, leadId, type);
    return NextResponse.json({ docNo });
  } catch (e) {
    console.error("POST /api/leads/[id]/doc-no/mint error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
