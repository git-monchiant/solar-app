"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api";

export type Role = "admin" | "sales" | "solar";
export const ALL_ROLES: Role[] = ["admin", "sales", "solar"];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  sales: "Sales",
  solar: "Solar",
};

const STORAGE_KEY = "activeRoles";

type Me = { id: number; username: string; full_name: string; roles: Role[] };

let cachedMe: Me | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(cachedMe);
  const [loading, setLoading] = useState(!cachedMe);

  useEffect(() => {
    if (cachedMe) return;
    apiFetch("/api/me").then(d => {
      cachedMe = { ...d, roles: Array.isArray(d.roles) ? d.roles : [] };
      setMe(cachedMe);
      emit();
    }).catch(console.error).finally(() => setLoading(false));
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

  useEffect(() => {
    if (!me || cachedActiveRoles !== null) return;
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Role[];
        const valid = parsed.filter(r => me.roles.includes(r));
        const withAdmin = me.roles.includes("admin") && !valid.includes("admin") ? ["admin" as Role, ...valid] : valid;
        if (withAdmin.length > 0) {
          cachedActiveRoles = withAdmin;
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

  return { activeRoles: cachedActiveRoles || [], setActiveRoles, availableRoles: me?.roles || [] };
}

export function hasRole(activeRoles: Role[], ...required: Role[]): boolean {
  return required.some(r => activeRoles.includes(r));
}
