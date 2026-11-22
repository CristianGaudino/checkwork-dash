import { CHANNEL_LABELS, type Channel } from "@/lib/visit-rules";
import { addDays, dublinDay } from "@/lib/admin/format";
import { TOO_FEW } from "@/lib/reports/monthly";

// "Where visits come from" (#35): each channel's visits, the change on the period before, the leads it brought and leads per 100 visits,
// grouped as a dealer thinks of them. Pure, so the maths is tested. The same shape from the real counts (./visitor-figures.ts) and the
// demo's sample (./analytics.ts). Counts only.
export type ChannelCount = { channel: Channel; visits: number; leads: number };

export const SOURCE_GROUPS = [
  { id: "search", label: "Search", channels: ["google", "bing"] },
  { id: "social", label: "Social", channels: ["facebook", "instagram", "tiktok"] },
  { id: "listings", label: "Listing sites", channels: ["donedeal", "carzone"] },
  { id: "email", label: "Email", channels: ["email"] },
  { id: "direct", label: "Typed in", channels: ["direct"] },
  { id: "other", label: "Other", channels: ["other"] },
] as const satisfies readonly { id: string; label: string; channels: readonly Channel[] }[];

export type SourceFigures = { label: string; visits: number; before: number; leads: number; rate: number | null; change: string; trend: "up" | "down" | null };
export type SourceTile = SourceFigures & { channel: Channel; best: boolean };
export type SourceGroup = SourceFigures & { id: string; channels: SourceTile[]; best: boolean };

// Leads per 100 visits, to one decimal; none without visits (a lead whose visit was counted the period before).
export const ratePer100 = (leads: number, visits: number) => (visits ? Math.round((leads / visits) * 1000) / 10 : null);

// The change in short ("Up 6%"): the panel above names the period. Under five either side it is too few to compare, and on a base under
// ten it gives the count before ("Up from 6"), as in the monthly report. `trend` colours it: none when too few or it rounds to no change.
function figures(label: string, visits: number, before: number, leads: number): SourceFigures {
  const pct = visits < TOO_FEW || before < TOO_FEW ? null : Math.round(((visits - before) / before) * 100);
  const small = before < 2 * TOO_FEW;
  const change = pct === null ? "Too few to compare" : pct === 0 ? "No change" : `${pct > 0 ? "Up" : "Down"} ${small ? `from ${before}` : `${Math.abs(pct)}%`}`;
  return { label, visits, before, leads, rate: ratePer100(leads, visits), change, trend: !pct ? null : pct > 0 ? "up" : "down" };
}

// The one that brought the most leads (then the better rate) is `best`; none when nothing brought a lead.
function markBest<T extends { leads: number; rate: number | null; best: boolean }>(list: T[]): T[] {
  const top = [...list].sort((a, b) => b.leads - a.leads || (b.rate ?? 0) - (a.rate ?? 0))[0];
  if (top?.leads) top.best = true;
  return list;
}
// A tile is narrow: "Typed in or bookmarked" (the lead's wording) is "Typed in" here.
const label = (c: Channel) => (c === "direct" ? "Typed in" : CHANNEL_LABELS[c]);

// The channels with a visit or a lead this period, most visits first, the best marked.
export function sourceTiles(now: ChannelCount[], before: Pick<ChannelCount, "channel" | "visits">[]): SourceTile[] {
  const was = (c: Channel) => before.find((b) => b.channel === c)?.visits ?? 0;
  const tiles = now.filter((c) => c.visits || c.leads).map((c) => ({ ...figures(label(c.channel), c.visits, was(c.channel), c.leads), channel: c.channel, best: false }));
  return markBest(tiles).sort((a, b) => b.visits - a.visits || b.leads - a.leads);
}

// The tiles in their groups, most visits first; a group with nothing this period is left out. The best group by the channels' rule.
// The period before counts every channel in the group, also one with nothing this period.
export function sourceGroups(tiles: SourceTile[], before: Pick<ChannelCount, "channel" | "visits">[]): SourceGroup[] {
  const groups = SOURCE_GROUPS.map((g) => {
    const mine = (c: Channel) => (g.channels as readonly Channel[]).includes(c);
    const channels = tiles.filter((t) => mine(t.channel));
    const sum = (k: "visits" | "leads") => channels.reduce((n, t) => n + t[k], 0);
    const was = before.filter((b) => mine(b.channel)).reduce((n, b) => n + b.visits, 0);
    return { ...figures(g.label, sum("visits"), was, sum("leads")), id: g.id, channels, best: false };
  }).filter((g) => g.channels.length);
  return markBest(groups).sort((a, b) => b.visits - a.visits || b.leads - a.leads);
}

// The real site's two windows of Irish days: the last `range` up to today, and the `range` before. Counted back in days, not hours, so a
// clock change never moves a window.
export function visitWindows(range: number, now: number) {
  const day = (back: number) => addDays(dublinDay(now), -back);
  return { from: day(range - 1), to: day(0), beforeFrom: day(2 * range - 1), beforeTo: day(range) };
}

