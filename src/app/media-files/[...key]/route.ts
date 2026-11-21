import { MEDIA_KEY, mediaType } from "@/lib/admin/media";
import { dealerBucket } from "@/lib/tenancy/current";

// A photo or video from the dealer's media library (src/lib/admin/media.ts), only under media/: the trade-in and lead photos in the same
// bucket never answer here. Only the current dealer's, to its members (dealerBucket reads under dealers/<id>/; anyone with no dealer open
// gets a 404). Each key is new per upload, so a file never changes: cached a year, privately, since it now depends on who asks.
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!MEDIA_KEY.test(key)) return new Response(null, { status: 404 });
  const bucket = await dealerBucket().catch(() => undefined);
  const object = await bucket?.get(key);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": mediaType(key), "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
