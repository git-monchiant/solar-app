// Logged-in user id lives in localStorage and is forwarded as x-user-id header
// on every API call so the server can attribute actions to the right person.
export function getUserIdHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const id = window.localStorage.getItem("userId");
  return id ? { "x-user-id": id } : {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiFetch(url: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "ngrok-skip-browser-warning": "true",
      ...getUserIdHeader(),
      ...options?.headers,
    },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    window.localStorage.removeItem("userId");
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
