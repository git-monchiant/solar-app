"use client";

import Image from "next/image";
import Link from "next/link";

interface HeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  rightContent?: React.ReactNode;
}

export default function Header({ title, subtitle, backHref, rightContent }: HeaderProps) {
  return (
    <div className="relative bg-gradient-to-br from-primary to-primary-dark text-white sticky top-0 z-10 overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      {/* Background logo watermark */}
      <div className="absolute right-[-20px] top-[-10px] opacity-10">
        <Image src="/logo-sena-white.png" alt="" width={120} height={120} className="pointer-events-none" />
      </div>

      <div className="relative px-4 py-4 flex items-center gap-3">
        {backHref && (
          <Link href={backHref} className="p-1 -ml-1 rounded-full active:bg-white/10">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold">{title}</h1>
          {subtitle && <p className="text-xs text-white/70 mt-0.5">{subtitle}</p>}
        </div>
        {rightContent}
      </div>
    </div>
  );
}
