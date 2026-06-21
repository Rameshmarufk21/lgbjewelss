"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Plus,
  Receipt,
  FileBarChart2,
  ChevronRight,
  History,
  Download,
  Home,
  Wrench,
  CreditCard,
  FileText,
  Settings,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { exportOrdersExcel } from "@/lib/client/exportOrdersExcel";

type NavItem = {
  icon: LucideIcon;
  label: string;
  href?: string;
  /** Opens the orders iframe new-order modal (same as the + FAB). */
  openNewOrder?: boolean;
  /** Opens memo creation in the orders iframe (pick order or new + memo). */
  openMemo?: boolean;
  /** Downloads Excel workbook from local orders. */
  exportExcel?: boolean;
  /** Items that aren't wired yet — rendered as muted/disabled buttons (no "soon" badge). */
  disabled?: boolean;
};

type NavSection = {
  section: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    section: "Menu",
    items: [
      { icon: Home, label: "Home", href: "/" },
      { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
      { icon: MessageCircle, label: "Chat", href: "/chat" },
      { icon: Plus, label: "New Order", openNewOrder: true },
      { icon: FileText, label: "Memo", openMemo: true },
      { icon: Receipt, label: "Statement", href: "/statements" },
      { icon: CreditCard, label: "Payment", href: "/payment" },
      { icon: FileBarChart2, label: "Reports", href: "/reports" },
      { icon: Wrench, label: "Fixing", disabled: true },
      { icon: History, label: "History", href: "/history" },
      { icon: Download, label: "Export", href: "/export" },
      { icon: Settings, label: "Settings", href: "/settings" },
    ],
  },
];

function isActive(pathname: string, href: string | undefined): boolean {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

const STORAGE_KEY = "lgb:sidebar-collapsed";

function postToHomeIframe(message: { type: string }) {
  const iframe = document.querySelector<HTMLIFrameElement>("iframe.lgb-home-iframe");
  iframe?.contentWindow?.postMessage(message, window.location.origin);
}

export function Sidebar() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const seen = Number(window.localStorage.getItem("lgb_chat_seen") || "0") || 0;
        const res = await fetch(`/api/chat/unread?since=${seen}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        if (active) setChatUnread(data.count || 0);
      } catch {
        /* offline — ignore */
      }
    };
    void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 12000);
    const onSeen = () => void refresh();
    window.addEventListener("lgb:chat-seen", onSeen);
    return () => {
      active = false;
      clearInterval(id);
      window.removeEventListener("lgb:chat-seen", onSeen);
    };
  }, [pathname]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      // ignore — localStorage may be unavailable
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onOpen = () => setMobileOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("lgb:sidebar-open", onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("lgb:sidebar-open", onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const toggle = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setMobileOpen(false);
      return;
    }
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleNewOrder = () => {
    setMobileOpen(false);
    if (pathname === "/") {
      postToHomeIframe({ type: "lgb-open-new-order" });
      return;
    }
    router.push("/?action=new");
  };

  const handleMemo = () => {
    setMobileOpen(false);
    if (pathname === "/") {
      postToHomeIframe({ type: "lgb-open-memo-create" });
      return;
    }
    router.push("/?action=memo");
  };

  const handleExport = async () => {
    setMobileOpen(false);
    if (exporting) return;
    setExporting(true);
    try {
      await exportOrdersExcel();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const className =
    "lgb-sidebar" +
    (collapsed ? " is-collapsed" : "") +
    (mobileOpen ? " is-mobile-open" : "") +
    (hydrated ? "" : " is-prehydrate");

  return (
    <>
      {mobileOpen && (
        <div
          className="lgb-sidebar-backdrop"
          aria-hidden
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={className} aria-label="Primary navigation">
        <button
          type="button"
          className="lgb-sidebar-logo"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen size={22} strokeWidth={2} className="lgb-sidebar-toggle-icon" />
          ) : (
            <PanelLeftClose size={22} strokeWidth={2} className="lgb-sidebar-toggle-icon" />
          )}
        </button>

        <nav className="lgb-sidebar-nav">
          {sections.map((section) => (
            <div key={section.section} className="lgb-sidebar-section">
              <div className="lgb-sidebar-section-label">{section.section}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const active =
                  !item.openNewOrder && !item.openMemo && isActive(pathname, item.href);
                const itemClassName =
                  "lgb-sidebar-item" +
                  (active ? " is-active" : "") +
                  (item.disabled ? " is-disabled" : "") +
                  (item.exportExcel && exporting ? " is-busy" : "");

                const inner = (
                  <>
                    <span className="lgb-sidebar-item-left">
                      <Icon
                        size={collapsed ? 22 : 20}
                        strokeWidth={2}
                        className="lgb-sidebar-item-icon"
                      />
                      <span className="lgb-sidebar-item-label">{item.label}</span>
                    </span>
                    {item.href === "/chat" && chatUnread > 0 ? (
                      <span className="lgb-sidebar-badge">{chatUnread}</span>
                    ) : (
                      <ChevronRight size={14} strokeWidth={2} className="lgb-sidebar-item-chev" />
                    )}
                  </>
                );

                if (item.openNewOrder) {
                  return (
                    <button
                      key={item.label}
                      type="button"
                      className={itemClassName}
                      onClick={handleNewOrder}
                      title={collapsed ? item.label : undefined}
                    >
                      {inner}
                    </button>
                  );
                }

                if (item.openMemo) {
                  return (
                    <button
                      key={item.label}
                      type="button"
                      className={itemClassName}
                      onClick={handleMemo}
                      title={collapsed ? item.label : undefined}
                    >
                      {inner}
                    </button>
                  );
                }

                if (item.exportExcel) {
                  return (
                    <button
                      key={item.label}
                      type="button"
                      className={itemClassName}
                      onClick={() => void handleExport()}
                      disabled={exporting}
                      title={collapsed ? item.label : undefined}
                    >
                      {inner}
                    </button>
                  );
                }

                if (item.disabled || !item.href) {
                  return (
                    <button
                      key={item.label}
                      type="button"
                      className={itemClassName}
                      aria-disabled
                      title={collapsed ? item.label : undefined}
                    >
                      {inner}
                    </button>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={itemClassName}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
