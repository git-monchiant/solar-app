// Logged-in user id lives in localStorage and is forwarded as x-user-id header
// on every API call so the server can attribute actions to the right person.
export function getUserIdHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const id = window.localStorage.getItem("userId");
  return id ? { "x-user-id": id } : {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiFetch(url: string, options?: RequestInit): Promise<any> {
  const doFetch = () => fetch(url, {
    ...options,
    headers: {
      "ngrok-skip-browser-warning": "true",
      ...getUserIdHeader(),
      ...options?.headers,
    },
  });
  let res = await doFetch();
  // Retry once on 503 — Next.js dev mode returns this while HMR is mid-rebuild
  // so any in-flight request gets clipped. A 250ms backoff is plenty for the
  // recompile to finish. Production 503s (overload) re-throw on the second try.
  if (res.status === 503) {
    await new Promise((r) => setTimeout(r, 250));
    res = await doFetch();
  }
  if (res.status === 401 && typeof window !== "undefined") {
    window.localStorage.removeItem("userId");
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
