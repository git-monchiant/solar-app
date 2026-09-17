import "server-only";
import { NextResponse } from "next/server";

// ยกจากโปรเจกต์เดิม ~/Documents/Solar O&M/src/lib/liff-auth.ts
// ยืนยันตัวตนลูกค้าฝั่ง LIFF 3 ชั้น — กันช่องโหว่ "รับ lineUserId ดิบแล้วเชื่อเลย"
//   ชั้น 1  มี idToken + ตั้ง OM_LINE_LOGIN_CHANNEL_ID แล้ว → verify กับ LINE (ของจริง)
//   ชั้น 2  dev + NEXT_PUBLIC_LIFF_MOCK=1                  → ยอมรับ lineUserId ดิบ (ปิดตายบน prod)
//   ชั้น 3  นอกนั้น                                        → 401

const MOCK_ALLOWED =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_LIFF_MOCK === "1";

export type LiffIdentity = {
  lineUserId: string;
  via: "verified" | "mock";
  displayName?: string;
  pictureUrl?: string;
};

export type LiffAuthResult =
  | { identity: LiffIdentity; denied?: never }
  | { identity?: never; denied: NextResponse };

function unauthorized(reason: string): LiffAuthResult {
  return {
    denied: NextResponse.json({ error: "ยืนยันตัวตนไม่สำเร็จ", reason }, { status: 401 }),
  };
}

async function verifyLiffIdToken(idToken: string): Promise<{ sub: string; name?: string; picture?: string }> {
  const channelId = process.env.OM_LINE_LOGIN_CHANNEL_ID;
  if (!channelId) throw new Error("OM_LINE_LOGIN_CHANNEL_ID is not set");
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  if (!res.ok) throw new Error(`Invalid ID token: ${await res.text()}`);
  return res.json();
}

// ★ ถ้าอ่าน body ให้ส่งต่อผ่านพารามิเตอร์ — Request body อ่านได้ครั้งเดียว ห้าม route อ่านซ้ำ
export async function authenticateLiff(
  req: Request,
  body?: Record<string, unknown> | null,
): Promise<LiffAuthResult> {
  const url = new URL(req.url);
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const idToken =
    bearer ||
    (typeof body?.idToken === "string" ? body.idToken : "") ||
    url.searchParams.get("idToken") ||
    "";

  if (idToken) {
    if (!process.env.OM_LINE_LOGIN_CHANNEL_ID) {
      console.error("[om-liff-auth] มี idToken แต่ยังไม่ได้ตั้ง OM_LINE_LOGIN_CHANNEL_ID");
      return unauthorized("เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า LINE Login channel");
    }
    try {
      const claims = await verifyLiffIdToken(idToken);
      if (!claims.sub) return unauthorized("id token ไม่มี sub");
      return {
        identity: { lineUserId: claims.sub, via: "verified", displayName: claims.name, pictureUrl: claims.picture },
      };
    } catch (err) {
      return unauthorized(err instanceof Error ? err.message.slice(0, 120) : "id token ใช้ไม่ได้");
    }
  }

  if (MOCK_ALLOWED) {
    const raw =
      (typeof body?.lineUserId === "string" ? body.lineUserId : "") ||
      url.searchParams.get("lineUserId") ||
      "";
    if (raw) {
      console.warn(`[om-liff-auth] ★ โหมดจำลอง — เชื่อ lineUserId ดิบ: ${raw}`);
      return { identity: { lineUserId: raw, via: "mock" } };
    }
  }

  return unauthorized("ต้องส่ง LINE id token มาด้วย");
}

export async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
