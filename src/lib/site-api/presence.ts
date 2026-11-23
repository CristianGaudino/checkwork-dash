import "server-only";
import { z } from "zod";
import { defineCollection } from "@/lib/admin/docs";
import { simulating } from "@/lib/integrations";
import type { Answer } from "./request";

// How many people are on the dealer's website right now (#111): the Overview's Active now tile. The website pings
// POST /api/site/v1/presence with a random id per open tab (docs/site-api.md); one record per id with when it was last seen, in the dealer's
// store. An id is a tab, never a person: no IP, no cookie, no device. Ids not seen for 5 minutes are deleted on the next ping.
// shortcut: the pings come through the website's one key, so the site API's limit (60 a minute per key and route) caps it near 60 tabs
// pinging once a minute; past that some get 429 and the figure reads low. A limiter of its own if a dealer gets that busy.
type Seen = { id: string; at: number };
export const presence = defineCollection<Seen>("presence", () => []);

export const ACTIVE_MS = 3 * 60_000; // seen within this long counts as on the site now (a tab pings once a minute)
export const KEEP_MS = 5 * 60_000;
export const EVER = "~ever"; // when the website last pinged at all; the `~` is outside a tab id's characters, so no tab can be it
export const MAX_BODY = 256;
const body = z.strictObject({ tab: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/) });

export async function receivePresence(text: string, now = Date.now()): Promise<Answer> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: 400, outcome: "invalid" };
  }
  const sent = body.safeParse(json);
  if (!sent.success) return { status: 400, outcome: "invalid" };
  const { tab } = sent.data;
  const stale = (await presence.list()).filter((s) => s.id !== EVER && s.at < now - KEEP_MS).map((s) => s.id);
  // One batch: drop the stale ids and rewrite this tab and the marker (deleted first, so the inserts never clash).
  await presence.replaceMany([...stale, tab, EVER], [{ id: tab, at: now }, { id: EVER, at: now }]);
  return { status: 204, outcome: "stored" };
}

// The tabs seen in the last 3 minutes, or null when the website has never pinged (the tile is left out). A demo dealer gets a small
// made-up figure that drifts minute by minute and is the same for every read within a minute.
export async function activeNow(now = Date.now()): Promise<number | null> {
  if (await simulating()) return simulatedActive(now);
  const seen = await presence.list();
  if (!seen.some((s) => s.id === EVER)) return null;
  return seen.filter((s) => s.id !== EVER && s.at >= now - ACTIVE_MS).length;
}

// 2 to 8: a slow wave over the hour plus a step from the minute, so the next minute is the same or one or two off.
export function simulatedActive(now: number): number {
  const minute = Math.floor(now / 60_000);
  return Math.round(5 + 2 * Math.sin(minute / 9) + ((Math.imul(minute, 2654435761) >>> 0) % 3) - 1);
}
