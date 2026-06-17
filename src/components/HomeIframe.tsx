"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

const IFRAME_SRC = "/orders-app/index.html";

export function HomeIframe() {
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const action = sp.get("action");
  const ref = useRef<HTMLIFrameElement>(null);

  const postToIframe = useCallback((payload: { type: string; q?: string }) => {
    const win = ref.current?.contentWindow;
    if (!win) return;
    win.postMessage(payload, window.location.origin);
  }, []);

  const postSearch = useCallback(() => {
    postToIframe({ type: "lgb-set-search", q });
  }, [postToIframe, q]);

  const postOpenNewOrder = useCallback(() => {
    postToIframe({ type: "lgb-open-new-order" });
  }, [postToIframe]);

  const postOpenMemoCreate = useCallback(() => {
    postToIframe({ type: "lgb-open-memo-create" });
  }, [postToIframe]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onLoad = () => {
      postSearch();
      if (action === "new") postOpenNewOrder();
      if (action === "memo") postOpenMemoCreate();
    };
    el.addEventListener("load", onLoad);
    if (el.contentDocument?.readyState === "complete") onLoad();
    return () => el.removeEventListener("load", onLoad);
  }, [postSearch, postOpenNewOrder, postOpenMemoCreate, action]);

  useEffect(() => {
    if (action === "new") postOpenNewOrder();
    if (action === "memo") postOpenMemoCreate();
  }, [action, postOpenNewOrder, postOpenMemoCreate]);

  return (
    <iframe
      ref={ref}
      src={IFRAME_SRC}
      title="LabGrownBox Main"
      className="lgb-home-iframe"
      style={{
        width: "100%",
        height: "calc(100dvh - 62px)",
        minHeight: 360,
        border: "none",
        background: "transparent",
        display: "block",
      }}
    />
  );
}
