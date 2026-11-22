import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { accessConfig, verifyAccessJwt } from "@/lib/access";
import { PATH_HEADER, SESSION_COOKIE, SESSION_VALUE, appOpen, signInMode, signInPath } from "@/lib/auth/gate";

// The request's headers without PATH_HEADER: only the proxy ever writes it, so a copy the browser sent never reaches the app.
const withoutPath = (req: NextRequest) => {
  const h = new Headers(req.headers);
  h.delete(PATH_HEADER);
  return h;
};
// The app's own not found page, not a bare line. A path no route matches renders app/not-found.tsx.
const notThere = (req: NextRequest) => NextResponse.rewrite(new URL("/not-found-closed-area", req.url), { status: 404, headers: { "X-Robots-Tag": "noindex" }, request: { headers: withoutPath(req) } });
// Our sign-in's pages and /sign-out check SIGN_IN themselves (signInOpen in src/lib/staff.ts): the proxy only strips PATH_HEADER there and
// gates nothing, so a signed-out visit to /sign-in is never sent to /sign-in again.
const SIGN_IN_PAGES = /^\/(sign-in(\/.*)?|sign-out)$/;
const isPageLoad = (req: NextRequest) => req.method === "GET" || req.method === "HEAD";
// The page's path and query, for the sign-in redirect's `next` (src/lib/staff.ts toSignIn).
const pathOf = (req: NextRequest) => {
  const q = new URLSearchParams(req.nextUrl.search);
  q.delete("_rsc"); // Next's own cache key on a client navigation, not part of the page
  return req.nextUrl.pathname + (q.size ? `?${q}` : "");
};
// Let the request through with the path in PATH_HEADER: set, never appended, so a copy the browser sent is overwritten. Empty on a POST (a
// server action), which is answered 404 when signed out, never redirected.
const pass = (req: NextRequest) => {
  const h = new Headers(req.headers);
  h.set(PATH_HEADER, isPageLoad(req) ? pathOf(req) : "");
  return NextResponse.next({ request: { headers: h } });
};

// The gate in front of every page, by SIGN_IN (src/lib/auth/gate.ts, docs/sign-in.md section 7): Cloudflare Access's token (`access`, the
// default and any unknown value, and `both`), or only that our session cookie is there (`own`). Nothing per dealer: which dealer, and what
// their plan has, is the server's (src/lib/tenancy): the root layout and each module's layout answer a module that is off
// (src/components/admin/PlanGate.tsx), and every action checks it again (requireModule). Proxy is not for data fetching (Next 16 docs), so
// it reads no directory and no session: the server checks the session (src/lib/staff.ts), and a dead one goes to sign in from dealerAccess.
export async function proxy(req: NextRequest) {
  if (SIGN_IN_PAGES.test(req.nextUrl.pathname)) return NextResponse.next({ request: { headers: withoutPath(req) } });
  // A closed area looks like a page that is not there. Server actions post to the page itself, so this covers them too.
  // Open in development and when the build says so, but never with a real directory bound (the Worker, where OpenNext gives the proxy the
  // bindings too). staffIdentity checks the same again.
  if (appOpen()) return pass(req);
  if (signInMode() === "own") {
    if (SESSION_VALUE.test(req.cookies.get(SESSION_COOKIE)?.value ?? "")) return pass(req); // its shape only: the server looks it up
    // A page load with no session goes to sign in and back; anything else (a server action) is not there.
    return isPageLoad(req) ? NextResponse.redirect(new URL(signInPath(pathOf(req)), req.url)) : notThere(req);
  }
  // `access` and `both`: only with a valid Cloudflare Access token (src/lib/access.ts).
  const cfg = accessConfig();
  const token = req.headers.get("cf-access-jwt-assertion");
  const who = cfg === null || !token ? null : await verifyAccessJwt(token, cfg);
  const verdict = cfg === null ? "not-configured" : !token ? "no-token" : who ? "open" : "rejected";
  // The pages and actions verify the token again themselves (src/lib/staff.ts): a server action can be posted to any page.
  if (verdict === "open") return pass(req);
  // Why it was closed, in the Worker's logs (never the token): "no-token" means Access did not cover this path, "rejected" means a token came
  // that did not verify (wrong audience, team domain or expired), "not-configured" means CF_ACCESS_TEAM_DOMAIN or CF_ACCESS_AUD is missing.
  console.warn(`dashboard gate closed: ${verdict}`);
  return notThere(req);
}

// Every page. Not the routes that check their own key (api: CRON_KEY, the owner token or a website key, /api/site; the photo and media
// routes) nor the static files (Next's own, the seeded car photos in public/stock/<id>/*.webp, and the brand files in public/). Only the photo
// files: the stock pages under /stock are gated like any other. Our sign-in's pages pass through ungated (SIGN_IN_PAGES above).
export const config = {
  matcher: ["/((?!api/|car-photos/|media-files/|_next/|stock/[^/]+/[^/]+\\.webp|brand/|brands/|icon\\.|favicon\\.ico).*)"],
};
