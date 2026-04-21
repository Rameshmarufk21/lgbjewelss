"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { NavOrdersSearch } from "@/components/NavOrdersSearch";

/** Statements — document / invoice */
function IconStatements() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  );
}

/** Dashboard — asymmetric tile layout (previous nav icon) */
function IconDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

/** Settings — classic gear (previous nav icon) */
function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function AppNav() {
  const pathname = usePathname();

  const navIcon = (href: string, label: string, active: boolean, children: React.ReactNode) => (
    <Link href={href} className={`nav-icon${active ? " active" : ""}`} aria-label={label}>
      {children}
    </Link>
  );

  return (
    <header className="nav">
      <Link href="/" className="nav-logo">
        {/* eslint-disable-next-line @next/next/no-img-element -- public asset; avoids Image config issues */}
        <img src="/lgb/nav-logo.png" alt="" width={40} height={40} className="nav-logo-img" />
        <div className="nav-logo-text">
          <span className="nav-logo-name">LABGROWNBOX</span>
          <span className="nav-logo-tag">Lab Grown Diamonds · Now and Forever</span>
        </div>
      </Link>
      {pathname === "/" ? (
        <Suspense fallback={<div className="nav-search" style={{ opacity: 0.35 }} aria-hidden />}>
          <NavOrdersSearch />
        </Suspense>
      ) : (
        <div className="nav-search-spacer" aria-hidden />
      )}
      <div className="nav-right">
        {navIcon(
          "/statements",
          "Open statements",
          pathname === "/statements" || pathname.startsWith("/statements/"),
          <IconStatements />,
        )}
        {navIcon(
          "/dashboard",
          "Open dashboard",
          pathname === "/dashboard" || pathname.startsWith("/dashboard/"),
          <IconDashboard />,
        )}
        {navIcon(
          "/settings",
          "Open settings",
          pathname === "/settings" || pathname.startsWith("/settings/"),
          <IconSettings />,
        )}
        <Link href="/orders/new" className="btn-new-nav">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Order
        </Link>
      </div>
    </header>
  );
}
