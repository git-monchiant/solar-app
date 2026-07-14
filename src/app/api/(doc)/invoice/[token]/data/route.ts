import { NextRequest, NextResponse } from "next/server";
import { getInvoiceData } from "@/lib/invoice-data";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const data = await getInvoiceData(token);
    return data
      ? NextResponse.json(data)
      : NextResponse.json({ error: "not found" }, { status: 404 });
  } catch (error) {
    console.error("Invoice data error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
