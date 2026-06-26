"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppFooter } from "@/components/AppFooter";
import { AppNav } from "@/components/AppNav";
import { Sidebar } from "@/components/Sidebar";

function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (pathname === "/login") {
      setReady(true);
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = (await res.json()) as { authDisabled?: boolean };
        if (data.authDisabled || res.ok) {
          setReady(true);
          return;
        }
        const next = encodeURIComponent(pathname || "/");
        router.replace(`/login?next=${next}`);
      } catch {
        router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
      }
    })();
  }, [pathname, router]);

  if (!ready && pathname !== "/login") {
    return <div className="login-page" aria-busy="true" />;
  }

  return <>{children}</>;
}

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (typeof window === "undefined") return;

    let active = true;

    async function syncDatabase() {
      try {
        const res = await fetch("/api/products/sync?_=" + Date.now(), {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok || !active) return;
        const data = (await res.json()) as { ok?: boolean; orders?: any[] };
        if (data.ok && Array.isArray(data.orders)) {
          const serverOrders = data.orders;

          const rawLocal = window.localStorage.getItem("lgb_orders");
          let localOrders: any[] = [];
          try {
            localOrders = rawLocal ? (JSON.parse(rawLocal) as any[]) : [];
          } catch {
            localOrders = [];
          }

          if (Array.isArray(localOrders)) {
            const serverMap = new Map(serverOrders.map((o: any) => [o.id, o]));
            const localMap = new Map(localOrders.map((o: any) => [o.id, o]));

            let changed = false;

            // 1. Remove deleted orders
            for (const localId of localMap.keys()) {
              if (localId && typeof localId === "string" && localId.startsWith("ORD-") && !serverMap.has(localId)) {
                localMap.delete(localId);
                changed = true;
              }
            }

            // 2. Add or update server orders
            for (const serverOrder of serverOrders) {
              const localOrder = localMap.get(serverOrder.id);
              if (!localOrder) {
                localMap.set(serverOrder.id, serverOrder);
                changed = true;
              } else {
                const merged = { ...localOrder, ...serverOrder };
                if (JSON.stringify(localOrder) !== JSON.stringify(merged)) {
                  localMap.set(serverOrder.id, merged);
                  changed = true;
                }
              }
            }

            if (changed) {
              const nextOrders = Array.from(localMap.values());
              window.localStorage.setItem("lgb_orders", JSON.stringify(nextOrders));
              window.dispatchEvent(new StorageEvent("storage", { key: "lgb_orders" }));
              window.dispatchEvent(new CustomEvent("lgb:orders-updated"));
            }
          } else {
            window.localStorage.setItem("lgb_orders", JSON.stringify(serverOrders));
            window.dispatchEvent(new StorageEvent("storage", { key: "lgb_orders" }));
            window.dispatchEvent(new CustomEvent("lgb:orders-updated"));
          }
        }
      } catch (err) {
        console.error("LayoutShell Sync Error:", err);
      }
    }

    void syncDatabase();
    const interval = setInterval(() => {
      void syncDatabase();
    }, 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <AuthGate>
      <>
        <div className="lgb-layout">
          <Sidebar />
          <div className="lgb-main-col">
            <AppNav />
            <main className="main">{children}</main>
            <AppFooter />
          </div>
        </div>
      </>
    </AuthGate>
  );
}
