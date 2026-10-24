"use client";
import { ChevronLeftIcon } from "@/components/ui/icons";

import Link from "next/link";
import { useEffect, useState } from "react";
import NotificationBell from "./NotificationBell";

interface HeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  /** โลโก้หน้าชื่อระบบ (ใช้ที่ /home) */
  logoSrc?: string;
  /** โหมดพื้นเข้ม navy — ใช้ที่ /home ให้กลืนกับพื้นหลัง hub */
  dark?: boolean;
  rightContent?: React.ReactNode;
  children?: React.ReactNode;
}

export default function Header({ title, subtitle, backHref, logoSrc, dark = false, rightContent, children }: HeaderProps) {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/version", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d?.version && setVersion(d.version))
      .catch(() => {});
  }, []);
  return (
    <div className={`${dark ? "bg-blue-900" : "bg-white border-b border-gray-200"} sticky top-0 z-40`} style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="min-h-12 py-1 px-5 flex items-center gap-3">
        {backHref && (
          <Link href={backHref} className="p-2 -ml-2 rounded-full text-gray-600 hover:bg-gray-200 transition-colors">
            <ChevronLeftIcon className="w-5 h-5" strokeWidth={2.5} />
          </Link>
        )}
        {logoSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc} alt="" className="h-10 w-auto shrink-0" />
        )}
        {/* มีโลโก้ → จอเล็กซ่อนชื่อข้อความ (โลโก้แทนแบรนด์พอ ไม่งั้นโดนปุ่มขวาเบียดจนเหลือศูนย์) */}
        {logoSrc && <div className="flex-1 sm:hidden" />}
        <div className={`flex-1 min-w-0 ${logoSrc ? "max-sm:hidden" : ""}`}>
          <h1 className={`text-lg font-bold tracking-tight leading-tight truncate flex items-baseline gap-1.5 ${dark ? "text-white" : "text-gray-900"}`}>
            {title}
            {version && (
              <span className={`text-sm font-mono font-semibold tracking-normal shrink-0 ${dark ? "text-blue-300" : "text-gray-500"}`}>
                v{version}
              </span>
            )}
          </h1>
          {subtitle && <p className={`text-xs font-semibold tracking-wider uppercase leading-none mt-0.5 truncate ${dark ? "text-blue-200" : "text-gray-500"}`}>{subtitle}</p>}
        </div>
        <NotificationBell />
        {rightContent}
      </div>
      {children}
    </div>
  );
}
