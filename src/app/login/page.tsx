"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("userId")) {
      router.replace("/today");
    }
    fetch("/api/version", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d?.version && setVersion(d.version))
      .catch(() => {});
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) { setError("Please enter your username and password"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign in failed");

      // If this is a different user than last time, wipe all user-scoped state
      // so we don't leak the previous user's role selection, tabs, favorites, etc.
      const prevId = localStorage.getItem("userId");
      if (prevId && String(data.id) !== prevId) {
        const keepKeys = new Set(["userId", "userName"]); // userName about to be overwritten below
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (!k || keepKeys.has(k)) continue;
          localStorage.removeItem(k);
        }
      }
      localStorage.setItem("userId", String(data.id));
      localStorage.setItem("userName", data.full_name || data.username);
      // Full reload so module-level caches (useMe/useActiveRoles) from the
      // previous session are discarded — SPA navigation alone leaves them
      // holding the previous user's roles.
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF7] flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[380px]">
          {/* Brand mark — SENA SOLAR logo */}
          <div className="flex justify-center mb-8">
            <Image src="/logos/logo-sena.png" alt="SENA SOLAR ENERGY" width={220} height={66} priority />
          </div>

          {/* Card */}
          <div className="bg-white rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.08)] ring-1 ring-gray-200/60 p-8">
            <div>
              <h1 className="text-[28px] md:text-[26px] font-semibold text-gray-900 tracking-tight">Welcome back</h1>
              <p className="text-[15px] md:text-[14px] text-gray-500 mt-1.5">Sign in to your Solar Sales workspace</p>
            </div>

            <form onSubmit={submit} className="mt-7 space-y-5 md:space-y-4">
              <div>
                <label className="text-[14px] md:text-[13px] font-medium text-gray-700 block mb-2 md:mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError(""); }}
                  autoComplete="username"
                  autoFocus
                  className="w-full h-12 md:h-11 px-4 md:px-3.5 rounded-lg border border-gray-300 text-[17px] md:text-[15px] text-gray-900 bg-white focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 transition-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2 md:mb-1.5">
                  <label className="text-[14px] md:text-[13px] font-medium text-gray-700">Password</label>
                  <button type="button" tabIndex={-1} className="text-[13px] md:text-[12px] font-medium text-gray-500 hover:text-primary">
                    Forgot?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(""); }}
                    autoComplete="current-password"
                    className="w-full h-12 md:h-11 px-4 md:px-3.5 pr-11 md:pr-10 rounded-lg border border-gray-300 text-[17px] md:text-[15px] text-gray-900 bg-white focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    tabIndex={-1}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-md"
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? (
                      <svg className="w-[16px] h-[16px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" /></svg>
                    ) : (
                      <svg className="w-[16px] h-[16px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100 text-[13px] md:text-[12px] text-red-700">
                  <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" clipRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 102 0V7zm-1 7a1 1 0 100 2 1 1 0 000-2z" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 md:h-11 mt-2 md:mt-1 rounded-lg text-[15px] md:text-[14px] font-semibold text-white bg-primary hover:bg-primary-dark active:brightness-95 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Signing in…</>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-[14px] md:text-[12px] text-gray-400">
            Having trouble?{" "}
            <a href="#" className="font-medium text-gray-600 hover:text-primary transition-colors">Contact admin</a>
            <div className="mt-2 text-[12px] md:text-[11px]">
              © {new Date().getFullYear()} Sena Solar Energy
              {version && (
                <span className="ml-2 font-mono">v{version}</span>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
