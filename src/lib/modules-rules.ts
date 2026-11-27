// What a dealer has paid for beyond the base site (#173). Plain data, so the browser (menus), the server (pages, actions) and the proxy
// read the same list. The base site is always on: the stock read from the feed, car pages, the basic enquiry and contact
// forms, saved cars, compare and the standard pages.
// `pages`: the dealer website's pages (and everything under them) that answer only with the module on (the website is a separate app,
// so nothing here routes them); `dashboard`: the same for this app's pages.
// `needs`: what must also be on. Stock kept in the dashboard is not a switch here: it follows where the stock comes from (stock-source).
export const MODULES = [
  { id: "dashboard", label: "Dealer dashboard", blurb: "Leads inbox, follow-ups, staff logins and roles, activity, data requests.", pages: [], dashboard: [] }, // every page of this app: see pathAllowed
  { id: "tradeIn", label: "Trade-in and sell your car", blurb: "Valuation forms with photos.", pages: ["/trade-in", "/sell-your-car"], dashboard: [] },
  { id: "finance", label: "Finance", blurb: "Payment estimator with your lender's wording, and finance applications.", pages: ["/finance"], dashboard: [] },
  { id: "testDrives", label: "Test drives", blurb: "Slot booking on the site and a calendar in the dashboard.", pages: ["/test-drive"], dashboard: ["/test-drives"], needs: ["dashboard"] },
  { id: "carFinder", label: "Car finder", blurb: "Requests for cars not in stock.", pages: ["/find-a-car"], dashboard: [] },
  { id: "sales", label: "Sales and customers", blurb: "Deposits and reservations, sale records and a customer list.", pages: [], dashboard: [], needs: ["dashboard"] }, // /customers is shared with stock alerts: the page checks both
  { id: "margins", label: "Margins and reports", blurb: "Cost prices, margins for the staff allowed, sales reports, targets.", pages: [], dashboard: ["/margins", "/reports"], needs: ["sales"] },
  { id: "service", label: "Service and aftersales", blurb: "Service booking, warranty claims and their progress.", pages: ["/service"], dashboard: ["/aftersales"], needs: ["dashboard"] },
  // No needs (#224): a Showroom site shows its reviews without the dashboard; /reviews (replies) also needs the dashboard, as every dashboard page.
  { id: "reviews", label: "Reviews", blurb: "Google reviews on the site; replies from the dashboard when you have it.", pages: ["/reviews"], dashboard: ["/reviews"] },
  { id: "social", label: "Social and ads", blurb: "Posts, stories, reels and ads from the dashboard.", pages: [], dashboard: ["/marketing/new"], needs: ["dashboard"] },
  { id: "newsletter", label: "Stock alerts", blurb: "Emails when a car someone asked about comes in or drops in price.", pages: [], dashboard: [], needs: ["dashboard"] },
  { id: "commercial", label: "Commercial vehicles", blurb: "A commercial section with ex. VAT pricing.", pages: ["/commercial"], dashboard: [] },
  { id: "analytics", label: "Site analytics", blurb: "Visitor numbers and where they came from.", pages: [], dashboard: ["/analytics"], needs: ["dashboard"] },
  { id: "whatsapp", label: "WhatsApp", blurb: "Leads to your phone, and replies from WhatsApp that the site sends on.", pages: [], dashboard: [], needs: ["dashboard"] }, // a channel in Settings, Notifications (#142), not a page
  { id: "ai", label: "AI writing", blurb: "Drafts of posts, descriptions and replies, with buttons to adjust them.", pages: [], dashboard: [], needs: ["dashboard"] },
  // The registration lookup (#180), for staff adding stock and checking leads. The website has none (#182): a plan that still lists
  // "lookupWebsite" reads without it, as parseModules drops ids it does not know.
  { id: "lookupDashboard", label: "Registration lookup in the dashboard", blurb: "Staff fill in a car from its registration.", pages: [], dashboard: [], needs: ["dashboard"] },
  // A vehicle history check (#170), from the car's page, a trade-in or sell lead and a sale's trade-in. Its id is its billing service's.
  { id: "history", label: "Vehicle history check", blurb: "Finance owed, write-offs, mileage and imports, from the registration.", pages: [], dashboard: [], needs: ["dashboard"] },
] as const satisfies readonly { id: string; label: string; blurb: string; pages: readonly string[]; dashboard: readonly string[]; needs?: readonly string[] }[];

export type ModuleId = (typeof MODULES)[number]["id"];
export const MODULE_IDS = MODULES.map((m) => m.id) as ModuleId[];
const isModule = (v: string): v is ModuleId => (MODULE_IDS as string[]).includes(v);
const needsOf = (id: ModuleId): readonly ModuleId[] => (MODULES.find((m) => m.id === id) as { needs?: readonly ModuleId[] }).needs ?? [];

// A dealer's plan (their profile's `modules`, read for billing only since #212) is a comma list of ids, "all" or nothing. Unset means
// all; a profile always has a value, "dashboard" by default. A module without what it needs is off.
export function parseModules(v: string | undefined): Set<ModuleId> {
  const raw = v === undefined || v.trim() === "all" ? MODULE_IDS : v.split(",").map((s) => s.trim()).filter(isModule);
  const on = new Set<ModuleId>(raw);
  // Drop anything whose needs are off, until nothing changes (margins needs sales needs dashboard).
  for (let changed = true; changed; ) {
    changed = false;
    for (const id of on) {
      if (!needsOf(id).some((n) => !on.has(n))) continue;
      on.delete(id);
      changed = true;
    }
  }
  return on;
}
export const modulesValue = (on: Iterable<ModuleId>) => [...on].join(",");
// A car's own page and listings: a van only with Commercial vehicles, any other car always.
export const conditionShown = (on: Set<ModuleId>, condition?: string) => condition !== "commercial" || on.has("commercial");

// Turning one on brings what it needs; turning one off takes what needs it. The demo bar's switches use these, so a choice is never half on.
export function withModule(on: Set<ModuleId>, id: ModuleId): Set<ModuleId> {
  const next = new Set(on).add(id);
  for (const n of needsOf(id)) for (const m of withModule(next, n)) next.add(m);
  return next;
}
export function withoutModule(on: Set<ModuleId>, id: ModuleId): Set<ModuleId> {
  const next = new Set(on);
  next.delete(id);
  return parseModules(modulesValue(next));
}

// The module a dashboard path belongs to, or none (the dashboard alone). The longest matching prefix wins.
const within = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");
export function moduleForPath(path: string): ModuleId | undefined {
  let best: { id: ModuleId; len: number } | undefined;
  for (const m of MODULES) for (const p of m.dashboard) if (within(path, p) && (!best || p.length > best.len)) best = { id: m.id, len: p.length };
  return best?.id;
}
// Whether a path answers with these modules on: every page here needs the dashboard, and a module's page its module too.
export function pathAllowed(path: string, on: Set<ModuleId>): boolean {
  const id = moduleForPath(path);
  return on.has("dashboard") && (!id || on.has(id));
}
