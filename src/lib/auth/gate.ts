import { adminReachable } from "@/lib/demo";
import { getBindings } from "@/lib/leads/bindings";
import { appUrl } from "@/lib/site";

// The rules the proxy and the server share for our own sign-in (docs/sign-in.md, sections 4 and 7). No server-only imports: the proxy uses them.

// Who is let in. `access`: the Cloudflare Access token only, as before our sign-in. `both`: the Access token, and a session of ours, where
// there is one, must be the same person. `own`: our session only. Anything else, unset included, is `access`, so a typo fails closed.
export type SignInMode = "access" | "both" | "own";
export const signInMode = (v: string | undefined = process.env.SIGN_IN): SignInMode => (v === "both" || v === "own" ? v : "access");

// The open app (next dev, the E2E run's NEXT_PUBLIC_ADMIN_OPEN build): one fixed person, never with a real directory bound. E2E_SIGN_IN=1
// is the E2E run's closed server (playwright.config.ts): it can only turn the shortcut off, never on.
export const appOpen = () => adminReachable() && !getBindings().DIRECTORY && process.env.E2E_SIGN_IN !== "1";

export const SESSION_COOKIE = "__Host-cw_session";
export const SESSION_VALUE = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url: anything else is not one of ours
// The page's path and query, set by the proxy (overwriting any the browser sent), so a layout can say where to come back to after sign-in.
export const PATH_HEADER = "x-cw-path";

// Where to go after signing in: one rule, used everywhere (the sign-in redirect, a notification's link). A path on this site only: a single
// leading "/", no "\", letters, digits, "-", "_", "/" and "." in the path, no "//" and no "." or ".." segment, the query read and written
// again. Anything else is the overview.
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || raw.startsWith("//") || raw.includes("\\")) return "/";
  const q = raw.indexOf("?");
  const path = q < 0 ? raw : raw.slice(0, q);
  if (!/^\/[A-Za-z0-9\-_/.]*$/.test(path)) return "/";
  if (path.includes("//") || /(^|\/)\.\.?(\/|$)/.test(path)) return "/"; // a browser resolves "/a/..//x" to "//x", another site
  const query = q < 0 ? "" : new URLSearchParams(raw.slice(q + 1).split("#")[0]).toString();
  return query ? `${path}?${query}` : path;
}
export const signInPath = (next: unknown) => `/sign-in?next=${encodeURIComponent(safeNext(next))}`;

// A POST that can act without a session, or that a route handler takes (Next checks no Origin there), must come from this app's own pages:
// Origin present and equal to APP_URL's. Next lets a POST with no Origin through, and the other checkwork.ie sites are the same site.
export function sameOrigin(req: Request, app: string = appUrl()): boolean {
  const origin = req.headers.get("origin");
  return Boolean(origin) && origin === new URL(app).origin; // "null" and anything malformed never equal a real origin
}
