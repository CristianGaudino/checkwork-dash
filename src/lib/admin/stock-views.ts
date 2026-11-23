import { forSale, isReduced, isSold, type Car } from "@/lib/stock/types";
import { isOldStock } from "./overview";

// The stock list's views (each a summary tile and a filter) and its search, shared by the page and its CSV export. `oldDays`: the dealer's
// old stock rule (their profile).
export const FEW_PHOTOS = 4;
export const stockViews = (oldDays: number) => ({
  "for-sale": { label: "For sale", test: forSale },
  reduced: { label: "Reduced", test: (c: Car) => forSale(c) && isReduced(c) },
  photos: { label: "Need photos", test: (c: Car) => !isSold(c) && c.photos.length < FEW_PHOTOS },
  old: { label: `${oldDays} days or more`, test: (c: Car) => isOldStock(c, Date.now(), oldDays) },
  reserved: { label: "Reserved", test: (c: Car) => Boolean(c.reserved) && !isSold(c) },
  sold: { label: "Sold", test: (c: Car) => isSold(c) },
  // Off the website. A car whose DoneDeal ad came down is here, waiting for the dealer to say what happened.
  hidden: { label: "Hidden", test: (c: Car) => c.listing === "hidden" },
  drafts: { label: "Drafts", test: (c: Car) => c.listing === "draft" },
  all: { label: "All", test: () => true },
});
export type StockView = keyof ReturnType<typeof stockViews>;

// `status` is the old name for the view, kept so old links still work. Anything unknown is the For sale view.
// The list's view and search, and its make, fuel and gearbox filters (a make's slug, a fuel, a gearbox; anything else matches no car). The
// page and the CSV export read the same, so the export is the list as it is filtered now.
export type StockFilters = { make?: string; fuel?: string; gearbox?: string };
export function parseStockList(sp: { view?: string; status?: string; q?: string; make?: string; fuel?: string; gearbox?: string }) {
  const asked = sp.view ?? sp.status;
  const view: StockView = asked && Object.hasOwn(stockViews(0), asked) ? (asked as StockView) : "for-sale";
  return { view, q: (sp.q ?? "").trim().toLowerCase().slice(0, 60), make: sp.make?.slice(0, 40) || undefined, fuel: sp.fuel?.slice(0, 20) || undefined, gearbox: sp.gearbox?.slice(0, 20) || undefined };
}

// A registration matches however it is typed: "191d12345" finds 191-D-12345.
const squash = (s: string) => s.toLowerCase().replace(/[\s-]/g, "");
export const stockList = (all: Car[], view: StockView, q: string, oldDays: number, { make, fuel, gearbox }: StockFilters = {}) =>
  all
    .filter(stockViews(oldDays)[view].test)
    .filter((c) => !q || `${c.make} ${c.model} ${c.variant ?? ""} ${c.year}`.toLowerCase().includes(q) || (!!c.reg && !!squash(q) && squash(c.reg).includes(squash(q))))
    .filter((c) => (!make || c.makeSlug === make) && (!fuel || c.fuel === fuel) && (!gearbox || c.gearbox === gearbox))
    .sort((a, b) => Number(b.id) - Number(a.id));
