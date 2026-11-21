import { SITE_SLUG, isDemoSite } from "@/lib/site";

// The demo bar: the role, stock and plan switches and the theme toggle, fixed at the foot of every page. Off with NEXT_PUBLIC_DEMO_BAR=off (a real client site has none).
export const DEMO_BAR_ENABLED = process.env.NEXT_PUBLIC_DEMO_BAR !== "off";

// The dealer area holds the stock editor and real leads. It is open only in `next dev` and when the build sets NEXT_PUBLIC_ADMIN_OPEN=1
// (skips protection: only for CI and the E2E run). Every other build is closed unless the request carries a valid Cloudflare Access token,
// which the proxy checks (src/lib/access.ts). Closed by default, so a build that misses a setting never opens a dealer's data.
export const adminReachable = (nodeEnv: string | undefined = process.env.NODE_ENV, open: string | undefined = process.env.NEXT_PUBLIC_ADMIN_OPEN) => nodeEnv === "development" || open === "1";

// Whether the demo bar's cookies (the role, the stock version) count: on the demo deploy and where the dashboard is open. A client site
// (APP_ENV=production) or a build with no APP_ENV never lets a cookie grant a role (src/lib/permissions.ts, src/lib/stock-source.ts).
export const demoCookiesCount = () => DEMO_BAR_ENABLED && (isDemoSite() || adminReachable());

export const THEME_KEY = `${SITE_SLUG}:theme`;
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

// Runs before first paint (inline in <head>) so a stored dark choice never flashes light. Storage can throw, so it is wrapped.
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
