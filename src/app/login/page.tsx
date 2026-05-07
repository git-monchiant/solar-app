"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

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
    if (!username || !password) { setError("กรุณากรอก username และ password"); return; }
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

      const prevId = localStorage.getItem("userId");
      if (prevId && String(data.id) !== prevId) {
        const keepKeys = new Set(["userId", "userName"]);
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (!k || keepKeys.has(k)) continue;
          localStorage.removeItem(k);
        }
      }
      localStorage.setItem("userId", String(data.id));
      localStorage.setItem("userName", data.full_name || data.username);
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-primary via-primary-dark to-teal-900 text-white">
      {/* Decorative background circles */}
      <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-white/5" />
      <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-white/5" />
      <div className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full bg-white/5" />

      {/* Top brand — desktop only */}
      <header className="hidden lg:block relative z-10 px-16 py-6">
        <h1 className="text-xl font-bold tracking-wide leading-none">SENA SOLAR</h1>
        <p className="text-sm text-white/70 mt-1">Sales Workspace</p>
      </header>

      {/* Content grid */}
      <div className="relative z-10 grid lg:grid-cols-2 gap-12 items-center px-6 lg:px-16 pt-8 lg:pt-16 pb-16 max-w-7xl mx-auto">
        {/* Left: hero copy */}
        <div className="space-y-4">
          <h2 className="text-5xl lg:text-6xl font-extrabold leading-tight">Solar Sales.</h2>
          <p className="text-xl lg:text-2xl font-medium text-white/90">บริหารงานขายโซลาร์ครบวงจร</p>
          <p className="text-sm lg:text-base text-white/70 leading-relaxed max-w-md">
            ติดตามลูกค้าตั้งแต่ลงทะเบียน สำรวจหน้างาน เสนอราคา ติดตั้ง จนถึงรับประกัน
            ทุกขั้นตอนรวมในที่เดียว เห็นภาพงานทั้งทีมแบบ real-time
          </p>
        </div>

        {/* Right: login card */}
        <div className="lg:justify-self-end w-full max-w-md lg:mt-16">
          <form onSubmit={submit} className="bg-white text-slate-800 rounded-3xl shadow-2xl p-8 lg:p-10 space-y-5">
            <div className="text-center">
              <p className="text-xs tracking-widest text-slate-400 uppercase">SENA SOLAR</p>
              <div className="w-12 h-px bg-slate-300 mx-auto mt-1" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2 tracking-wide">USERNAME</label>
              <div className="flex items-center gap-3 border-b-2 border-slate-200 focus-within:border-primary pb-2 transition-colors">
                <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(""); }}
                  autoComplete="username"
                  autoFocus
                  required
                  disabled={loading}
                  className="flex-1 bg-transparent text-sm text-slate-800 focus:outline-none placeholder:text-slate-300"
                  placeholder="enter username"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2 tracking-wide">PASSWORD</label>
              <div className="flex items-center gap-3 border-b-2 border-slate-200 focus-within:border-primary pb-2 transition-colors">
                <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  className="flex-1 bg-transparent text-sm text-slate-800 focus:outline-none placeholder:text-slate-300"
                  placeholder="enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  tabIndex={-1}
                  className="text-slate-400 hover:text-slate-700 shrink-0"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  style={{ minHeight: 0 }}
                >
                  {showPw ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark disabled:bg-slate-300 text-white font-semibold tracking-widest py-3 rounded-xl transition-colors disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  SIGNING IN…
                </>
              ) : (
                "LOGIN"
              )}
            </button>

            <div className="text-center text-xs text-slate-400 pt-2">
              © {new Date().getFullYear()} Sena Solar Energy
              {version && <span className="ml-2 font-mono">v{version}</span>}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
