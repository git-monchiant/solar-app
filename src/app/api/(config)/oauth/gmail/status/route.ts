import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { loadTokens, clearTokens } from "@/lib/gmail";

// GET → connection status (any authenticated user)
// DELETE → disconnect / clear tokens (admin)
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const t = await loadTokens();
  return NextResponse.json({
    connected: !!t?.refresh_token,
    email: t?.email ?? null,
    connected_at: t?.connected_at ?? null,
  });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;
  await clearTokens();
  return NextResponse.json({ ok: true });
}
