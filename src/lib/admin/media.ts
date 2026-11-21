import "server-only";
import { dealerBucket } from "@/lib/tenancy/current";
import type { Checked } from "./media-rules";

// The media library's files (#177). On the Worker they go to R2 under media/ in the current dealer's part of the private bucket
// (dealerBucket: dealers/<id>/), and /media-files serves that prefix and nothing else, to the dealer's own members.
// shortcut: with no bucket (next dev, E2E) a file is kept as a data: URL in memory. Fine for trying it, never for a real site. The page's
// content policy has no media-src, so a video held that way does not play in dev; from R2 it does. /media-files sends the whole file
// without range requests: add them before real use, since Safari asks for ranges to play a video.
export const MEDIA_KEY = /^media\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov)$/;
const PREFIX = "/media-files/";
const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime" };
export const mediaType = (key: string) => TYPES[key.slice(key.lastIndexOf(".") + 1)] ?? "application/octet-stream";

export async function storeMedia(bytes: Uint8Array, c: Extract<Checked, { ok: true }>): Promise<string> {
  const bucket = await dealerBucket();
  if (!bucket) return `data:${c.contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  const key = `media/${crypto.randomUUID()}.${c.ext}`;
  await bucket.put(key, bytes.buffer as ArrayBuffer, { httpMetadata: { contentType: c.contentType } });
  return `${PREFIX}${key}`;
}

export async function dropMedia(src: string): Promise<void> {
  const key = src.slice(PREFIX.length);
  const bucket = await dealerBucket();
  if (src.startsWith(PREFIX) && MEDIA_KEY.test(key) && bucket) await bucket.delete(key);
}
