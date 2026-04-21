import { Suspense } from "react";
import { HomeIframe } from "@/components/HomeIframe";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div
          className="lgb-home-iframe-fallback"
          style={{
            minHeight: "calc(100vh - 76px - env(safe-area-inset-bottom, 0px))",
            borderRadius: 12,
            background: "var(--cream2)",
            border: "1px dashed var(--border)",
          }}
          aria-hidden
        />
      }
    >
      <HomeIframe />
    </Suspense>
  );
}
