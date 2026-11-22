import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NavProgress } from "@/components/NavProgress";
import { Toaster } from "@/components/Toaster";
import { DemoBar } from "@/components/demo/DemoBar";
import { AdminShell } from "@/components/admin/AdminShell";
import { DealerGate } from "@/components/admin/DealerChooser";
import { DashboardBeacon } from "@/components/admin/DashboardBeacon";
import { ServiceWorker } from "@/components/admin/ServiceWorker";
import { DEALER_NAV, DENSITY_COOKIE, NAV_COOKIE, RAIL_COOKIE, menuItems, parseOpenGroups } from "@/lib/admin/nav";
import { THEME_SCRIPT } from "@/lib/demo";
import { DealerFactsProvider } from "@/components/DealerFacts";
import { factsOf } from "@/lib/tenancy/profile";
import DashboardNotFound from "./not-found";
import { currentMember } from "@/lib/permissions";
import { roleCan } from "@/lib/permission-rules";
import { stockSource } from "@/lib/stock-source";
import { enabledModules } from "@/lib/modules";
import { modulesValue, pathAllowed } from "@/lib/modules-rules";
import { dealerAccess } from "@/lib/tenancy/membership";
import { pageGate, staffIdentity } from "@/lib/staff";
import "./globals.css";

const signedInEmail = async () => {
  const who = await staffIdentity();
  return who.ok ? who.email : undefined;
};

// Sora, from a file kept in the repo (src/app/fonts): no request to Google when a page loads, and none when the app is built. One
// variable file covers every weight; the latin range covers English and Irish.
const sora = localFont({ src: "./fonts/sora-latin.woff2", weight: "100 800", display: "swap", variable: "--font-sora" });
// Inter for running text, Sora for headings: the pair the Checkwork company site uses. Kept in the repo the same way.
const inter = localFont({ src: "./fonts/inter-latin.woff2", weight: "100 900", display: "swap", variable: "--font-inter" });

// Never indexed. Real access is Cloudflare Access (#7, #21); the demo shows it open so every role can be seen.
// Always rendered per request: these pages show records that change, so they are never built once with the seed.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: { default: "Dealer dashboard", template: "%s | Dealer dashboard" }, robots: { index: false } };

// The app on a phone's home screen (#11). The manifest is a static file with its own link, not app/manifest.ts: a browser fetches a manifest
// without cookies unless the link says use-credentials, and Cloudflare Access turns a request without its cookie away. Next's own link
// cannot say it. The icons are made by scripts/app-icons.mjs.
const appHead = (
  <>
    <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
    <meta name="theme-color" content="#f4f6fb" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Checkwork" />
    <link rel="apple-touch-icon" href="/brand/apple-touch-icon.png" />
  </>
);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Which dealer this is, from the directory (src/lib/tenancy). With none open, the page is the chooser or "No access" and nothing else: no
  // menu, no page. Every store refuses without a dealer too, and every action (requireStaff), so this is not the only lock.
  const access = await dealerAccess();
  // A page outside the proxy (the sign-in pages, the proxy's own 404) is drawn bare, with its own content. A signed-out page load under our
  // sign-in has already gone to sign in (dealerAccess).
  const gate = await pageGate();
  // Signed out anywhere else (a POST with a dead session, which is never redirected): not there, as the proxy answers. "No access" below
  // is only for someone signed in who is at no dealer.
  if (gate === "frame" && access.state === "signed-out") notFound();
  if (gate === "bare" || access.state !== "ok")
    return (
      <html lang="en-IE" className={`${sora.variable} ${inter.variable}`} suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
          {appHead}
        </head>
        <body className="flex min-h-dvh flex-col">
          {gate === "bare" ? children : <DealerGate choices={access.state === "choose" ? access.choices : undefined} email={access.state === "no-access" ? await signedInEmail() : undefined} />}
        </body>
      </html>
    );
  // break-ui: both imports sit inside the dev branch, so a production build leaves them out entirely.
  const dev = process.env.NODE_ENV === "development" ? { Toggle: (await import("@/components/DevDataToggle")).DevDataToggle, mode: await (await import("@/lib/dev-data")).devMode() } : null;
  const [{ role }, source, jar, modules] = await Promise.all([currentMember(), stockSource(), cookies(), enabledModules()]);
  // A screen that needs a permission is left out of the menu, and the page itself refuses (notFound) without it. So is one for stock kept
  // here, for a dealer whose stock is on DoneDeal, and one of a module the dealer does not have (#173; the proxy refuses its pages).
  // Someone at several dealers switches between them from the menu.
  const nav = menuItems(DEALER_NAV.filter((i) => (!i.permission || roleCan(role, i.permission)) && !(i.ours && source === "donedeal") && pathAllowed(i.href, modules) && (!i.module || [i.module].flat().some((m) => modules.has(m)))), access.choices.length);
  const { dealer } = access;
  // A plan without the dashboard (#173) has no page here: every one is the not found screen, with the demo bar still there to choose
  // again. A module's own pages are its folder's layout's (PlanGate).
  return (
    <html lang="en-IE" className={`${sora.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* Sets a stored dark choice before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {appHead}
      </head>
      <body className="flex min-h-dvh flex-col">
        {/* Suspense: it reads the search params, which a static page only has in the browser. */}
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <DealerFactsProvider value={factsOf(dealer.name, dealer.profile, modulesValue(modules))}>
          <DemoBar demo={dealer.demo} donedeal={source === "donedeal"} />
          <AdminShell title={dealer.name} profile={dealer.profile} subtitle="Dealer dashboard" nav={nav} navLabel="Dealer dashboard" openGroups={parseOpenGroups(jar.get(NAV_COOKIE)?.value)} rail={jar.get(RAIL_COOKIE)?.value === "1"} compact={jar.get(DENSITY_COOKIE)?.value === "compact"}>
            <DashboardBeacon />
            <ServiceWorker />
            {modules.has("dashboard") ? children : <DashboardNotFound />}
          </AdminShell>
        </DealerFactsProvider>
        {dev && <dev.Toggle mode={dev.mode} />}
        <div data-bottom-stack className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--demo-bar-h,0px)+1rem)] z-30 flex flex-col items-center gap-2 px-4">
          <Toaster />
        </div>
      </body>
    </html>
  );
}
