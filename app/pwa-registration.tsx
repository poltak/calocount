"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    const isLocalhost =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!("serviceWorker" in navigator) || (!window.isSecureContext && !isLocalhost)) return;

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);

  return null;
}
