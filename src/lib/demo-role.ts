"use client";

import { useSyncExternalStore } from "react";
import { ROLE_COOKIE, parseRole, type Role } from "@/lib/permission-rules";
import { STOCK_COOKIE, type StockSource } from "@/lib/stock-source-rules";

// The demo bar's switches, remembered in this browser as cookies the server reads: the dealer's role (what they may see), where the stock
// comes from. The server counts them for a demo dealer only (src/lib/tenancy/current.ts, demoCookie); each switch
// refreshes the page, which brings back what the server made of it.
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => (listeners.add(cb), () => void listeners.delete(cb));
const set = (name: string, value: string) => {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
  notify();
};

// The dealer role the demo acts as (src/lib/permissions.ts).
const roleValue = () => parseRole(document.cookie.split("; ").find((c) => c.startsWith(`${ROLE_COOKIE}=`))?.slice(ROLE_COOKIE.length + 1));
export const setDealerRole = (role: Role) => set(ROLE_COOKIE, role);
export const useDealerRole = () => useSyncExternalStore(subscribe, roleValue, () => parseRole(undefined));

// The demo's stock switch: our own uploader, or stock synced from a listing site (src/lib/stock-source.ts).
export const setDemoStockSource = (source: StockSource) => set(STOCK_COOKIE, source);
