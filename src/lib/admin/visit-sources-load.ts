import "server-only";
import type { Lead } from "@/lib/admin/collections";
import { buildAnalytics, type Range } from "@/lib/admin/analytics";
import { dublinDay } from "@/lib/admin/format";
import { visitorFigures } from "@/lib/admin/visitor-figures";
import { simulating } from "@/lib/integrations";
import { countsBetween } from "@/lib/owner-api/counters";
import { bounds } from "@/lib/reports/monthly";
import { DAY } from "@/lib/time";

// Each channel's visits and leads over the last `range` days and its visits over the days before, for the Overview's strip: the demo's
// sample, or the site's own counts. The Analytics page works out the same from what it already loads.
export async function visitSources(range: Range, leads: Lead[], now = Date.now()) {
  if (await simulating()) {
    const a = buildAnalytics({ range, cars: [], now, leadTimes: leads.map((l) => l.createdAt) });
    return { now: a.channels, before: a.previous.channels };
  }
  return realVisitSources(range, now, leads);
}

// The site's own counts: this period's visits and the website leads in it, and the visits of the period before (leads are not needed there).
export async function realVisitSources(range: Range, now: number, leads: Lead[]) {
  const day = (back: number) => dublinDay(now - back * DAY);
  const [start] = bounds(day(range - 1), day(0));
  const [c, pc] = await Promise.all([countsBetween(day(range - 1), day(0)), countsBetween(day(2 * range - 1), day(range))]);
  const f = visitorFigures({ counts: c.features, leads: leads.filter((l) => l.createdAt >= start), alerts: [] });
  return { now: f.channels, before: visitorFigures({ counts: pc.features, leads: [], alerts: [] }).channels, unknownLeads: f.unknownLeads };
}
