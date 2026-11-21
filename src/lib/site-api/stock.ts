import "server-only";
import { adminCars } from "@/lib/admin/stock-admin";
import type { Car } from "@/lib/stock/types";
import { currentDealer } from "@/lib/tenancy/current";
import { onWebsite, websitePhotos } from "./photos";
import type { Answer } from "./request";

// GET /api/site/v1/stock: the cars on the dealer's website, for a dealer whose stock is kept here: live ones and sold ones still inside the
// dealer's sold window (onPublicSite, their profile's rules), as the website's own stock did. A synced dealer's website reads the listing
// site, so it gets 404. Only the fields a public car page needs: named here, so a field added to Car later stays private until it is added.
const PUBLIC_FIELDS = [
  "id", "slug", "make", "makeSlug", "model", "modelSlug", "variant", "year", "priceEur", "wasPriceEur", "condition", "vat", "mileageKm", "fuel",
  "gearbox", "bodyType", "bodySlug", "engineLitres", "colour", "doors", "seats", "owners", "nctExpiry", "maxSpeedMph", "zeroTo62Secs", "co2GKm",
  "motorTaxEur", "evRangeKm", "batteryKwh", "acChargeKw", "dcChargeKw", "charge10To80Mins", "description", "features", "photos", "soldAt",
  "listedAt", "reserved",
] as const satisfies readonly (keyof Car)[];
const publicCar = (c: Car) => Object.fromEntries(PUBLIC_FIELDS.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]));

export async function publicStock(): Promise<Answer> {
  const rule = await onWebsite();
  if (!rule) return { status: 404, outcome: "not-here" };
  // Photos as links the website can open (photos.ts); one it cannot is left out.
  const photo = await websitePhotos((await currentDealer()).id);
  const cars = await Promise.all(
    (await adminCars()).filter(rule).map(async (c) => publicCar({ ...c, photos: (await Promise.all(c.photos.map(photo))).filter((p) => p !== null) })),
  );
  // A minute's cache in the website's own fetch, never a shared cache: the address is the same for every dealer, only the key differs.
  return { status: 200, outcome: "listed", body: { cars }, headers: { "Cache-Control": "private, max-age=60", Vary: "Authorization" } };
}
