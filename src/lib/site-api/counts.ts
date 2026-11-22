import "server-only";
import { z } from "zod";
import { dublinDay, addDays } from "@/lib/admin/format";
import { countStore } from "@/lib/owner-api/counters";
import { BUYER_EVENTS, countId } from "@/lib/owner-api/counter-rules";
import type { Answer } from "./request";

// POST /api/site/v1/counts: a day's anonymous visitor counts from the dealer's website (docs/site-api.md, #71). They go in the same
// `feature-counts` records the dashboard's Analytics reads (countsBetween), in the key's dealer's store. A name, a number: nothing else.
export const COUNTS_WINDOW_DAYS = 35;
export const MAX_COUNT = 1_000_000;
const body = z.strictObject({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  counts: z.record(z.string(), z.number().int().min(0).max(MAX_COUNT)).refine((c) => Object.keys(c).length <= 200),
});
const INVALID: Answer = { status: 400, outcome: "invalid" };

export async function receiveCounts(text: string, now = Date.now()): Promise<Answer> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return INVALID;
  }
  const sent = body.safeParse(json);
  if (!sent.success) return INVALID;
  const { day, counts } = sent.data;
  const today = dublinDay(now);
  // A real calendar day (2026-02-30 is not), Irish, not in the future and not older than the window.
  if (addDays(day, 0) !== day || day > today || day < addDays(today, -COUNTS_WINDOW_DAYS)) return INVALID;
  if (!Object.keys(counts).every((e) => BUYER_EVENTS.includes(e))) return INVALID;

  // Replace, not add: the day's website counts are cleared first (the dashboard's own `dash:` ones are not on the list, so they stay).
  for (const c of await countStore.list()) if (c.day === day && BUYER_EVENTS.includes(c.event)) await countStore.remove(c.id);
  for (const [event, count] of Object.entries(counts)) if (count > 0) await countStore.put({ id: countId(day, event), day, event, count });
  return { status: 204, outcome: "stored" };
}
