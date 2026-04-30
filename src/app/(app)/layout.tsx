"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "@/components/layout/BottomNav";
import { DialogProvider } from "@/components/ui/Dialog";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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
    <DialogProvider>
      <div className="flex h-full">
        <BottomNav />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0 md:ml-56 bg-white">
          {children}
        </main>
      </div>
    </DialogProvider>
  );
}
