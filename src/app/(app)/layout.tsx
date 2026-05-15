"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BottomNav from "@/components/layout/BottomNav";
import { DialogProvider } from "@/components/ui/Dialog";
import { useMe } from "@/lib/roles";

function DbBanner() {
  const { me } = useMe();
  // Gate render on mount — useMe() hydrates from localStorage on the client,
  // so the server (no localStorage) and the first client render disagree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || me?.db_name !== "solardb_dev") return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-white text-[10px] leading-none font-semibold tracking-widest text-center py-0.5 shadow-md pointer-events-none">
      DEVELOPMENT / DEMO
    </div>
  );
}

// useSearchParams() must live under a <Suspense> boundary or Next.js refuses
// to prerender any page in this layout (build error: missing-suspense-with-csr-bailout).
function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focus = searchParams.get("focus") === "1";
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem("userId")) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {!focus && <BottomNav />}
      <main className={`flex-1 overflow-y-auto bg-white ${focus ? "" : "pb-20 md:pb-0 md:ml-56"}`}>
        {children}
      </main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DialogProvider>
      <DbBanner />
      <Suspense fallback={<div className="h-full flex items-center justify-center bg-gray-50"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>}>
        <AppShell>{children}</AppShell>
      </Suspense>
    </DialogProvider>
  );
}
