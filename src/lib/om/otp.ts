import "server-only";
import crypto from "crypto";

// ── กติกา OTP (ตาม mockup 20260826_05) ──
export const OTP_TTL_MIN = 5;       // อายุรหัส
export const OTP_RESEND_SEC = 60;   // ขอใหม่ได้หลังกี่วินาที
export const OTP_MAX_ATTEMPTS = 3;  // กรอกผิดได้กี่ครั้ง

/** เก็บเป็น hash ไม่เก็บรหัสตรง ๆ · ผสม ref เพื่อไม่ให้ rainbow table ใช้ได้กับทุกคำขอ */
export const hashCode = (ref: string, code: string) =>
  crypto.createHash("sha256").update(`${ref}:${code}`).digest("hex");

export const genRef = () => "SNA" + crypto.randomInt(1000, 9999);
export const genCode = () => String(crypto.randomInt(100000, 999999));

/** เบอร์ไทยให้เหลือ 10 หลักรูปแบบเดียว (ทะเบียนเก็บหลายรูปแบบ) */
export function normalizePhone(raw: string): string | null {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10 && /^0[689]/.test(d)) return d;
  if (d.length === 11 && d.startsWith("66")) return "0" + d.slice(2);
  if (d.length === 12 && d.startsWith("660")) return "0" + d.slice(3);
  return null;
}

/** โหมด dev — คืนรหัสกลับมาแสดงบนจอ ไม่ส่ง SMS จริง (ต้องปิดตายบน production) */
export const SMS_DEV_MODE =
  process.env.NODE_ENV === "development" && process.env.OM_OTP_DEV === "1";

/**
 * ส่ง SMS ผ่าน smsmkt (Clicknext)
 * ★ 10 ก.ย. 69: ของเดิมอ่าน env ชื่อ SMSMKT_PROJECT_KEY ซึ่ง "ไม่มีอยู่จริง" ⇒ ส่งไม่เคยออกเลย
 *   เปลี่ยนมาใช้ชุดเดียวกับที่ระบบขายใช้อยู่และส่งได้จริง (src/app/api/(sms)/sms/send/route.ts)
 *   ปลายทางคือ /send-message · สำเร็จเมื่อ HTTP 200 และ code = "000"
 * ★ โหมด dev (OM_OTP_DEV=1) คืนรหัสกลับมาแสดงบนจอ ไม่ส่งจริง — ต้องปิดตายบน production
 */
export const SMS_API_URL = process.env.SMSMKT_API_URL || "https://portal-otp.smsmkt.com/api";

export async function sendOtpSms(phone: string, code: string, ref: string):
  Promise<{ ok: boolean; via: "dev" | "smsmkt"; devCode?: string; error?: string; txId?: string | null }> {
  if (SMS_DEV_MODE) return { ok: true, via: "dev", devCode: code };

  const apiKey = process.env.SMSMKT_API_KEY;
  const secret = process.env.SMSMKT_SECRET_KEY;
  const sender = process.env.SMSMKT_SENDER;
  if (!apiKey || !secret || !sender)
    return { ok: false, via: "smsmkt", error: "ยังไม่ได้ตั้งค่า SMS (api_key / secret_key / sender)" };

  const res = await fetch(`${SMS_API_URL}/send-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", api_key: apiKey, secret_key: secret },
    body: JSON.stringify({
      message: `รหัสยืนยัน SENA Solar: ${code} (อ้างอิง ${ref}) ใช้ได้ ${OTP_TTL_MIN} นาที`,
      phone,
      sender,
      ...(process.env.SMSMKT_PROJECT_ID ? { project_id: process.env.SMSMKT_PROJECT_ID } : {}),
    }),
  }).catch(() => null);

  const data = (await res?.json().catch(() => ({}))) as { code?: string; detail?: unknown; result?: { transaction_id?: string } };
  if (!res?.ok || data?.code !== "000")
    return { ok: false, via: "smsmkt", error: `ส่ง SMS ไม่สำเร็จ (${data?.code ?? res?.status ?? "network"})` };
  return { ok: true, via: "smsmkt", txId: data?.result?.transaction_id ?? null };
}
