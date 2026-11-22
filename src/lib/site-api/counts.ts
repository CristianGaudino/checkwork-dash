import "server-only";
import { z } from "zod";
import { dublinDay, addDays, isIsoDay } from "@/lib/admin/format";
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
  if (!isIsoDay(day) || day > today || day < addDays(today, -COUNTS_WINDOW_DAYS)) return INVALID;

  // Replace, not add: every allow-listed name of the day is rewritten or cleared. A name off the list is simply not stored (so list drift or an
  // older sender never loses a day, and a `dash:` name can never land); the dashboard's own `dash:` records are not on the list, so they stay.
  // shortcut: one query per name (about 100), not one D1 batch, because the record store has no batch; upgrade if the list grows a lot.
  for (const event of BUYER_EVENTS) {
    const count = counts[event] ?? 0;
    if (count > 0) await countStore.put({ id: countId(day, event), day, event, count });
    else await countStore.remove(countId(day, event));
  }
  return { status: 204, outcome: "stored" };
}
