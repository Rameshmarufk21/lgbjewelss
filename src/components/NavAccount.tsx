"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, User } from "lucide-react";
import { DEFAULT_PROFILE, loadProfile } from "@/lib/client/profile";

export function NavAccount() {
  const pathname = usePathname();
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(DEFAULT_PROFILE.name);
  const [authDisabled, setAuthDisabled] = useState(true);
  const [signedIn, setSignedIn] = useState(true);

  useEffect(() => {
    setDisplayName(loadProfile().name || DEFAULT_PROFILE.name);

    const onProfile = () => setDisplayName(loadProfile().name || DEFAULT_PROFILE.name);
    window.addEventListener("lgb:profile-updated", onProfile);
    return () => window.removeEventListener("lgb:profile-updated", onProfile);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = (await res.json()) as {
          ok?: boolean;
          userId?: string;
          authDisabled?: boolean;
        };
        if (data.authDisabled) {
          setAuthDisabled(true);
          setSignedIn(true);
          return;
        }
        setAuthDisabled(false);
        setSignedIn(res.ok && !!data.userId);
        if (data.userId) setDisplayName(data.userId);
      } catch {
        setSignedIn(false);
      }
    })();
  }, [pathname]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = displayName.charAt(0).toUpperCase() || "M";

  async function logout() {
    setOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    if (authDisabled) {
      router.push("/");
      router.refresh();
      return;
    }
    router.push("/login");
    router.refresh();
  }

  if (!authDisabled && !signedIn) {
    return (
      <Link href="/login" className="nav-account" aria-label="Sign in">
        <span className="nav-account-avatar" aria-hidden>
          ?
        </span>
        <span className="nav-account-name">Sign in</span>
      </Link>
    );
  }

  return (
    <div className="nav-account-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`nav-account${open ? " is-open" : ""}`}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="nav-account-avatar" aria-hidden>
          {initial}
        </span>
        <span className="nav-account-name">{displayName}</span>
        <ChevronDown size={14} className="nav-account-chev" aria-hidden />
      </button>
      {open ? (
        <div className="nav-account-menu" role="menu">
          <Link
            href="/profile"
            className="nav-account-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <User size={16} strokeWidth={2} />
            Profile
          </Link>
          <button type="button" className="nav-account-menu-item" role="menuitem" onClick={() => void logout()}>
            <LogOut size={16} strokeWidth={2} />
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}
