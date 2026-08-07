// Logged-in user id lives in localStorage and is forwarded as x-user-id header
// on every API call so the server can attribute actions to the right person.
export function getUserIdHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const id = window.localStorage.getItem("userId");
  return id ? { "x-user-id": id } : {};
}

// Fire-and-forget POST to /api/client-log. Never throws; never returns a
// promise the caller needs to await. Used by both apiFetch (on non-OK
// responses) and the global window error handlers.
export function reportClientError(payload: {
  source: string;
  message: string;
  stack?: string;
  status_code?: number;
  request_url?: string;
}) {
  if (typeof window === "undefined") return;
  // Skip recursive logging of the logger's own failures.
  if (payload.request_url?.includes("/api/client-log")) return;
  try {
    fetch("/api/client-log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
        ...getUserIdHeader(),
      },
      body: JSON.stringify({
        ...payload,
        url: window.location.href,
      }),
      keepalive: true, // survives page unload (helpful for navigation errors)
    }).catch(() => { /* swallow */ });
  } catch { /* swallow */ }
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
  if (!res.ok) {
    // Try to capture the server's error body — ใช้ทั้งส่ง log และโยนต่อให้ UI
    let bodyText = "";
    try { bodyText = await res.clone().text(); } catch { /* ignore */ }
    // Skip noisy 401 — they always redirect to /login above; logging adds
    // nothing and floods the table.
    if (res.status !== 401) {
      reportClientError({
        source: "apifetch",
        message: `API error ${res.status} ${url}`,
        stack: bodyText.slice(0, 4000),
        status_code: res.status,
        request_url: url,
      });
    }
    // ข้อความจริงจาก server ({error:"..."}) มีประโยชน์กว่า "API error: 409" มาก
    // แต่ยังคงรูปแบบเดิมไว้เมื่อ body ไม่มีข้อความ เพราะบางหน้าเช็ค /API error: 404/
    let serverMessage = "";
    try { serverMessage = String(JSON.parse(bodyText)?.error || ""); } catch { /* ไม่ใช่ JSON */ }
    throw new Error(serverMessage || `API error: ${res.status}`);
  }
  return res.json();
}
