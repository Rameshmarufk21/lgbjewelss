"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

const IFRAME_SRC = "/orders-app/index.html";

export function HomeIframe() {
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const ref = useRef<HTMLIFrameElement>(null);

  const postSearch = useCallback(() => {
    const win = ref.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: "lgb-set-search", q }, window.location.origin);
  }, [q]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("load", postSearch);
    if (el.contentDocument?.readyState === "complete") postSearch();
    return () => el.removeEventListener("load", postSearch);
  }, [postSearch]);

  return (
    <iframe
      ref={ref}
      src={IFRAME_SRC}
      title="LabGrownBox Main"
      className="lgb-home-iframe"
      style={{
        width: "100%",
        height: "calc(100vh - 76px - env(safe-area-inset-bottom, 0px))",
        minHeight: 360,
        border: "none",
        borderRadius: 12,
        background: "transparent",
        display: "block",
      }}
    />
  );
}
