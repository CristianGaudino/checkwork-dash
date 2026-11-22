import { CHANNEL_LABELS, type Channel } from "@/lib/visit-rules";
import { compare } from "@/lib/reports/monthly";

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

// `trend` colours the change: none when there are too few to compare or it rounds to the same.
function figures(label: string, visits: number, before: number, leads: number, period: string): SourceFigures {
  const change = compare(visits, before, period);
  return { label, visits, before, leads, rate: ratePer100(leads, visits), change, trend: change.startsWith("Up") ? "up" : change.startsWith("Down") ? "down" : null };
}
// A tile is narrow: "Typed in or bookmarked" (the lead's wording) is "Typed in" here.
const label = (c: Channel) => (c === "direct" ? "Typed in" : CHANNEL_LABELS[c]);

// The channels with a visit or a lead this period, most visits first; the one that brought the most leads (then the better rate) is `best`.
export function sourceTiles(now: ChannelCount[], before: Pick<ChannelCount, "channel" | "visits">[], period = "period"): SourceTile[] {
  const was = (c: Channel) => before.find((b) => b.channel === c)?.visits ?? 0;
  const tiles = now.filter((c) => c.visits || c.leads).map((c) => ({ ...figures(label(c.channel), c.visits, was(c.channel), c.leads, period), channel: c.channel, best: false }));
  const top = [...tiles].sort((a, b) => b.leads - a.leads || (b.rate ?? 0) - (a.rate ?? 0))[0];
  if (top?.leads) top.best = true;
  return tiles.sort((a, b) => b.visits - a.visits || b.leads - a.leads);
}

// The tiles in their groups, most visits first; a group with nothing this period is left out. `best`: the group holds the best channel.
// The period before counts every channel in the group, also one with nothing this period.
export function sourceGroups(tiles: SourceTile[], before: Pick<ChannelCount, "channel" | "visits">[], period = "period"): SourceGroup[] {
  return SOURCE_GROUPS.map((g) => {
    const mine = (c: Channel) => (g.channels as readonly Channel[]).includes(c);
    const channels = tiles.filter((t) => mine(t.channel));
    const sum = (k: "visits" | "leads") => channels.reduce((n, t) => n + t[k], 0);
    const was = before.filter((b) => mine(b.channel)).reduce((n, b) => n + b.visits, 0);
    return { ...figures(g.label, sum("visits"), was, sum("leads"), period), id: g.id, channels, best: channels.some((t) => t.best) };
  })
    .filter((g) => g.channels.length)
    .sort((a, b) => b.visits - a.visits || b.leads - a.leads);
}
