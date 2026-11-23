"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { Density } from "@/components/admin/density";
import { ChevronLeftIcon, ChevronRightIcon, ExternalIcon } from "@/components/stock/icons";
import { press } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { NEW_TAB } from "@/components/ui";
import type { DealerProfile } from "@/lib/tenancy/profile";
import { DENSITY_COOKIE, RAIL_COOKIE, prefCookie, type NavItem } from "@/lib/admin/nav";


// Kept for the next page the server draws (src/app/layout.tsx reads the cookies), so nothing jumps after it loads.
const save = (name: string, value: string) => {
  document.cookie = prefCookie(name, value);
};

// The frame of the dealer area (docs/mobile-navigation.md). From 1024px: the whole width of the screen, a sidebar held in place down the
// left on its own surface, folding to a rail of icons and back, and the page beside it. Under 1024px: the dealership's name and the bell on
// top, the page, and a tab bar at the foot of the screen.
// `title` is the dealer's name; `profile` their logo, mark and website.
export function AdminShell({ title, profile, subtitle, nav, navLabel, openGroups, rail: railAtFirst, compact: compactAtFirst, children }: { title: string; profile: Pick<DealerProfile, "logo" | "mark" | "siteUrl">; subtitle: string; nav: NavItem[]; navLabel: string; openGroups: string[]; rail: boolean; compact: boolean; children: React.ReactNode }) {
  const [rail, setRail] = useState(railAtFirst);
  const [compact, setCompactNow] = useState(compactAtFirst);
  const setCompact = (v: boolean) => {
    setCompactNow(v);
    save(DENSITY_COOKIE, v ? "compact" : "comfortable");
  };
  const toggleRail = () => {
    setRail(!rail);
    save(RAIL_COOKIE, rail ? "0" : "1");
  };
  const initials = title.split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
  return (
    <Density.Provider value={{ compact, setCompact }}>
      <div data-density={compact ? "compact" : "comfortable"} className={`group/shell flex-1 lg:grid lg:transition-[grid-template-columns] lg:duration-200 lg:ease-out motion-reduce:transition-none ${rail ? "lg:grid-cols-[4.5rem_minmax(0,1fr)]" : "lg:grid-cols-[16rem_minmax(0,1fr)]"}`}>
        <aside className="flex min-w-0 flex-col px-4 pt-4 sm:px-6 lg:sticky lg:top-0 lg:z-30 lg:h-[calc(100dvh-var(--demo-bar-h,0px))] lg:self-start lg:overflow-x-hidden lg:overflow-y-auto lg:border-r lg:border-hairline lg:bg-rail lg:px-0 lg:pt-0">
          <div className={`flex items-center justify-between gap-2 lg:pb-3 lg:pt-5 ${rail ? "lg:flex-col lg:px-0" : "lg:pl-6 lg:pr-3"}`}>
            {/* The dealer's own logo (the public site's, light and dark), in a box that keeps its shape: a wide wordmark or a square crest.
                Its name is the logo's text for screen readers and shows on hover, so a long name is never cut short. */}
            <div title={title} className={`flex min-w-0 flex-1 flex-col items-start gap-1 ${rail ? "lg:hidden" : ""}`}>
              <Link href="/" aria-label={`${title}, go to the overview`} className="inline-flex max-w-full relative rounded-control outline-offset-2 focus-visible:outline-2 focus-visible:outline-text before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']">
                <Logo name={title} logo={profile.logo} className="h-7 w-auto max-w-[10.5rem] object-contain object-left lg:h-8" eager />
              </Link>
              <p className="text-meta text-text-2 max-lg:sr-only">{subtitle}</p>
            </div>
            {/* The rail: the dealer's square mark when they have one (their profile), else their initials, so the frame still says whose it is. */}
            {profile.mark ? (
              <Link href="/" aria-label={`${title}, go to the overview`} title={title} className={`hidden relative rounded-control outline-offset-2 focus-visible:outline-2 focus-visible:outline-text before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] ${rail ? "lg:block" : ""}`}>
                <img src={profile.mark} alt="" width={40} height={40} className="size-10 object-contain" />
              </Link>
            ) : (
              <Link href="/" aria-label={`${title}, go to the overview`} title={title} className={`hidden size-10 items-center justify-center rounded-control bg-text font-display text-meta font-semibold text-ink outline-offset-2 focus-visible:outline-2 focus-visible:outline-text ${rail ? "lg:inline-flex" : ""}`}>
                <span aria-hidden>{initials}</span>
              </Link>
            )}
            <NotificationBell />
          </div>
          <AdminNav items={nav} label={navLabel} openGroups={openGroups} rail={rail} />
          <div className={`hidden items-center border-t border-hairline lg:mx-3 lg:flex lg:min-h-14 ${rail ? "lg:justify-center" : "lg:justify-between lg:gap-2 lg:pl-3"}`}>
            {!rail && profile.siteUrl && (
              <a href={profile.siteUrl} {...NEW_TAB} className="flex min-w-0 items-center gap-1.5 py-3 text-meta font-medium text-text-2 transition-colors hover:text-text">
                <span className="truncate">View your website</span>
                <ExternalIcon aria-hidden className="size-4 shrink-0" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
            <button type="button" onClick={toggleRail} aria-label={rail ? "Expand the menu" : "Collapse the menu"} title={rail ? "Expand the menu" : "Collapse the menu"} className={`inline-flex size-11 shrink-0 items-center justify-center rounded-control text-text-2 transition-colors hover:bg-card hover:text-text ${press}`}>
              {rail ? <ChevronRightIcon className="shrink-0 size-5" /> : <ChevronLeftIcon className="shrink-0 size-5" />}
            </button>
          </div>
        </aside>
        {/* On a phone the page ends above the tab bar (3.5rem and the home indicator), so its last row is never under it. */}
        <main className="flex min-w-0 flex-col gap-6 px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:px-10 lg:pb-10 lg:pt-0">{children}</main>
      </div>
    </Density.Provider>
  );
}
