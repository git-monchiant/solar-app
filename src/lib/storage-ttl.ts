// localStorage with TTL — used by the shared Dashboard global filter so a
// stale range from yesterday doesn't surprise the user the next morning.
// Values are wrapped as {v, ts} JSON; reads check ts against TTL and lazy-evict
// expired keys.

type Wrapped<T> = { v: T; ts: number };

export function getWithTtl<T = string>(key: string, ttlMs: number): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Wrapped<T>;
    if (!parsed || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > ttlMs) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.v;
  } catch {
    return null;
  }
}

export function setWithTtl<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify({ v: value, ts: Date.now() } satisfies Wrapped<T>));
  } catch { /* quota — non-fatal */ }
}

export const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
