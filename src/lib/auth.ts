import { NextRequest } from "next/server";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

// Password hash format: "scrypt:<saltHex>:<hashHex>"  (scrypt N=16384, r=8, p=1)
export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 32);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(plain, salt, expected.length);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// Client sends the logged-in user id via `x-user-id` header (set in src/lib/api.ts).
// Returns null for unauthenticated requests so callers can decide whether to 401.
export function getUserIdFromReq(req: NextRequest): number | null {
  const h = req.headers.get("x-user-id");
  if (!h) return null;
  const n = parseInt(h);
  return Number.isFinite(n) && n > 0 ? n : null;
}
