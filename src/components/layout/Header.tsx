"use client";
import { ChevronLeftIcon } from "@/components/ui/icons";

import Link from "next/link";
import { useEffect, useState } from "react";
import RoleSwitcher from "./RoleSwitcher";
import NotificationBell from "./NotificationBell";

interface HeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  rightContent?: React.ReactNode;
  children?: React.ReactNode;
}

export default function Header({ title, subtitle, backHref, rightContent, children }: HeaderProps) {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/version", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d?.version && setVersion(d.version))
      .catch(() => {});
  }, []);
  return (
    <div className="bg-gradient-to-b from-primary via-primary/50 to-white sticky top-0 z-40" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-5">
        {backHref && (
          <Link href={backHref} className="p-2 -ml-2 rounded-full text-gray-600 hover:bg-gray-200 transition-colors">
            <ChevronLeftIcon className="w-5 h-5" strokeWidth={2.5} />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold tracking-tight leading-tight text-gray-900 truncate flex items-baseline gap-1.5">
            {title}
            {version && (
              <span className="text-sm font-mono font-semibold text-gray-500 tracking-normal shrink-0">
                v{version}
              </span>
            )}
          </h1>
          {subtitle && <p className="text-xs font-semibold tracking-wider uppercase text-gray-500 leading-none mt-0.5 truncate">{subtitle}</p>}
        </div>
        <NotificationBell />
        <RoleSwitcher />
        {rightContent}
      </div>
      {children}
    </div>
  );
}
