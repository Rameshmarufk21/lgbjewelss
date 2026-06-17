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
