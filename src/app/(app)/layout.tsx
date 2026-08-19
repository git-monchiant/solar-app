"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import BottomNav from "@/components/layout/BottomNav";
import { DialogProvider } from "@/components/ui/Dialog";
import { useMe } from "@/lib/roles";
import Loading from "@/components/ui/Loading";

function DbBanner() {
  const { me } = useMe();
  // Gate render on mount — useMe() hydrates from localStorage on the client,
  // so the server (no localStorage) and the first client render disagree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !me?.db_name || me.db_name === "solardb") return null;
  // Inline at the top of the layout flex column — header (sticky inside each
  // page) will sit below this strip instead of being covered by it.
  return (
    <div className={`shrink-0 ${me.db_name === "solardb_v3" ? "bg-red-500" : "bg-amber-500"} text-white text-xxs leading-none font-semibold tracking-widest text-center py-0.5 shadow-md`}>
      DEVELOPMENT / {me.db_name.toUpperCase()}
    </div>
  );
}

// useSearchParams() must live under a <Suspense> boundary or Next.js refuses
// to prerender any page in this layout (build error: missing-suspense-with-csr-bailout).
function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const focus = searchParams.get("focus") === "1";
  // Hub (/home) คือตัว navigation เอง — ไม่แสดง left menu/BottomNav ทับ
  const isHub = pathname === "/home";
  const [ready, setReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem("userId")) {
      router.replace("/login");
      return;
    }
    setSidebarCollapsed(localStorage.getItem("sidebarCollapsed") === "1");
    setReady(true);
  }, [router]);

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", next ? "1" : "0");
      return next;
    });
  };

  if (!ready) {
    return (
      <Loading />
    );
  }

  return (
    <div className="flex h-full">
      {!focus && !isHub && <BottomNav collapsed={sidebarCollapsed} onToggle={toggleSidebar} />}
      {/* transition-margin มีไว้เฉพาะตอนกดย่อ/ขยาย sidebar — เข้า/ออก /home ต้องสลับทันที ไม่เลื่อน */}
      <main className={`flex-1 overflow-y-auto overscroll-none bg-white ${focus || isHub ? "" : `pb-20 md:pb-0 transition-[margin] duration-200 ${sidebarCollapsed ? "md:ml-14" : "md:ml-56"}`}`}>
        {children}
      </main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DialogProvider>
      <div className="flex flex-col h-full">
        <DbBanner />
        <div className="flex-1 min-h-0">
          <Suspense fallback={<Loading />}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </div>
      </div>
    </DialogProvider>
  );
}
