import type { Permission } from "@/lib/permission-rules";

// The dealer area's navigation, as data. `permission` hides an entry (and the page refuses) unless the dealer has it (src/lib/permissions.ts).
// `icon` names a line icon (AdminNav maps it), so this file stays plain data the tests can import. `group` is the menu block an item sits in:
// every item names its own, so a role that cannot see the first item of a group still sees the rest under the right heading.
export type NavIcon = "home" | "inbox" | "car" | "calendar" | "users" | "megaphone" | "chart" | "percent" | "star" | "cog" | "history" | "report" | "shield" | "wrench" | "receipt" | "help" | "swap";
// `ours`: only for a dealer whose stock is kept here (not on DoneDeal).
// `also`: other pages that are this place in the menu (a view of it at its own address), so the menu marks it there too.
export type NavItem = { href: string; label: string; icon: NavIcon; group?: string; permission?: Permission; ours?: true; also?: string[] };

export const DEALER_NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: "home", also: ["/to-do"] },
  // The places staff use all day stand alone at the top, never folded away.
  { href: "/leads", label: "Leads", icon: "inbox" },
  { href: "/test-drives", label: "Test drives", icon: "calendar" },
  { href: "/stock", label: "Stock", icon: "car" },
  { href: "/marketing", label: "Marketing", icon: "megaphone" },
  { href: "/customers", label: "Customers", icon: "users", group: "Customers" },
  { href: "/aftersales", label: "Warranty claims", icon: "wrench", group: "Customers" },
  { href: "/reviews", label: "Reviews", icon: "star", group: "Customers" },
  // Reports and its Monthly view are one place. With the reports permission the menu opens Reports; without it the same entry opens the
  // monthly report, so it stays in the menu (menuItems keeps the first of a name).
  { href: "/reports", label: "Reports", icon: "report", group: "Results", permission: "reports", also: ["/monthly-report"] },
  { href: "/monthly-report", label: "Reports", icon: "report", group: "Results" },
  { href: "/analytics", label: "Analytics", icon: "chart", group: "Results" },
  { href: "/margins", label: "Margins", icon: "percent", group: "Results", permission: "margins" },
  { href: "/settings", label: "Settings", icon: "cog", group: "Settings and help" },
  { href: "/help", label: "Help", icon: "help", group: "Settings and help" },
  { href: "/billing", label: "Billing", icon: "receipt", group: "Settings and help", permission: "billing" },
  { href: "/activity", label: "Activity", icon: "history", group: "Settings and help", permission: "activity" },
  { href: "/data-requests", label: "Data requests", icon: "shield", group: "Settings and help", permission: "data" },
];

// The menu for one person, from the entries they may have: one entry per name, the first (Reports over its Monthly view), and Switch
// dealer only for someone at two or more dealers.
export const menuItems = (allowed: NavItem[], dealers: number): NavItem[] => [
  ...allowed.filter((i, k) => allowed.findIndex((j) => j.label === i.label) === k),
  ...(dealers > 1 ? [{ href: "/dealers", label: "Switch dealer", icon: "swap", group: "Settings and help" } as const] : []),
];

// The sidebar's groups: the items with no group stand alone on top (Overview and the everyday places), then each group with its items, in the menu's order.
export type NavGroup = { name: string; items: NavItem[] };
export function navGroups(items: NavItem[]): { top: NavItem[]; groups: NavGroup[] } {
  const groups: NavGroup[] = [];
  for (const it of items) {
    if (!it.group) continue;
    let g = groups.find((x) => x.name === it.group);
    if (!g) groups.push((g = { name: it.group, items: [] }));
    g.items.push(it);
  }
  return { top: items.filter((i) => !i.group), groups };
}

// Which groups are open in the sidebar, kept in a cookie so the page is drawn that way from the server (no jump after it loads). Customers,
// the next most used after the places on top, is open until they close it.
export const NAV_COOKIE = "checkwork-demo-nav";
export const DEFAULT_OPEN = ["Customers"];
// The browser can send anything back: a value that does not decode is the default, never an error that takes the dashboard down.
export function parseOpenGroups(v: string | undefined): string[] {
  if (v === undefined) return DEFAULT_OPEN;
  try {
    return decodeURIComponent(v).split("|").filter(Boolean).slice(0, 10);
  } catch {
    return DEFAULT_OPEN;
  }
}
export const openGroupsCookie = (open: string[]) => `${NAV_COOKIE}=${encodeURIComponent(open.join("|"))}; path=/; max-age=31536000; samesite=lax`;
