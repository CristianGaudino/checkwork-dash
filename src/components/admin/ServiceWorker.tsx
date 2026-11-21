"use client";

import { useEffect } from "react";

// The service worker (public/sw.js). Registering again gives the same one, so the Settings panel calls this too, in dev as well.
export const registerSw = () => navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });

// Registers public/sw.js (the offline screen and push notifications, #11). In a build only: next dev's hot reload is left alone.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) registerSw().catch(() => {});
  }, []);
  return null;
}
