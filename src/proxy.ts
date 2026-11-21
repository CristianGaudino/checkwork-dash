import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { accessConfig, verifyAccessJwt } from "@/lib/access";
import { adminReachable } from "@/lib/demo";
import { getBindings } from "@/lib/leads/bindings";

// The app's own not found page, not a bare line. A path no route matches renders app/not-found.tsx.
const notThere = (req: NextRequest) => NextResponse.rewrite(new URL("/not-found-closed-area", req.url), { status: 404, headers: { "X-Robots-Tag": "noindex" } });
// The gate in front of every page: Cloudflare Access's token, nothing per dealer. Which dealer, and what their plan has, is the server's
// (src/lib/tenancy): the root layout and each module's layout answer a module that is off (src/components/admin/PlanGate.tsx), and every
// action checks it again (requireModule). Proxy is not for data fetching (Next 16 docs), so it reads no directory.
export async function proxy(req: NextRequest) {
  // A closed area looks like a page that is not there. Server actions post to the page itself, so this covers them too.
  // Open in development and when the build says so, but never with a real directory bound (the Worker, where OpenNext gives the proxy the
  // bindings too); otherwise only with a valid Cloudflare Access token (src/lib/access.ts). staffIdentity checks the same again.
  const cfg = accessConfig();
  const token = req.headers.get("cf-access-jwt-assertion");
  const open = adminReachable() && !getBindings().DIRECTORY;
  const who = open || cfg === null || !token ? null : await verifyAccessJwt(token, cfg);
  const verdict = open ? "open" : cfg === null ? "not-configured" : !token ? "no-token" : who ? "open" : "rejected";
  // The pages and actions verify the token again themselves (src/lib/staff.ts): a server action can be posted to any page.
  if (verdict === "open") return NextResponse.next();
  // Why it was closed, in the Worker's logs (never the token): "no-token" means Access did not cover this path, "rejected" means a token came
  // that did not verify (wrong audience, team domain or expired), "not-configured" means CF_ACCESS_TEAM_DOMAIN or CF_ACCESS_AUD is missing.
  console.warn(`dashboard gate closed: ${verdict}`);
  return notThere(req);
}

// Every page. Not the routes that check their own key (api: CRON_KEY, the owner token or a website key, /api/site; the photo and media
// routes) nor the static files (Next's own, the seeded car photos in public/stock/<id>/*.webp, and the brand files in public/). Only the photo
// files: the stock pages under /stock are gated like any other.
export const config = {
  matcher: ["/((?!api/|car-photos/|media-files/|_next/|stock/[^/]+/[^/]+\\.webp|brand/|brands/|icon\\.|favicon\\.ico).*)"],
};
