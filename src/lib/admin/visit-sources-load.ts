import "server-only";
import type { Lead } from "@/lib/admin/collections";
import { buildAnalytics, type Range } from "@/lib/admin/analytics";
import { visitWindows } from "@/lib/admin/visit-sources";
import { visitorFigures } from "@/lib/admin/visitor-figures";
import { simulating } from "@/lib/integrations";
import { countsBetween } from "@/lib/owner-api/counters";
import { bounds } from "@/lib/reports/monthly";
import { counted } from "@/lib/admin/reports";

// Each channel's visits and leads over the last `range` days and its visits over the days before, for the Overview's strip: the demo's
// sample, or the site's own counts. The Analytics page works out the same from what it already loads.
export async function visitSources(range: Range, leads: Lead[], now = Date.now()) {
  if (await simulating()) {
    const a = buildAnalytics({ range, cars: [], now, leadTimes: leads.filter(counted).map((l) => l.createdAt) }); // spam is no lead (#56)
    return { now: a.channels, before: a.previous.channels };
  }
  return realVisitSources(range, now, leads);
}

// The site's own counts: this period's visits and the website leads in it, and the visits of the period before (leads are not needed there).
// `counts` and `before`: this period's and the one before's, when the caller has read them already (Analytics), so nothing is read twice.
export async function realVisitSources(range: Range, now: number, leads: Lead[], counts?: Record<string, number>, before?: Record<string, number>) {
  const w = visitWindows(range, now);
  const [start] = bounds(w.from, w.to);
  const read = (from: string, to: string) => countsBetween(from, to).then((x) => x.features);
  const [c, pc] = await Promise.all([counts ?? read(w.from, w.to), before ?? read(w.beforeFrom, w.beforeTo)]);
  const f = visitorFigures({ counts: c, leads: leads.filter((l) => counted(l) && l.createdAt >= start), alerts: [] }); // spam is no lead (#56)
  return { now: f.channels, before: visitorFigures({ counts: pc, leads: [], alerts: [] }).channels, unknownLeads: f.unknownLeads };
}
