import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { accessConfig, verifyAccessJwt } from "@/lib/access";
import { adminReachable, demoCookiesCount } from "@/lib/demo";
import { MODULES_COOKIE, moduleForPath, parseModules, pathAllowed } from "@/lib/modules-rules";

// The app's own not found page, not a bare line. A path no route matches renders app/not-found.tsx.
const notThere = (req: NextRequest) => NextResponse.rewrite(new URL("/not-found-closed-area", req.url), { status: 404, headers: { "X-Robots-Tag": "noindex" } });
// A module's page the plan lacks: a screen that says what the module does (app/not-in-plan). A 200: the proxy cannot tell a page load from
// the router's refresh, and a refresh answered 404 reloads the whole page, losing the toast of the screen's own "Ask us to add". The
// dashboard is never indexed anyway.
const notInPlan = (req: NextRequest) => NextResponse.rewrite(new URL(`/not-in-plan/${moduleForPath(req.nextUrl.pathname)}`, req.url), { status: 200, headers: { "X-Robots-Tag": "noindex" } });

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // A module the dealer does not have (#173): its pages answer as if they were not there. On the demo the bar's switches say; on a real
  // site the build setting (src/lib/modules.ts).
  const modules = demoCookiesCount() ? parseModules(req.cookies.get(MODULES_COOKIE)?.value) : parseModules(process.env.NEXT_PUBLIC_SITE_MODULES);
  // A closed area looks like a page that is not there. Server actions post to the page itself, so this covers them too.
  // Open in development and when the build says so; otherwise only with a valid Cloudflare Access token (src/lib/access.ts).
  const cfg = accessConfig();
  const token = req.headers.get("cf-access-jwt-assertion");
  const open = adminReachable();
  const who = open || cfg === null || !token ? null : await verifyAccessJwt(token, cfg);
  const verdict = open ? "open" : cfg === null ? "not-configured" : !token ? "no-token" : who ? "open" : "rejected";
  if (verdict === "open") {
    // Without the dashboard module there is nothing to show the screen in.
    if (!pathAllowed(path, modules)) return modules.has("dashboard") ? notInPlan(req) : notThere(req);
    // The pages and actions verify the token again themselves (src/lib/staff.ts): a server action can be posted to any page.
    return NextResponse.next();
  }
  // Why it was closed, in the Worker's logs (never the token): "no-token" means Access did not cover this path, "rejected" means a token came
  // that did not verify (wrong audience, team domain or expired), "not-configured" means CF_ACCESS_TEAM_DOMAIN or CF_ACCESS_AUD is missing.
  console.warn(`dashboard gate closed: ${verdict}`);
  return notThere(req);
}

// Every page. Not the routes that check their own key (api: CRON_KEY or the owner token; the photo and media routes) nor the static files
// (Next's own, the car photos and the brand files in public/).
export const config = {
  matcher: ["/((?!api/|car-photos/|media-files/|lead-photos/|_next/|stock/|brand/|brands/|icon\\.|favicon\\.ico).*)"],
};
