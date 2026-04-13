"use client";

import Link from "next/link";

// Mock user — replace with real session fetch when auth is wired up
const mockUser = {
  initials: "สช",
  full_name: "สมชาย ขายเก่ง",
  username: "somchai",
  team: "Sen X PM",
  role: "Sales",
  phone: "081-234-5678",
  email: "somchai@senasolar.co.th",
  joined_at: "2025-08-15",
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

export default function ProfilePage() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-primary-dark text-white" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="px-4 py-3.5 flex items-center gap-3">
          <Link href="/today" className="p-1 -ml-1 rounded-full active:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold tracking-tight">Profile</h1>
            <p className="text-xs font-semibold tracking-wider uppercase text-white/60 mt-0.5">Account & Settings</p>
          </div>
        </div>

        {/* Avatar hero */}
        <div className="flex flex-col items-center pb-6 pt-2">
          <div className="w-24 h-24 rounded-full bg-white/15 backdrop-blur-sm ring-4 ring-white/30 flex items-center justify-center shadow-lg shadow-black/10">
            <span className="text-3xl font-black tracking-tight">{mockUser.initials}</span>
          </div>
          <div className="mt-3 text-lg font-bold tracking-tight">{mockUser.full_name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-white/75">
            <span className="bg-white/15 px-2 py-0.5 rounded-full text-xs font-semibold">{mockUser.team}</span>
            <span>·</span>
            <span>{mockUser.role}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-20">
        <div className="p-3 space-y-2">
          {/* Contact info */}
          <div className="rounded-lg bg-white border border-gray-200 p-3">
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">Contact</label>
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">Phone</div>
                  <div className="text-sm font-semibold text-gray-900 font-mono tabular-nums">{mockUser.phone}</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">Email</div>
                  <div className="text-sm font-semibold text-gray-900">{mockUser.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">Username</div>
                  <div className="text-sm font-semibold text-gray-900 font-mono">@{mockUser.username}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats mock */}
          <div className="rounded-lg bg-white border border-gray-200 p-3">
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">This Month</label>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded-md bg-gray-50">
                <div className="text-xl font-bold font-mono tabular-nums text-gray-900">12</div>
                <div className="text-xs font-semibold tracking-wider uppercase text-gray-400 mt-0.5">New</div>
              </div>
              <div className="text-center p-2 rounded-md bg-gray-50">
                <div className="text-xl font-bold font-mono tabular-nums text-primary">4</div>
                <div className="text-xs font-semibold tracking-wider uppercase text-gray-400 mt-0.5">Booked</div>
              </div>
              <div className="text-center p-2 rounded-md bg-gray-50">
                <div className="text-xl font-bold font-mono tabular-nums text-emerald-600">2</div>
                <div className="text-xs font-semibold tracking-wider uppercase text-gray-400 mt-0.5">Won</div>
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="rounded-lg bg-white border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider uppercase text-gray-400">Joined</span>
              <span className="text-xs font-semibold text-gray-700">{formatDate(mockUser.joined_at)}</span>
            </div>
          </div>

          {/* Menu items */}
          <div className="rounded-lg bg-white border border-gray-200 overflow-hidden">
            <button className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-100">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="flex-1 text-left text-sm font-semibold text-gray-800">Settings</span>
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
            <button className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
              <span className="flex-1 text-left text-sm font-semibold text-gray-800">Help & Support</span>
              <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          {/* Logout */}
          <Link
            href="/login"
            className="block w-full h-11 rounded-lg text-sm font-semibold text-red-500 border border-red-200 bg-white hover:bg-red-50 flex items-center justify-center gap-2 transition-colors mt-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            Logout
          </Link>
        </div>
      </div>
    </div>
  );
}
