import "server-only";
import { currentDealer } from "@/lib/tenancy/current";


// Every outside service the site can use, in one list. A service is "connected" when all its settings are present. Nothing here holds a
// secret: `env` names the variables to set (Cloudflare dashboard, or `.dev.vars` for local work). The admin shows this list, and any
// feature that needs a service asks `isConnected(id)` first, so a missing key is a clear message and never an error.
export type IntegrationId = "reviews" | "social" | "ads" | "newsletter" | "email" | "reglookup" | "donedeal" | "gbp" | "whatsapp" | "ai";

export type Integration = {
  id: IntegrationId;
  name: string;
  purpose: string;
  env: readonly string[];
  // Where the owner gets the keys.
  where: string;
  // The made-up account shown while the service is simulated (the demo), so the page reads like a connected one: "{name}" is the dealer's
  // name, "{handle}" the same as a handle, "{site}" their listing site (integrationText fills them in).
  demoAccount?: string;
};

export const INTEGRATIONS: readonly Integration[] = [
  // The place is the dealer's (their profile's placeId); the key is ours.
  { id: "reviews", name: "Google reviews", purpose: "Shows your Google reviews on your website.", env: ["GOOGLE_PLACES_API_KEY"], where: "Google Cloud console, Places API" },
  { id: "social", demoAccount: "@{handle}", name: "Facebook and Instagram posting", purpose: "Posts what you write in Marketing.", env: ["META_PAGE_ID", "META_PAGE_ACCESS_TOKEN", "META_INSTAGRAM_ID"], where: "Meta for developers, a page access token" },
  { id: "ads", demoAccount: "{name} ad account", name: "Ads (Meta and Google)", purpose: "Runs the ads you make in Marketing, and shows how they do.", env: ["META_AD_ACCOUNT_ID", "GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_ADS_DEVELOPER_TOKEN"], where: "Meta Ads Manager and Google Ads API centre" },
  { id: "newsletter", demoAccount: "news@{handle}.example", name: "Newsletter sending", purpose: "Sends your newsletters and stock alerts.", env: ["NEWSLETTER_API_KEY", "NEWSLETTER_FROM_EMAIL", "UNSUBSCRIBE_SECRET"], where: "The email sending provider, a verified sending domain, and a random secret for the unsubscribe links" },
  // The addresses are the dealer's (Settings, Lead emails, else their profile's leadEmail, which is what Settings shows as connected); the
  // sending is the EMAIL binding. Nothing here to set.
  { id: "email", name: "Lead email", purpose: "Emails you each new lead.", env: [], where: "Cloudflare Email Service (the EMAIL binding)" },
  { id: "reglookup", demoAccount: "{name} on Cartell", name: "Registration lookup", purpose: "Fills in a car's details from its registration, on your website and when you add stock.", env: ["CARTELL_API_KEY"], where: "Cartell, a business account" },
  { id: "gbp", demoAccount: "{name} on Google", name: "Google review replies", purpose: "Brings your Google reviews into Reviews, and posts your replies.", env: ["GOOGLE_BUSINESS_LOCATION", "GOOGLE_BUSINESS_REFRESH_TOKEN"], where: "Google Business Profile API, for the dealer's verified profile, signed in as its owner or a manager" },
  // Only for a dealer whose stock comes from a listing site, DoneDeal or CarsIreland (src/lib/stock-source.ts): Settings lists it then.
  { id: "donedeal", demoAccount: "{name} on {site}", name: "{site} stock", purpose: "Brings your {site} ads onto your website every 15 minutes.", env: ["DONEDEAL_API_KEY"], where: `{site}, an API key for the dealer's own site, given with the dealer's written consent (DoneDeal and CarsIreland work the same way)` },
  { id: "whatsapp", demoAccount: "{name} on WhatsApp", name: "WhatsApp Business", purpose: "Sends new leads to your team's phones and updates to buyers, and brings in their replies.", env: ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET"], where: "Meta for developers, the WhatsApp Business Platform (Cloud API), for the dealer's own business number" },
  { id: "ai", demoAccount: "Included with your site", name: "AI writing", purpose: "Writes first drafts of your posts, car descriptions and replies, for you to check.", env: ["ANTHROPIC_API_KEY"], where: "The Claude Console, an API key for the dealer's site" },
];

// A service's words for one dealer: their name and listing site in place of "{name}", "{handle}" and "{site}".
export function integrationText(i: Integration, dealer: { name: string; site: string }): Integration {
  const fill = (t: string) => t.replaceAll("{name}", dealer.name).replaceAll("{handle}", dealer.name.toLowerCase().replace(/[^a-z0-9]/g, "")).replaceAll("{site}", dealer.site);
  return { ...i, name: fill(i.name), purpose: fill(i.purpose), where: fill(i.where), ...(i.demoAccount && { demoAccount: fill(i.demoAccount) }) };
}

// A demo dealer (the directory's flag) shows every feature working and never reaches anyone real: its outward services are simulated, keys
// or not (AI writing excepted, see modeOf), so it does their work in its own records and sends nothing outside, on any deploy. Any other dealer never simulates: a service
// without keys says it is not connected.
export const simulating = async () => (await currentDealer()).demo;

const present = (name: string) => Boolean(process.env[name]);

export const missingEnv = (i: Integration) => i.env.filter((n) => !present(n));
export const isConnected = (id: IntegrationId) => {
  const i = INTEGRATIONS.find((x) => x.id === id);
  return Boolean(i) && missingEnv(i!).length === 0;
};

export type Mode = "live" | "simulated" | "off";
// Only the outward services (and the registration lookup, DoneDeal stock, review replies and AI writing) are simulated. Lead email and reviews
// always show their true state, and analytics shows its sample figures only while simulating (src/app/analytics/page.tsx).
const SIMULATABLE: readonly IntegrationId[] = ["social", "ads", "newsletter", "reglookup", "donedeal", "gbp", "whatsapp", "ai"];
// The exception is AI writing on a demo dealer: with its key set it is real Claude (owner, 2026-11-22; the demo's spend is bounded by the usage caps),
// and without one (next dev, tests, E2E) it is the mock.
export const modeOf = async (id: IntegrationId): Promise<Mode> =>
  (await simulating()) && SIMULATABLE.includes(id) && !(id === "ai" && isConnected(id)) ? "simulated" : isConnected(id) ? "live" : "off";
export const isUsable = async (id: IntegrationId) => (await modeOf(id)) !== "off";
