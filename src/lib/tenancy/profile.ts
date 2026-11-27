import { z } from "zod";
import { tooLong } from "@/lib/leads/constants";

// What differs between dealers beyond their records: their facts, where their stock comes from, their business
// rules and the few service settings that are not secrets. Kept in the directory, one JSON value per dealer (dealers.profile), read with the
// dealer once a request (src/lib/tenancy). Plain data, so the browser gets the parts it shows (src/components/DealerFacts.tsx).
// Facts the dealer's owner or manager may change in Settings (FACTS_SCHEMA); the rest is ours to set (docs/new-dealer.md).
export type Hours = { day: string; opens?: string; closes?: string }[];
export type DealerRules = {
  oldStockDays: number; // a car for sale this long is old stock: the stock list's view, the overview, the reports and the slow-stock alert
  slowDropEur: number; // the price drop suggested on old stock (Stock, the slow-stock alert), applied by Drop to on Stock or the alert's button
  soldVisibleDays: number; // days a sold car stays on the dealer's website after its sale
  serviceMonths: number; // a sold car's service is due this many months after the sale, then again each time (the buyer's reminder, src/lib/admin/reminders.ts)
};
export type ListingSite = "DoneDeal" | "CarsIreland";
export type DealerProfile = {
  siteUrl: string; // the dealer's website, for "View on the website" and car links; "" when they have none
  phone: string;
  email: string;
  address: { street: string; town: string; county: string; eircode: string };
  hours: Hours; // Monday first, 24 hour HH:MM; a day with no opens is closed
  social: { name: "Facebook" | "Instagram" | "TikTok"; href: string }[];
  // The wide logo for a light and a dark background: paths on this app (public/brand/), since the content security policy loads images
  // from here only. Without a logo the menu shows the name.
  logo?: { onLight: string; onDark: string };
  stock: { source: "checkwork" | "donedeal"; listingSite: ListingSite; listingUrl: string };
  rules: DealerRules;
  placeId?: string; // the dealer's Google place, for their reviews (the API key is ours, a Worker secret)
  leadEmail?: string; // where lead emails go when Settings, Lead emails has none
};

const HOURS_OF = (week: [string | undefined, string | undefined][]): Hours =>
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, i) => (week[i]?.[0] ? { day, opens: week[i][0], closes: week[i][1] } : { day }));

// A dealer with nothing set: stock kept here, the usual rules, no website or facts yet.
export const DEFAULT_PROFILE: DealerProfile = {
  siteUrl: "",
  phone: "",
  email: "",
  address: { street: "", town: "", county: "", eircode: "" },
  hours: HOURS_OF([]),
  social: [],
  stock: { source: "checkwork", listingSite: "DoneDeal", listingUrl: "https://www.donedeal.ie/" },
  rules: { oldStockDays: 60, slowDropEur: 500, soldVisibleDays: 30, serviceMonths: 12 },
};

// The demo dealer, a made-up business with its own website. The phone number is made up; the street is a real one in Dublin
// and the eircode illustrative.
export const DEMO_PROFILE: DealerProfile = {
  ...DEFAULT_PROFILE,
  siteUrl: "https://www.demo.checkwork.ie",
  phone: "+353 1 906 0045",
  email: "contact@checkwork.ie",
  address: { street: "Long Mile Road", town: "Dublin 12", county: "Co. Dublin", eircode: "D12 AF77" },
  hours: HOURS_OF([["09:30", "18:00"], ["09:30", "18:00"], ["09:30", "18:00"], ["09:30", "18:00"], ["09:30", "18:00"], ["10:00", "16:00"]]),
  logo: { onLight: "/brand/logo-on-light.svg", onDark: "/brand/logo.svg" },
};
export const DEMO_NAME = "Checkwork Motors";

// What the browser needs of the dealer being viewed: the parts of their profile it shows (src/components/DealerFacts.tsx), worked out on
// the server for each request. Nothing secret goes in.
export type DealerFacts = { name: string; siteUrl: string; listingSite: ListingSite; listingUrl: string; hours: Hours; rules: DealerRules };
export const factsOf = (name: string, p: DealerProfile): DealerFacts => ({ name, siteUrl: p.siteUrl, listingSite: p.stock.listingSite, listingUrl: p.stock.listingUrl, hours: p.hours, rules: p.rules });

// The address on one line, for reading: the eircode never splits over two lines.
export const addressText = (a: DealerProfile["address"]) => [a.street, a.town, a.county, a.eircode].filter(Boolean).join(", ").replace(/ (\S+)$/, " $1");

// A stored value over `base` (DEFAULT_PROFILE; DEMO_PROFILE for a demo dealer), one level down for the grouped parts, so a value saved
// before a field existed still gets it. Anything that is not a JSON object is the base: a broken value never stops the dealer's dashboard.
export function parseProfile(raw: string | null | undefined, base: DealerProfile = DEFAULT_PROFILE): DealerProfile {
  let v: Partial<DealerProfile> = {};
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) v = parsed as Partial<DealerProfile>;
  } catch {
    // stays the defaults
  }
  const d = base;
  return { ...d, ...v, address: { ...d.address, ...v.address }, stock: { ...d.stock, ...v.stock }, rules: { ...d.rules, ...v.rules } };
}

// What an owner or manager changes in Settings, Your business. The website must be an https address; a time is HH:MM.
const time = z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "A time like 09:30")]);
export const FACTS_SCHEMA = z.object({
  name: z.string().trim().min(1, "Give the business name").max(80, tooLong(80)),
  siteUrl: z.union([z.literal(""), z.url({ protocol: /^https$/, error: "A full address starting https://" }).max(200, tooLong(200))]).transform((u) => u.replace(/\/+$/, "")),
  phone: z.string().trim().max(30, tooLong(30)),
  email: z.union([z.literal(""), z.email("Enter a valid email address").max(120, tooLong(120))]),
  street: z.string().trim().max(80, tooLong(80)),
  town: z.string().trim().max(60, tooLong(60)),
  county: z.string().trim().max(60, tooLong(60)),
  eircode: z.string().trim().max(10, tooLong(10)),
  hours: z.array(z.object({ opens: time, closes: time })).length(7),
});
