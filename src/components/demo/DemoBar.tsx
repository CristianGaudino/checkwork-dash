"use client";

import { useRouter } from "next/navigation";
import { useCallback, useId, useState, useSyncExternalStore } from "react";
import { THEME_KEY, type Theme } from "@/lib/demo";
import { setDealerRole, setDemoStockSource, useDealerRole } from "@/lib/demo-role";
import { useDealerFacts, useModules } from "@/components/DealerFacts";
import { ROLES, type Role } from "@/lib/permission-rules";
import { ChevronDownIcon } from "@/components/stock/icons";
import { ModuleSwitches } from "./ModuleSwitches";
import { press } from "@/components/ui";

// The theme lives on <html data-theme>; this watches that attribute, so the button is right on first paint and after any change.
function subscribe(cb: () => void) {
  const o = new MutationObserver(cb);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => o.disconnect();
}
const read = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function setTheme(t: Theme) {
  if (t === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    // Private window or blocked storage: the choice lasts for this page view only.
  }
}

// The page keeps room for whichever form of the bar is showing (--demo-bar-h): the whole bar from 640px, the pill and its gap on a phone.
// Hidden (display: none) forms report nothing, so the two never fight.
function useRoomFor(extra: number) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      const set = () => el.getClientRects().length && document.documentElement.style.setProperty("--demo-bar-h", `${el.offsetHeight + extra}px`);
      set();
      const o = new ResizeObserver(set);
      o.observe(el);
      return () => o.disconnect();
    },
    [extra],
  );
}

// The demo's own controls: the role and where the stock comes from, the plan, and the theme. A dealer that is not a demo (`demo` false,
// the directory's flag) gets the theme only: the server ignores the other switches' cookies for them anyway. `donedeal`: the stock source
// the server worked out for this request. On a phone and tablet it folds into a small pill at the bottom right that opens the controls above it; from
// 1024px it is one slim line at the foot of the screen (docs/mobile-navigation.md).
export function DemoBar({ demo, donedeal }: { demo: boolean; donedeal: boolean }) {
  const router = useRouter();
  // A plan without the dashboard (Showroom) has nothing to show here, so only the Plan switch and the theme stay, to go back.
  const dashboard = useModules().has("dashboard");
  const { listingSite } = useDealerFacts();
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  const dealerRole = useDealerRole();
  const [open, setOpen] = useState(false); // mirrors the popover, for the chevron and aria-expanded
  const panelId = useId();
  const barRoom = useRoomFor(0);
  const pillRoom = useRoomFor(20); // the pill and the 12px gap under it, and a little air above

  const chip = "flex h-9 shrink-0 items-center rounded-full border px-3 text-meta";
  // `phone`: the controls in the pill's panel, where the row wraps and the module list opens in place; else the slim bar.
  const controls = (phone: boolean) => (
    <>
      {dashboard && demo && (
        <div className={`flex items-center gap-2 ${phone ? "w-full flex-wrap" : ""}`}>
          {/* Which member of the team the demo acts as: the role decides what they may see (src/lib/permissions.ts). The browser's own
              select, not the site's Combobox: one compact control in a bar fixed to the foot of the screen, where a list would open off it. */}
          <label className={`${chip} border-hairline pr-0`}>
            <span aria-hidden className="mr-1 text-text-2">Role</span>
            <select
              aria-label="Role"
              value={dealerRole}
              onChange={(e) => {
                setDealerRole(e.target.value as Role);
                router.refresh();
              }}
              className="h-full cursor-pointer rounded-full bg-transparent pr-3 text-meta font-medium text-text"
            >
              {ROLES.map((r) => (
                <option key={r} value={r} className="bg-band text-text">
                  {r}
                </option>
              ))}
            </select>
          </label>
          {/* Where the stock comes from: added here, or synced from a listing site (DoneDeal or CarsIreland) and read only here (src/lib/stock-source.ts). */}
          <button
            type="button"
            aria-pressed={donedeal}
            onClick={() => {
              setDemoStockSource(donedeal ? "checkwork" : "donedeal");
              router.refresh();
            }}
            className={`${chip} ${donedeal ? "border-accent bg-accent text-on-accent" : "border-hairline text-text-2"} ${press}`}
          >
            {listingSite} sync<span className="ml-1">{donedeal ? "on" : "off"}</span>
          </button>
        </div>
      )}
      {/* Which modules the dealer has (#173), so a smaller site can be shown. One switch in one place, so choosing a plan keeps it open. */}
      {demo && <ModuleSwitches chip={chip} inline={phone} />}
      <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className={`flex h-11 items-center px-2 text-text-2 ${press}`}>
        {theme === "dark" ? "Dark" : "Light"}
      </button>
    </>
  );

  return (
    <div data-demo-bar className="theme-dark text-meta text-text">
      {/* A phone or tablet: the pill, and the controls above it when open. It stays a pill until 1024px, above the tab bar that
          shows until then, so the two are never stacked at the foot of a tablet. The controls are a native popover: a tap anywhere else, or
          Escape, folds them again. Placed 3rem above the pill's foot: its 2.5rem and an 0.5rem gap. */}
      <div className={`fixed right-3 z-40 bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:hidden`}>
        <div
          id={panelId}
          popover="auto"
          onToggle={(e) => setOpen(e.newState === "open")}
          className={`fixed inset-auto right-3 m-0 w-[min(20rem,calc(100vw-1.5rem))] flex-col items-start gap-1 rounded-card border border-hairline bg-band p-2 text-text shadow-panel bottom-[calc(7rem+env(safe-area-inset-bottom))] max-lg:[&:popover-open]:flex lg:hidden`}
        >
          {controls(true)}
        </div>
        <button
          ref={pillRoom}
          type="button"
          aria-expanded={open}
          popoverTarget={panelId}
          className={`flex h-10 items-center gap-1.5 rounded-full border border-hairline bg-band pl-4 pr-3 shadow-panel ${press}`}
        >
          {demo ? (
            <>
              <span className="text-text-2">Demo</span>
              <span className="font-semibold">Dealer</span>
            </>
          ) : (
            <span className="font-semibold">Theme</span>
          )}
          <ChevronDownIcon className={`size-4 text-text-2 transition-transform motion-reduce:transition-none ${open ? "" : "rotate-180"}`} />
        </button>
      </div>
      {/* From 1024px: one slim line at the foot of the screen, the theme at its right end. */}
      <div ref={barRoom} className={`fixed inset-x-0 bottom-0 z-40 hidden border-t border-hairline bg-band pb-[env(safe-area-inset-bottom)] lg:block`}>
        <div className="mx-auto flex min-h-11 max-w-page items-center gap-x-3 px-6 lg:px-8 [&>:last-child]:ml-auto">{controls(false)}</div>
      </div>
    </div>
  );
}
