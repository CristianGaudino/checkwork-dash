import "server-only";
import { dealerBucket } from "@/lib/tenancy/current";
import type { Photo } from "@/lib/stock/types";

// A car's own photos, added in the dashboard (#21). On the Worker they go to R2 under cars/{car id}/ in the current dealer's part of the
// private bucket (dealerBucket: dealers/<id>/; its lifecycle rules only touch trade-in/), and /car-photos serves that prefix and nothing
// else, to the dealer's own members. The demo's own photos are static files (/stock/...) and are only dropped from the list when removed.
// shortcut: with no bucket (next dev, E2E) a photo is kept in the car as a data: URL, in memory. Fine for trying it, never for a real site.
export const CAR_PHOTO_KEY = /^cars\/\d{1,12}\/[0-9a-f-]{36}\.jpg$/;
export const CAR_PHOTOS_MAX = 20;
export const CAR_PHOTO_MAX_BYTES = 3 * 1024 * 1024;
const PREFIX = "/car-photos/";

export async function storeCarPhoto(carId: string, jpeg: Uint8Array, width: number, height: number): Promise<Photo> {
  const bucket = await dealerBucket();
  if (!bucket) return { src: `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`, width, height };
  const key = `cars/${carId}/${crypto.randomUUID()}.jpg`;
  await bucket.put(key, jpeg.slice().buffer, { httpMetadata: { contentType: "image/jpeg" } });
  return { src: `${PREFIX}${key}`, width, height };
}

// Deletes the stored copies of these photos; the static and data: ones have nothing stored.
export async function dropCarPhotos(photos: Photo[]): Promise<void> {
  const keys = photos.map((p) => p.src.slice(PREFIX.length)).filter((k, i) => photos[i].src.startsWith(PREFIX) && CAR_PHOTO_KEY.test(k));
  const bucket = await dealerBucket();
  if (keys.length && bucket) await bucket.delete(keys);
}
