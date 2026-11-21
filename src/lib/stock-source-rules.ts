// Where the dealer's stock comes from. "checkwork": the dealer adds and edits cars in the dashboard. "donedeal": the stock is read from the
// dealer's DoneDeal account and synced here, so it is edited on DoneDeal only. DoneDeal's API is licensed to one dealer's own site, with the
// dealer's written consent (DoneDeal API usage policy), which is exactly this case. Plain data, so client and server agree.
export const STOCK_SOURCES = ["checkwork", "donedeal"] as const;
export type StockSource = (typeof STOCK_SOURCES)[number];
export const STOCK_COOKIE = "checkwork-demo-stock";
export const parseStockSource = (v: string | undefined): StockSource => (v === "donedeal" ? "donedeal" : "checkwork");
// The listing site a synced dealer's stock comes from (DoneDeal or CarsIreland) and the dealer's page there are in the dealer's profile
// (listing() in stock-source.ts). Both sites offer a dealer API for the dealer's own site, read the same way (src/lib/donedeal/, named for
// the first); the code's "donedeal" means "synced".
// The listing sites a car's ad may be on.
const LISTING_HOSTS = ["donedeal.ie", "carsireland.ie"];
// A car's own ad on the listing site, where it is edited; the dealer's page there (`dealerUrl`) when the sync has not stored one. The address comes from the
// site's feed, so only an https link on a listing site is used: anything else (a javascript: link, a look-alike host) falls back to the
// dealer's page.
export function listingHref(car: { listingUrl?: string }, dealerUrl: string): string {
  try {
    const u = new URL(car.listingUrl ?? "");
    if (u.protocol === "https:" && LISTING_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) return u.href;
  } catch {
    // no address, or not one
  }
  return dealerUrl;
}
