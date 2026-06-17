"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { NavOrdersSearch } from "@/components/NavOrdersSearch";
import { NavAccount } from "@/components/NavAccount";
import { Menu } from "lucide-react";

function IconStatements() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h6" />
    </svg>
  );
}

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

function IconHistory() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v5h5" />
      <path d="M3.05 13a9 9 0 1 0 .55-3" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function AppNav() {
  const pathname = usePathname();

  const navIcon = (
    href: string,
    label: string,
    active: boolean,
    children: React.ReactNode,
    extraClass = "",
  ) => (
    <Link
      href={href}
      className={`nav-icon${active ? " active" : ""}${extraClass ? ` ${extraClass}` : ""}`}
      aria-label={label}
    >
      {children}
    </Link>
  );

  const openDrawer = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("lgb:sidebar-open"));
  };

  const showSearch = pathname === "/";

  return (
    <header className="nav">
      <div className="nav-start">
        <button
          type="button"
          className="nav-mobile-toggle"
          onClick={openDrawer}
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <Link href="/" className="nav-logo" aria-label="LabGrownBox home" title="LabGrownBox">
          {/* eslint-disable-next-line @next/next/no-img-element -- public asset; avoids Image config issues */}
          <img
            src="/lgb/nav-logo.png"
            alt="LabGrownBox"
            width={36}
            height={36}
            className="nav-logo-img"
          />
        </Link>
      </div>

      <div className="nav-center">
        {showSearch ? (
          <Suspense fallback={<div className="nav-search" style={{ opacity: 0.35 }} aria-hidden />}>
            <NavOrdersSearch />
          </Suspense>
        ) : (
          <div className="nav-search-spacer" aria-hidden />
        )}
      </div>

      <div className="nav-end">
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
          "nav-icon-dashboard",
        )}
        {navIcon(
          "/history",
          "Open history",
          pathname === "/history" || pathname.startsWith("/history/"),
          <IconHistory />,
        )}
        <NavAccount />
      </div>
    </header>
  );
}
