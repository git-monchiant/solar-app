"use client";

import Link from "next/link";
import RoleSwitcher from "./RoleSwitcher";

interface HeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  rightContent?: React.ReactNode;
  hideAvatar?: boolean;
  children?: React.ReactNode;
}

export default function Header({ title, subtitle, backHref, rightContent, hideAvatar, children }: HeaderProps) {
  return (
    <div className="bg-gradient-to-b from-primary via-primary/50 to-white sticky top-0 z-10" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="h-16 px-5 flex items-center gap-3">
        {backHref && (
          <Link href={backHref} className="p-2 -ml-2 rounded-full text-gray-600 hover:bg-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold tracking-tight leading-tight text-gray-900 truncate flex items-baseline gap-1.5">
            {title}
            {process.env.NEXT_PUBLIC_APP_VERSION && (
              <span className="text-sm font-mono font-semibold text-gray-500 tracking-normal shrink-0">
                v{process.env.NEXT_PUBLIC_APP_VERSION}
              </span>
            )}
          </h1>
          {subtitle && <p className="text-xs font-semibold tracking-wider uppercase text-gray-500 leading-none mt-0.5 truncate">{subtitle}</p>}
        </div>
        <RoleSwitcher />
        {rightContent}
      </div>
      {children}
    </div>
  );
}
