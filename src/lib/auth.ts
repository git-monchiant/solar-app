import { NextRequest, NextResponse } from "next/server";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { getDb, sql } from "@/lib/db";
import {
  ACTIVE_ROLES_HEADER,
  hasAnyGrantedRole,
  parseActiveRolesHeader,
  resolveEffectiveRoles,
} from "@/lib/role-permissions";

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

// Route guards — return either `{ userId }` or `{ error }`. Callers early-return
// on `error`. Keeps the auth+authz check to a single line at the top of handlers.
export async function requireAuth(req: NextRequest):
  Promise<{ userId: number; error?: undefined } | { error: NextResponse; userId?: undefined }> {
  const userId = getUserIdFromReq(req);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  return { userId };
}

export async function requireAdmin(req: NextRequest):
  Promise<{ userId: number; error?: undefined } | { error: NextResponse; userId?: undefined }> {
  const userId = getUserIdFromReq(req);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const db = await getDb();
  const r = await db.request().input("id", sql.Int, userId)
    .query(`SELECT roles FROM users WHERE id = @id`);
  let roles: string[] = [];
  if (r.recordset[0]?.roles) {
    try { const p = JSON.parse(r.recordset[0].roles); if (Array.isArray(p)) roles = p; } catch {}
  }
  if (!roles.includes("admin")) {
    return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  }
  return { userId };
}

export async function requireAnyRole(req: NextRequest, allowed: readonly string[]):
  Promise<{ userId: number; roles: string[]; error?: undefined } | { error: NextResponse; userId?: undefined; roles?: undefined }> {
  const userId = getUserIdFromReq(req);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const db = await getDb();
  const result = await db.request().input("id", sql.Int, userId)
    .query(`SELECT roles FROM users WHERE id = @id AND is_active = 1`);
  let roles: string[] = [];
  try {
    const parsed = result.recordset[0]?.roles ? JSON.parse(result.recordset[0].roles) : [];
    if (Array.isArray(parsed)) roles = parsed.filter((role): role is string => typeof role === "string");
  } catch {}
  if (!hasAnyGrantedRole(roles, allowed)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { userId, roles };
}

export function getEffectiveRolesFromReq(req: NextRequest, assignedRoles: readonly string[]): string[] {
  const requestedRoles = parseActiveRolesHeader(req.headers.get(ACTIVE_ROLES_HEADER));
  return resolveEffectiveRoles(assignedRoles, requestedRoles);
}

export async function requireAnyActiveRole(req: NextRequest, allowed: readonly string[]):
  Promise<{ userId: number; roles: string[]; assignedRoles: string[]; error?: undefined } | { error: NextResponse; userId?: undefined; roles?: undefined; assignedRoles?: undefined }> {
  const gate = await requireAnyRole(req, ALL_ASSIGNABLE_ROLES);
  if (gate.error) return gate;
  const roles = getEffectiveRolesFromReq(req, gate.roles);
  if (!hasAnyGrantedRole(roles, allowed)) {
    return { error: NextResponse.json({ error: "ไม่มีสิทธิ์ใน role ที่กำลังใช้งาน" }, { status: 403 }) };
  }
  return { userId: gate.userId, roles, assignedRoles: gate.roles };
}

const ALL_ASSIGNABLE_ROLES = [
  "admin",
  "sales",
  "solar_sup",
  "sales_sup",
  "solar",
  "leadsseeker",
  "account",
] as const;
