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

/**
 * ส่ง SMS — ยังไม่ได้ project_key ของ smsmkt จึงมีโหมด dev ที่คืนรหัสกลับมาแสดงบนจอ
 * ★ โหมด dev ต้องปิดตายบน production ไม่งั้นใครก็ยืนยันเป็นใครก็ได้
 */
export const SMS_DEV_MODE =
  process.env.NODE_ENV === "development" && process.env.OM_OTP_DEV === "1";

export async function sendOtpSms(phone: string, code: string, ref: string):
  Promise<{ ok: boolean; via: "dev" | "smsmkt"; devCode?: string; error?: string }> {
  if (SMS_DEV_MODE) return { ok: true, via: "dev", devCode: code };

  const key = process.env.SMSMKT_PROJECT_KEY;
  const secret = process.env.SMSMKT_SECRET_KEY;
  if (!key || !secret) return { ok: false, via: "smsmkt", error: "ยังไม่ได้ตั้งค่า SMS (project_key)" };

  const res = await fetch("https://portal-otp.smsmkt.com/api/otp-send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api_key": key, "secret_key": secret },
    body: JSON.stringify({ project_key: key, phone, ref_code: ref, message: `รหัสยืนยัน SENA Solar: ${code}` }),
  }).catch(() => null);

  if (!res?.ok) return { ok: false, via: "smsmkt", error: `ส่ง SMS ไม่สำเร็จ (${res?.status ?? "network"})` };
  return { ok: true, via: "smsmkt" };
}
