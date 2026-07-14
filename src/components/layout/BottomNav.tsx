"use client";
import { DownloadIcon } from "@/components/ui/icons";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useActiveRoles, useMe, hasRole, Role } from "@/lib/roles";

type HoverInfo = { label: string; href: string; top: number };

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: Role[];
  desktopOnly?: boolean;
  group?: "seeker";
};

const navItems: NavItem[] = [
  {
    href: "/seeker",
    label: "Seeker",
    roles: ["leadsseeker"],
    group: "seeker",
    icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>,
  },
  {
    href: "/seeker/dashboard",
    label: "Insights",
    roles: ["leadsseeker"],
    group: "seeker",
    icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
  },
  {
    href: "/seeker/map",
    label: "Seeker Map",
    roles: ["leadsseeker"],
    desktopOnly: true,
    group: "seeker",
    icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m0-8.25l-4.5-2.25v10.5L9 17.25m0-10.5l6 3m0 6.75l4.5 2.25V8.25L15 6m0 10.5V6m0 0l-6-3" /></svg>,
  },
  {
    href: "/today",
    label: "Today",
    roles: ["admin", "account", "sales", "solar"],
    icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
  },
  {
    href: "/pipeline",
    label: "Pipeline",
    icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg>,
  },
  {
    href: "/report/pending",
    label: "Pending",
    roles: ["admin", "account"],
    icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    href: "/packages",
    label: "Packages",
    roles: ["admin", "sales", "solar", "leadsseeker"],
    icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>,
  },
  {
    href: "/profile",
    label: "Me",
    icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
];

type BottomNavProps = {
  collapsed?: boolean;
  onToggle?: () => void;
};

export default function BottomNav({ collapsed = false, onToggle }: BottomNavProps = {}) {
  const pathname = usePathname();
  const { activeRoles } = useActiveRoles();
  const { me } = useMe();
  // Floating hover label — only shown when collapsed. position: fixed so it
  // escapes the nav's overflow-y-auto (which CSS-clips both axes).
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const hideTimer = useRef<number | null>(null);
  const showHover = (e: React.MouseEvent<HTMLElement>, label: string, href: string) => {
    if (!collapsed) return;
    if (hideTimer.current) { window.clearTimeout(hideTimer.current); hideTimer.current = null; }
    const rect = e.currentTarget.getBoundingClientRect();
    setHover({ label, href, top: rect.top + rect.height / 2 });
  };
  const scheduleHide = () => {
    if (!collapsed) return;
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHover(null), 120);
  };
  const cancelHide = () => {
    if (hideTimer.current) { window.clearTimeout(hideTimer.current); hideTimer.current = null; }
  };
  const seekerMode = activeRoles.includes("leadsseeker") && !activeRoles.includes("sales") && !activeRoles.includes("solar");
  const showAdminGroups = !seekerMode && hasRole(activeRoles, "admin", "sales", "solar", "account");
  const visibleItems = navItems.filter((item) => {
    if (seekerMode) return item.href === "/seeker" || item.href === "/seeker/dashboard" || item.href === "/seeker/map" || item.href === "/packages" || item.href === "/profile";
    return !item.roles || hasRole(activeRoles, ...item.roles);
  });
  // Admin mobile nav is a curated 4-item bar — same icons we show in the
  // desktop "Settings" admin group, surfaced as primary nav on phone since
  // admin's day is mostly user/payment/settings ops, not pipeline browsing.
  const isAdminActive = hasRole(activeRoles, "admin");
  const adminMobileItems: NavItem[] = isAdminActive ? [
    {
      href: "/pipeline",
      label: "Pipeline",
      icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg>,
    },
    {
      href: "/app-users",
      label: "App Users",
      icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
    },
    {
      href: "/settings",
      label: "Settings",
      icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
    {
      href: "/profile",
      label: "Me",
      icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    },
  ] : [];
  const visibleMobile = isAdminActive ? adminMobileItems : visibleItems.filter((i) => !i.desktopOnly);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 bg-white border-t border-gray-200 z-50 md:hidden">
        <div className="flex justify-around items-center h-20">
          {visibleMobile.map((item) => {
            const isActive =
              item.href === "/seeker" ? pathname === "/seeker" :
              item.href === "/report" ? pathname === "/report" :
              pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className={`flex flex-col items-center justify-center w-full h-full gap-0.5 transition-colors ${isActive ? "text-primary" : "text-gray"}`}>
                {item.icon}
                <span className="text-xs font-semibold uppercase tracking-wider">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      <aside className={`hidden md:flex fixed left-0 top-0 bottom-0 bg-white border-r border-gray-200 flex-col z-50 transition-[width] duration-200 ${collapsed ? "w-14" : "w-56"}`}>
        <div className={`h-16 border-b border-gray-100 bg-white flex items-center ${collapsed ? "justify-center px-2" : "justify-between px-3"}`}>
          {!collapsed && (
            <img
              src="https://senasolarenergy.com/wp-content/uploads/2022/04/logo_senasolarenergy.png"
              alt="Sena Solar Energy"
              className="h-8 w-auto pl-2"
            />
          )}
          <button
            type="button"
            onClick={onToggle}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        </div>
        <nav className={`flex-1 min-h-0 overflow-y-auto py-2 space-y-0.5 ${collapsed ? "px-1.5" : "px-3"}`}>
          {visibleItems.map((item, idx) => {
            const isActive =
              item.href === "/packages" ? pathname === "/packages" :
              item.href === "/seeker" ? pathname === "/seeker" :
              item.href === "/report" ? pathname === "/report" :
              pathname.startsWith(item.href);
            const prev = visibleItems[idx - 1];
            const showDivider = prev && prev.group === "seeker" && item.group !== "seeker";
            return (
              <div key={item.href}>
                {showDivider && <div className="my-1.5 border-t border-gray-100" />}
                <Link href={item.href}
                  onMouseEnter={(e) => showHover(e, item.label, item.href)}
                  onMouseLeave={scheduleHide}
                  className={`flex items-center rounded-lg text-xs font-semibold uppercase transition-colors ${collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-1.5"} ${isActive ? "bg-primary/10 text-primary" : "text-gray hover:bg-gray-50"}`}>
                  {item.icon}
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </div>
            );
          })}
          {showAdminGroups && <AdminGroups pathname={pathname} activeRoles={activeRoles} username={me?.username ?? null} collapsed={collapsed} onHover={showHover} onHoverEnd={scheduleHide} />}
        </nav>
      </aside>
      {collapsed && hover && (
        <Link
          href={hover.href}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          onClick={() => setHover(null)}
          className="hidden md:inline-flex fixed items-center -translate-y-1/2 px-3 py-1.5 rounded-md bg-gray-900 text-white text-xs font-semibold uppercase tracking-wider shadow-lg z-[60] whitespace-nowrap hover:bg-gray-700 transition-colors"
          style={{ left: 56, top: hover.top }}
        >
          {hover.label}
        </Link>
      )}
    </>
  );
}

type AdminLink = { href: string; label: string; icon: React.ReactNode; roles?: Role[]; userOnly?: string[] };

// roles: undefined → admin only. Listed roles widen the visibility.
const ADMIN_GROUPS: { title: string; links: AdminLink[] }[] = [
  {
    title: "Reports",
    links: [
      {
        href: "/dashboard",
        label: "Dashboard I",
        roles: ["admin", "sales", "solar", "account"],
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
      },
      {
        href: "/dashboard-dev",
        label: "Dashboard II",
        roles: ["admin", "sales", "solar", "account"],
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
      },
      {
        href: "/lifecycle",
        label: "Lead Tracking",
        roles: ["admin", "sales", "solar", "account"],
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      },
      {
        href: "/calendar",
        label: "Calendar",
        roles: ["admin", "sales", "solar", "account", "leadsseeker"],
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
      },
      {
        href: "/export",
        label: "Export",
        roles: ["admin", "sales", "solar"],
        icon: <DownloadIcon className="w-6 h-6" strokeWidth={2} />,
      },
    ],
  },
  {
    title: "Accounting",
    links: [
      {
        href: "/report",
        label: "Report",
        roles: ["admin", "sales", "solar", "account"],
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
      },
      {
        href: "/report/pending",
        label: "Pending Approval",
        roles: ["admin", "account"],
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      },
    ],
  },
  {
    title: "Settings",
    links: [
      {
        href: "/packages/manage",
        label: "Packages",
        roles: ["admin", "sales", "solar"],
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>,
      },
      {
        href: "/app-users",
        label: "App Users",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
      },
      {
        href: "/line-users",
        label: "LINE Users",
        roles: ["admin", "sales", "solar"],
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>,
      },
      {
        href: "/payment-setup",
        label: "Payment",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>,
      },
      {
        href: "/settings",
        label: "Settings",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
      },
    ],
  },
];

// Groups whose section header can be clicked to collapse the link list.
// "Settings" stays always-open since it's the catch-all admin area.
const COLLAPSIBLE_GROUPS = new Set(["Reports", "Accounting"]);

function AdminGroups({ pathname, activeRoles, username, collapsed, onHover, onHoverEnd }: { pathname: string; activeRoles: Role[]; username: string | null; collapsed?: boolean; onHover: (e: React.MouseEvent<HTMLElement>, label: string, href: string) => void; onHoverEnd: () => void }) {
  const isAdmin = hasRole(activeRoles, "admin");
  // Persisted per-group collapse state. Key = group title.
  const [foldedGroups, setFoldedGroups] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("admin_nav_folded");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setFoldedGroups(new Set(arr.filter((x): x is string => typeof x === "string")));
      }
    } catch { /* ignore */ }
  }, []);
  const toggleGroup = (title: string) => {
    setFoldedGroups(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      if (typeof window !== "undefined") {
        localStorage.setItem("admin_nav_folded", JSON.stringify(Array.from(next)));
      }
      return next;
    });
  };
  return (
    <>
      {ADMIN_GROUPS.map((g, i) => {
        const links = g.links.filter((l) => {
          if (l.userOnly) return !!username && l.userOnly.includes(username);
          return isAdmin || (l.roles && hasRole(activeRoles, ...l.roles));
        });
        if (links.length === 0) return null;
        const canCollapse = !collapsed && COLLAPSIBLE_GROUPS.has(g.title);
        const folded = canCollapse && foldedGroups.has(g.title);
        return (
          <div key={g.title} className={i === 0 ? "pt-2 mt-2 border-t border-gray-100" : "pt-2 mt-2"}>
            {!collapsed && (
              canCollapse ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(g.title)}
                  className="w-full flex items-center justify-between px-3 pb-0.5 text-xxs font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors"
                  aria-expanded={!folded}
                >
                  <span>{g.title}</span>
                  <svg className={`w-3 h-3 transition-transform ${folded ? "" : "rotate-90"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <div className="px-3 pb-0.5 text-xxs font-bold uppercase tracking-widest text-gray-400">{g.title}</div>
              )
            )}
            {!folded && links.map(l => {
              const active =
                l.href === "/packages/manage" ? pathname.startsWith("/packages/manage") :
                l.href === "/report" ? pathname === "/report" :
                // /dashboard-dev shares the "/dashboard" prefix, so a plain
                // startsWith would highlight both links when the user is on
                // the dev one. Force exact match for /dashboard so each link
                // only lights up for its own route.
                l.href === "/dashboard" ? pathname === "/dashboard" :
                l.href === "/dashboard-dev" ? pathname === "/dashboard-dev" :
                pathname.startsWith(l.href);
              return (
                <Link key={l.href} href={l.href}
                  onMouseEnter={(e) => onHover(e, l.label, l.href)}
                  onMouseLeave={onHoverEnd}
                  className={`flex items-center rounded-lg text-xs font-semibold uppercase transition-colors ${collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-1.5"} ${active ? "bg-primary/10 text-primary" : "text-gray hover:bg-gray-50"}`}>
                  {l.icon}
                  {!collapsed && <span>{l.label}</span>}
                </Link>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
