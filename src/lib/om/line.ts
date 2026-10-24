import { getDb } from "@/lib/db";
import type sql from "mssql";

// LINE channel ของโมดูล O&M — แยกคีย์จาก LINE_* ของระบบขายโดยสิ้นเชิง
// ระหว่างพัฒนาใช้ channel ทดสอบ (OA ส่วนตัว) เท่านั้น ห้ามเอา token ของ @senasolarenergy มาใส่
export const OM_LINE = {
  secret: process.env.OM_LINE_CHANNEL_SECRET || "",
  token: process.env.OM_LINE_CHANNEL_ACCESS_TOKEN || "",
  enabled: process.env.OM_LINE_ENABLED === "true",
  mode: process.env.OM_LINE_MODE || "test", // test / prod
};

// ฐานของโมดูลต้องเป็นตัว v3 เท่านั้น — เซิร์ฟเวอร์เดียวกันมี solardb (prod ระบบขาย) อยู่ด้วย
export async function getOmDb(): Promise<sql.ConnectionPool> {
  const name = process.env.DB_NAME || "";
  if (!/v3$/i.test(name)) {
    throw new Error(`O&M module refuses DB "${name}" — DB_NAME ต้องลงท้าย v3`);
  }
  return getDb();
}

export async function pushLineMessage(to: string, messages: unknown[]): Promise<{ ok: boolean; status: number; body?: string }> {
  if (!OM_LINE.enabled || !OM_LINE.token) return { ok: false, status: 0, body: "OM_LINE disabled or no token" };
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OM_LINE.token}` },
    body: JSON.stringify({ to, messages }),
  });
  return { ok: res.ok, status: res.status, body: res.ok ? undefined : await res.text() };
}

export async function getOmLineProfile(userId: string) {
  if (!OM_LINE.token) return null;
  const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
    headers: { Authorization: `Bearer ${OM_LINE.token}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<{ displayName: string; userId: string; pictureUrl?: string }>;
}
