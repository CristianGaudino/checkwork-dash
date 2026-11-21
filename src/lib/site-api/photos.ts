import "server-only";
import { adminCar } from "@/lib/admin/stock-admin";
import { CAR_PHOTO_KEY, CAR_PHOTO_PREFIX } from "@/lib/admin/car-photos";
import { logSite } from "@/lib/log";
import { appUrl } from "@/lib/site";
import { stockSource } from "@/lib/stock-source";
import { onPublicSite, type Car, type Photo } from "@/lib/stock/types";
import { dealerBucket, dealerProfile, runAsDealerRow } from "@/lib/tenancy/current";
import { dealerById } from "@/lib/tenancy/directory";

// A dealer's car photos on their website (#25, docs/site-api.md). An <img> cannot send the site key, so the stock answer gives each stored
// photo as a public link signed for that dealer and key: HMAC-SHA256 with SITE_PHOTO_SECRET, a Worker secret per environment. With no
// secret nothing is signed and every link answers 404, so a deploy without it never signs with a key anyone could guess.
const enc = new TextEncoder();
const hmacKey = (secret: string) => crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
const message = (dealerId: string, key: string) => enc.encode(`${dealerId}\n${key}`);
const DEALER_ID = /^[a-z0-9-]+$/;

// Which of the current dealer's cars are on their website (onPublicSite, their sold window), or null for a dealer whose stock is synced
// from a listing site (their website reads that site). The stock answer and the photo route both ask this.
export async function onWebsite(): Promise<((c: Car) => boolean) | null> {
  if ((await stockSource()) !== "checkwork") return null;
  const { soldVisibleDays } = (await dealerProfile()).rules;
  return (c) => onPublicSite(c, soldVisibleDays);
}

// What the stock answer gives a website for each photo, or null to leave it out: the demo's static files (/stock/...) as absolute links to
// this app, a stored photo as a signed link, a data: URL (no bucket: next dev, E2E) as it is. One key import per answer, not per photo.
export async function websitePhotos(dealerId: string): Promise<(p: Photo) => Promise<Photo | null>> {
  const base = appUrl();
  const secret = process.env.SITE_PHOTO_SECRET;
  const key = secret ? await hmacKey(secret) : null;
  return async (p) => {
    if (p.src.startsWith("/stock/")) return { ...p, src: base + p.src };
    if (p.src.startsWith("data:")) return p;
    const k = p.src.slice(CAR_PHOTO_PREFIX.length);
    if (!key || !p.src.startsWith(CAR_PHOTO_PREFIX) || !CAR_PHOTO_KEY.test(k)) return null;
    const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, message(dealerId, k))).toString("base64url");
    return { ...p, src: `${base}/api/site/v1/photos/${dealerId}/${k}?sig=${sig}` };
  };
}

const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

// GET /api/site/v1/photos/<dealer>/<key>?sig=: the photo, only with a signature for that dealer and key, only under that dealer's prefix, and
// only while the car is on their website with this photo (checked on every request, so hiding a car or removing a photo stops its links).
// Everything else is the same bare 404. A failure is logged with the dealer's id only, never the key or the signature.
export async function sitePhoto(dealerId: string, key: string, sig: string): Promise<Response> {
  const secret = process.env.SITE_PHOTO_SECRET;
  if (!secret || !DEALER_ID.test(dealerId) || !CAR_PHOTO_KEY.test(key) || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return notFound();
  try {
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(secret), Buffer.from(sig, "base64url"), message(dealerId, key)))) return notFound();
    const dealer = await dealerById(dealerId);
    if (!dealer || dealer.status !== "active") return notFound();
    const object = await runAsDealerRow(dealer, async () => {
      const [rule, car] = await Promise.all([onWebsite(), adminCar(key.split("/")[1])]);
      if (!rule || !car || !rule(car) || !car.photos.some((p) => p.src === CAR_PHOTO_PREFIX + key)) return null;
      return (await dealerBucket())?.get(key) ?? null;
    });
    if (!object) return notFound();
    // Keys are new per upload, so a photo never changes: kept a year anywhere. No Workers cache in front: it would skip the check above.
    return new Response(object.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch {
    logSite({ route: "photos", dealerId, outcome: "error", status: 500 });
    return new Response(null, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
