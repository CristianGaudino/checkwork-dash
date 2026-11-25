import Link from "next/link";
import { Badge } from "@/components/admin/kit";
import { CarStatusBadge } from "@/components/admin/badges";
import { ExternalIcon, EyeIcon, EyeOffIcon, ShareIcon } from "@/components/stock/icons";
import { ActButton } from "@/components/admin/ActButton";
import { setListingAction } from "@/app/stock/actions";
import { NEW_TAB } from "@/components/ui";
import { daysSince } from "@/lib/admin/format";
import { FEW_PHOTOS } from "@/lib/admin/stock-views";
import { carName, siteCarUrl } from "@/lib/stock/format";
import { forSale, isSold, onPublicSite, type Car } from "@/lib/stock/types";
import { dealerProfile } from "@/lib/tenancy/current";

// What a dealer does with one car, the same on the stock list and on the car's own page, and the warnings that say what a car needs.

// A post for this car on Facebook, Instagram or TikTok. Posts are for cars in stock: never a sold car. The caller checks the social module.
export function PostToSocial({ car, className }: { car: Car; className: string }) {
  if (!forSale(car)) return null; // the composer offers only cars for sale: a hidden car, a draft or a sold one would be dropped there
  return (
    <Link href={`/marketing/new?car=${encodeURIComponent(car.slug)}`} title="Post to Facebook, Instagram or TikTok" aria-label={`Post to social: ${carName(car)}`} className={className}>
      <ShareIcon className="size-4 shrink-0" />
      Post to social
    </Link>
  );
}

// The car as a customer sees it, in a new tab. A hidden car or a draft has no page on the website.
// `shown`: the car's kind (commercial) is on the site with the dealer's modules (conditionShown).
export async function ViewOnSite({ car, shown, className }: { car: Car; shown: boolean; className: string }) {
  const { siteUrl, rules } = await dealerProfile();
  if (!shown || !siteUrl || !onPublicSite(car, rules.soldVisibleDays)) return null; // no link to a page that answers "gone" or not found, nor with no website
  return (
    <a href={siteCarUrl(siteUrl, car.slug)} {...NEW_TAB} title="Open the car's page on your website" aria-label={`View on the website: ${carName(car)} (opens in a new tab)`} className={className}>
      <ExternalIcon className="size-4 shrink-0" />
      {/* Short on a phone, where the car's page has its actions two across. */}
      <span className="sm:hidden">View on site</span>
      <span className="max-sm:hidden">View on the website</span>
    </a>
  );
}

// Whole days in stock, in words: "Today", "1 day", "23 days".
export const daysInStock = (listedAt: string) => {
  const d = daysSince(listedAt);
  return d === 0 ? "Today" : d === 1 ? "1 day" : `${d} days`;
};

// What needs doing about a car, in words: off the website, too few photos, in stock too long. Nothing for a sold car.
function carWarnings(car: Car, oldDays: number, photos: boolean): string[] {
  if (isSold(car)) return [];
  const out: string[] = [];
  if (car.listing === "hidden") out.push("Hidden from the website");
  if (photos && car.photos.length < FEW_PHOTOS) out.push(car.photos.length === 0 ? "No photos" : `Only ${car.photos.length} ${car.photos.length === 1 ? "photo" : "photos"}`);
  if (forSale(car) && car.listedAt && daysSince(car.listedAt) >= oldDays) out.push(`In stock ${daysSince(car.listedAt)} days`);
  return out;
}

// The car's status, and a warning badge for each thing that needs doing. `status`: leave the status out where every row has the same one.
// `photos`: leave out the photo warning where To do already counts it (the stock list, but for its Need photos view).
export async function CarFlags({ car, status = true, photos = true }: { car: Car; status?: boolean; photos?: boolean }) {
  const warnings = carWarnings(car, (await dealerProfile()).rules.oldStockDays, photos);
  const showStatus = status || car.listing === "draft" || Boolean(car.reserved) || isSold(car);
  if (!showStatus && warnings.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {showStatus && !(car.listing === "hidden" && warnings.length > 0) && <CarStatusBadge car={car} />}
      {warnings.map((w) => (
        <Badge key={w} tone="warn">{w}</Badge>
      ))}
    </span>
  );
}

// Hide, show or publish, with Undo in the toast. Our version only: DoneDeal stock is shown and hidden there.
export function ListingButton({ car, className }: { car: Car; className: string }) {
  const name = carName(car);
  const [to, label, short, done] = car.listing === "draft" ? ["live", "Publish", "Publish", `Published ${name}`] : car.listing ? ["live", "Show on the website", "Show on site", `${name} is on the website again`] : ["hidden", "Hide from the website", "Hide from site", `Hid ${name} from the website`];
  return (
    <ActButton act={setListingAction.bind(null, car.id, to, car.listing ?? "live")} undo={setListingAction.bind(null, car.id, car.listing ?? "live", to)} done={done} className={className}>
      {car.listing ? <EyeIcon className="size-4 shrink-0" /> : <EyeOffIcon className="size-4 shrink-0" />}
      {/* Short on a phone, as View on site. */}
      <span className="sm:hidden">{short}</span>
      <span className="max-sm:hidden">{label}</span>
    </ActButton>
  );
}
