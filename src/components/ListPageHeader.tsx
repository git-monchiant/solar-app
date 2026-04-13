"use client";

import { useEffect, useRef } from "react";
import Header from "./Header";

export interface ListPageTab {
  key: string;
  label: string;
  count?: number;
}

interface Props {
  title: string;
  subtitle?: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  tabs: ListPageTab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  tabsRight?: React.ReactNode;
}

export default function ListPageHeader({
  title,
  subtitle,
  search,
  onSearchChange,
  searchPlaceholder = "ค้นหา...",
  tabs,
  activeTab,
  onTabChange,
  tabsRight,
}: Props) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = activeRef.current;
    const container = tabsRef.current;
    if (!el || !container) return;
    const elCenter = el.offsetLeft + el.offsetWidth / 2;
    const target = elCenter - container.clientWidth / 2;
    const max = container.scrollWidth - container.clientWidth;
    container.scrollTo({ left: Math.max(0, Math.min(max, target)), behavior: "smooth" });
  }, [activeTab]);

  return (
    <Header title={title} subtitle={subtitle}>
      {/* Search */}
      <div className="px-5 pb-3">
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-11 pl-11 pr-4 rounded-full border border-white/30 bg-white/30 backdrop-blur-sm text-sm text-gray-800 placeholder-gray-500 focus:outline-none focus:bg-white/60 focus:border-white/60 transition-all"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center px-5">
      <div ref={tabsRef} className="flex-1 flex gap-1 overflow-x-auto overflow-y-hidden scrollbar-hide overscroll-x-contain touch-pan-x">
        {tabs.map((t) => (
          <button
            key={t.key}
            ref={activeTab === t.key ? activeRef : undefined}
            onClick={() => onTabChange(t.key)}
            className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0 ${
              activeTab === t.key ? "text-active border-active" : "text-gray-500 border-transparent hover:text-gray-700"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1 text-xs text-gray-400 normal-case">{t.count}</span>
            )}
          </button>
        ))}
      </div>
      {tabsRight && <div className="shrink-0 ml-2">{tabsRight}</div>}
      </div>
    </Header>
  );
}
