import type { NextRequest } from "next/server";
import { GET as getQuotationPdf } from "../route";

export const runtime = "nodejs";

// Filename route for browser PDF tabs. The parent handler still resolves the
// quotation by id; this extra segment gives Chrome a meaningful tab title.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> },
) {
  const { id } = await params;
  return getQuotationPdf(request, { params: Promise.resolve({ id }) });
}
