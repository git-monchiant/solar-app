export type AppRole = "admin" | "sales" | "solar_sup" | "sales_sup" | "solar" | "leadsseeker" | "account";

export const ACTIVE_ROLES_HEADER = "x-active-roles";

const APP_ROLES = new Set<AppRole>([
  "admin",
  "sales",
  "solar_sup",
  "sales_sup",
  "solar",
  "leadsseeker",
  "account",
]);

export function normalizeAppRoles(roles: readonly string[] | undefined | null): AppRole[] {
  if (!Array.isArray(roles)) return [];
  return Array.from(new Set(roles.filter((role): role is AppRole => APP_ROLES.has(role as AppRole))));
}

export function parseActiveRolesHeader(value: string | null): AppRole[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? normalizeAppRoles(parsed.filter((role): role is string => typeof role === "string"))
      : [];
  } catch {
    return [];
  }
}

// Active roles are a restriction on the account's database roles. Admin is the
// only exception: it may preview another known role, but receives only the
// permissions represented by the roles explicitly active in the request.
export function resolveEffectiveRoles(
  assignedRoles: readonly string[] | undefined | null,
  requestedRoles: readonly string[] | undefined | null,
): AppRole[] {
  const assigned = normalizeAppRoles(assignedRoles);
  const requested = normalizeAppRoles(requestedRoles);
  if (requested.length === 0) return [];
  const canPreviewAnyRole = assigned.includes("admin");
  return requested.filter((role) => canPreviewAnyRole || assigned.includes(role));
}

// Supervisors inherit the workspace of the team they supervise. The mapping is
// deliberately one-way: a Sales/Solar team member never gains supervisor-only
// approval permissions.
const INHERITED_ROLES: Partial<Record<AppRole, readonly AppRole[]>> = {
  solar_sup: ["solar"],
  sales_sup: ["sales"],
};

export function grantsRole(grantedRole: string, requiredRole: string): boolean {
  if (grantedRole === requiredRole) return true;
  return (INHERITED_ROLES[grantedRole as AppRole] ?? []).includes(requiredRole as AppRole);
}

export function hasAnyGrantedRole(
  grantedRoles: readonly string[] | undefined | null,
  requiredRoles: readonly string[],
): boolean {
  return Array.isArray(grantedRoles) && grantedRoles.some(
    (grantedRole) => requiredRoles.some((requiredRole) => grantsRole(grantedRole, requiredRole)),
  );
}

// สิทธิ์หน้า Packages — แยก "ดูได้" ออกจาก "แก้ได้" ชัดเจน
// Solar Manager เปิดดูรายละเอียดได้ครบทุกแพ็กเกจ (ช่วงราคาทุกช่วง + อุปกรณ์)
// แต่การเขียนสงวนไว้ให้ admin เท่านั้น
// ทั้งฝั่ง UI และ API route อ่านค่าคู่นี้ที่เดียวกัน — เพิ่ม/ถอนบทบาทจึงแก้จุดเดียว
export const PACKAGE_VIEW_ROLES = ["admin", "solar_sup"] as const satisfies readonly AppRole[];
export const PACKAGE_EDIT_ROLES = ["admin"] as const satisfies readonly AppRole[];
