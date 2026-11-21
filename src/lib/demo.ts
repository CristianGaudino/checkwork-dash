import { SITE_SLUG } from "@/lib/site";

// The demo bar, fixed at the foot of every page: the theme toggle for everyone, and the role, stock and plan switches for a demo dealer
// only (the directory's demo flag; their cookies count nowhere else, src/lib/tenancy/current.ts demoCookie).

// The dealer area holds the stock editor and real leads. It is open only in `next dev` and when the build sets NEXT_PUBLIC_ADMIN_OPEN=1
// (skips protection: only for CI and the E2E run). Every other build is closed unless the request carries a valid Cloudflare Access token,
// which the proxy checks (src/lib/access.ts). Closed by default, so a build that misses a setting never opens a dealer's data.
export const adminReachable = (nodeEnv: string | undefined = process.env.NODE_ENV, open: string | undefined = process.env.NEXT_PUBLIC_ADMIN_OPEN) => nodeEnv === "development" || open === "1";

export const THEME_KEY = `${SITE_SLUG}:theme`;
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

// Runs before first paint (inline in <head>) so a stored dark choice never flashes light. Storage can throw, so it is wrapped.
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
