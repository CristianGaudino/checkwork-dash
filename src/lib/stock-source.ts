import "server-only";
import { dealerProfile, demoCookie } from "@/lib/tenancy/current";
import { STOCK_COOKIE, parseStockSource, type StockSource } from "./stock-source-rules";

// Where the current dealer's stock comes from, in their profile. On a demo dealer the demo bar's switch says instead (so both versions can
// be shown); on any other dealer a cookie never can.
export async function stockSource(): Promise<StockSource> {
  return parseStockSource((await demoCookie(STOCK_COOKIE)) ?? (await dealerProfile()).stock.source);
}
// The listing site the dealer's stock is synced from (DoneDeal or CarsIreland), and their page on it.
export const listing = async () => {
  const { listingSite, listingUrl } = (await dealerProfile()).stock;
  return { site: listingSite, url: listingUrl };
};
