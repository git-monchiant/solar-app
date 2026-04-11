"use client";

import Link from "next/link";

interface HeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  rightContent?: React.ReactNode;
}

export default function Header({ title, subtitle, backHref, rightContent }: HeaderProps) {
  return (
    <div className="bg-gradient-to-br from-primary to-primary-dark text-white sticky top-0 z-10" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      {/* Top bar — fixed h-16 to match sidebar logo */}
      <div className="h-16 px-4 flex items-center gap-3">
        {backHref && (
          <Link href={backHref} className="p-1 -ml-1 rounded-full active:bg-white/10 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold tracking-tight leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-[10px] font-semibold tracking-wider uppercase text-white/60 leading-tight mt-0.5 truncate">{subtitle}</p>}
        </div>
        {rightContent}
      </div>
    </div>
  );
}
