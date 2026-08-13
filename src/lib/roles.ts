"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api";

export type Role = "admin" | "sales" | "solar_sup" | "sales_sup" | "solar" | "leadsseeker" | "account";
export const ALL_ROLES: Role[] = ["admin", "sales", "solar_sup", "sales_sup", "solar", "leadsseeker", "account"];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  sales: "Sales",
  solar_sup: "Solar Manager",
  sales_sup: "Sale Manager",
  solar: "Solar",
  leadsseeker: "Leads Seeker",
  account: "Account",
};

const STORAGE_KEY = "activeRoles";

type Me = { id: number; username: string; full_name: string; roles: Role[]; db_name?: string };

// Persist /api/me across page reloads. The hot copy lives in module memory
// (cachedMe); on cold module load we hydrate from localStorage so the very
// first render shows the user immediately, then background-refresh.
const ME_STORAGE = "auto:me:v1";

function readPersisted(): Me | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ME_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Me;
    return parsed && typeof parsed.id === "number" ? parsed : null;
  } catch { return null; }
}
function writePersisted(m: Me | null) {
  if (typeof window === "undefined") return;
  try {
    if (m) window.localStorage.setItem(ME_STORAGE, JSON.stringify(m));
    else window.localStorage.removeItem(ME_STORAGE);
  } catch { /* quota or private mode — ignore */ }
}

let cachedMe: Me | null = readPersisted();
// In-flight promise — components mounting in parallel (page + BottomNav +
// Header all useMe()) used to each trigger their own /api/me. This shared
// promise lets every concurrent caller await the same request.
let mePromise: Promise<Me> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

function fetchMe(): Promise<Me> {
  if (mePromise) return mePromise;
  mePromise = apiFetch("/api/me").then((d: Me) => {
    cachedMe = { ...d, roles: Array.isArray(d.roles) ? d.roles : [] };
    writePersisted(cachedMe);
    emit();
    return cachedMe;
  }).finally(() => { mePromise = null; });
  return mePromise;
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(cachedMe);
  // No spinner needed when localStorage gave us a cached user.
  const [loading, setLoading] = useState(!cachedMe);

  useEffect(() => {
    // Always background-refresh so role/name changes propagate, but don't
    // block initial render when we already have a cached copy.
    fetchMe().then((m) => setMe(m)).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const fn = () => setMe(cachedMe);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  return { me, loading };
}

let cachedActiveRoles: Role[] | null = null;
const roleListeners = new Set<() => void>();
function emitRoles() { roleListeners.forEach(l => l()); }

export function useActiveRoles(): { activeRoles: Role[]; setActiveRoles: (r: Role[]) => void; availableRoles: Role[] } {
  const { me } = useMe();
  const [, force] = useState(0);

  // Admin sees every role in the switcher so they can preview any view —
  // even ones not explicitly assigned to their account.
  const availableRoles: Role[] = me
    ? (me.roles.includes("admin") ? ALL_ROLES : me.roles)
    : [];

  useEffect(() => {
    if (!me || cachedActiveRoles !== null) return;
    const allowed = me.roles.includes("admin") ? ALL_ROLES : me.roles;
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Role[];
        const valid = parsed.filter(r => allowed.includes(r));
        if (valid.length > 0) {
          cachedActiveRoles = valid;
          emitRoles();
          return;
        }
      } catch {}
    }
    cachedActiveRoles = me.roles;
    emitRoles();
  }, [me]);

  useEffect(() => {
    const fn = () => force(n => n + 1);
    roleListeners.add(fn);
    return () => { roleListeners.delete(fn); };
  }, []);

  const setActiveRoles = (r: Role[]) => {
    cachedActiveRoles = r;
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
    emitRoles();
  };

  return { activeRoles: cachedActiveRoles || [], setActiveRoles, availableRoles };
}

export function hasRole(activeRoles: Role[], ...required: Role[]): boolean {
  return required.some(r => activeRoles.includes(r));
}
