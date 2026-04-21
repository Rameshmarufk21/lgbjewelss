"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** In-nav search for `/` — syncs `?q=` for the home experience. */
export function NavOrdersSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const urlQ = sp.get("q") ?? "";
  const [val, setVal] = useState(urlQ);

  useEffect(() => {
    setVal(urlQ);
  }, [urlQ]);

  useEffect(() => {
    if (pathname !== "/") return;
    const t = setTimeout(() => {
      const next = val.trim();
      const cur = urlQ.trim();
      if (next === cur) return;
      router.replace(next ? `/?q=${encodeURIComponent(next)}` : "/", { scroll: false });
    }, 280);
    return () => clearTimeout(t);
  }, [val, urlQ, router, pathname]);

  if (pathname !== "/") return null;

  return (
    <div className="nav-search">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Search orders, style codes, clients…"
        aria-label="Search orders"
      />
    </div>
  );
}
