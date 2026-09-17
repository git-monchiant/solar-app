"use client";

// ยกจากโปรเจกต์เดิม ~/Documents/Solar O&M/src/app/liff/layout.tsx
import { useEffect, useState } from "react";
import { initLiff } from "@/lib/om/liff";

export default function OmLiffLayout({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const prevHtmlOverflowY = document.documentElement.style.overflowY;
    const prevBodyOverflowY = document.body.style.overflowY;

    // LIFF webview อาจ inject style ล็อกการเลื่อนหน้า
    document.documentElement.style.overflowY = "auto";
    document.body.style.overflowY = "auto";

    (async () => {
      const liff = await initLiff();
      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }
      setStatus("ready");
    })().catch((err) => {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      document.documentElement.style.overflowY = prevHtmlOverflowY;
      document.body.style.overflowY = prevBodyOverflowY;
    };
  }, []);

  if (status === "loading") {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-white">
        <div className="text-center">
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-teal-600">SENA SOLAR</div>
          <div className="mt-2 text-base font-medium text-zinc-500">กำลังโหลด…</div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-white p-6">
        <div className="max-w-md text-center">
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-red-600">Error</div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">เปิด Mini App ไม่ได้</h1>
          <p className="mt-3 text-base font-medium text-zinc-600">{error}</p>
          <p className="mt-4 text-sm font-medium text-zinc-400">กรุณาเปิดผ่าน LINE app จาก Rich Menu ของ LINE OA</p>
        </div>
      </div>
    );
  }

  return <div className="h-[100dvh] overflow-y-auto bg-white [overscroll-behavior-y:contain]">{children}</div>;
}
