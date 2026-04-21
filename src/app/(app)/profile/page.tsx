"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Header from "@/components/layout/Header";

interface UserProfile {
  id: number;
  username: string;
  full_name: string;
  team: string;
  role: string;
  phone: string | null;
  email: string | null;
  stats: { new_leads: number; booked: number; won: number };
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    apiFetch("/api/me").then(setUser).catch(console.error);
  }, []);

  const logout = () => {
    if (!confirm("ออกจากระบบใช่หรือไม่?")) return;
    if (typeof window !== "undefined") {
      localStorage.removeItem("userId");
      localStorage.removeItem("userName");
      localStorage.removeItem("activeRoles");
    }
    router.replace("/login");
  };

  if (!user) return <div className="flex items-center justify-center h-screen"><div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  const initials = user.full_name.split(" ").map(n => n[0]).join("").slice(0, 2);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Profile" subtitle="ACCOUNT & SETTINGS" />

      <div className="max-w-lg mx-auto px-4 pb-24">
        {/* Avatar + Name */}
        <div className="flex flex-col items-center py-6">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <span className="text-2xl font-bold text-primary">{initials}</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900">{user.full_name}</h2>
          <div className="text-sm text-gray-500 mt-0.5">{user.team} · {user.role}</div>
        </div>

        {/* Contact */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Contact</div>
          <div className="space-y-3">
            {user.phone && (
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                <div>
                  <div className="text-xs text-gray-400 uppercase">Phone</div>
                  <div className="text-sm font-semibold text-gray-900">{user.phone.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")}</div>
                </div>
              </div>
            )}
            {user.email && (
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                <div>
                  <div className="text-xs text-gray-400 uppercase">Email</div>
                  <div className="text-sm font-semibold text-gray-900">{user.email}</div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <div>
                <div className="text-xs text-gray-400 uppercase">Username</div>
                <div className="text-sm font-semibold text-gray-900">@{user.username}</div>
              </div>
            </div>
          </div>
        </div>

        {/* This Month Stats */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">This Month</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center py-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="text-2xl font-bold text-gray-900">{user.stats.new_leads}</div>
              <div className="text-xs text-gray-500 uppercase font-semibold mt-0.5">New</div>
            </div>
            <div className="text-center py-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="text-2xl font-bold text-gray-900">{user.stats.booked}</div>
              <div className="text-xs text-gray-500 uppercase font-semibold mt-0.5">Booked</div>
            </div>
            <div className="text-center py-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="text-2xl font-bold text-gray-900">{user.stats.won}</div>
              <div className="text-xs text-gray-500 uppercase font-semibold mt-0.5">Won</div>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="space-y-2 mt-3">
          <a href="/dashboard" className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:border-primary/40 transition-colors">
            <svg className="w-5 h-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
            <span className="text-sm font-semibold text-gray-800">Dashboard</span>
            <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </a>
          <a href="/packages" className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:border-primary/40 transition-colors">
            <svg className="w-5 h-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
            <span className="text-sm font-semibold text-gray-800">Packages</span>
            <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </a>
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={logout}
          className="mt-6 w-full flex items-center justify-center gap-2 bg-white rounded-xl border border-red-200 p-4 text-red-600 font-semibold hover:bg-red-50 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </div>
  );
}
