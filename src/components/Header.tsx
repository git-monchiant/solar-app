"use client";

import Link from "next/link";

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
          <Link href={backHref} className="p-2 -ml-2 rounded-full text-gray-600 hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold tracking-tight leading-tight text-gray-900 truncate">{title}</h1>
          {subtitle && <p className="text-xs font-semibold tracking-wider uppercase text-gray-400 leading-none mt-0.5 truncate">{subtitle}</p>}
        </div>
        {rightContent}
        {!hideAvatar && (
          <Link
            href="/profile"
            className="rounded-full bg-gray-100 flex items-center justify-center shrink-0 hover:bg-gray-200 transition-colors"
            style={{ width: "2.5rem", height: "2.5rem", minHeight: "2.5rem" }}
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}
