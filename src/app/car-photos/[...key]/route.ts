import { CAR_PHOTO_KEY } from "@/lib/admin/car-photos";
import { dealerBucket } from "@/lib/tenancy/current";

// A car's photo added in the dashboard (src/lib/admin/car-photos.ts), only under cars/: the trade-in photos in the same bucket never answer
// here. Only the current dealer's, to its members (dealerBucket reads under dealers/<id>/; anyone with no dealer open gets a 404).
// The dealer's website gets them by signed links instead (src/lib/site-api/photos.ts). Each key is new per upload, so a photo never changes: cached a year,
// privately, since it now depends on who asks.
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!CAR_PHOTO_KEY.test(key)) return new Response(null, { status: 404 });
  const bucket = await dealerBucket().catch(() => undefined);
  const object = await bucket?.get(key);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
