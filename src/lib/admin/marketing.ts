import { carName, carHref, fmtEur } from "@/lib/stock/format";
import { priceInfo } from "@/lib/stock/price";
import { FUEL_LABELS, GEARBOX_LABELS, forSale, isReduced, type Car } from "@/lib/stock/types";
import { DAY } from "@/lib/time";
import type { Ad, DealerSettings, Network, SocialPost } from "./collections";
import { addDays, dublinDay } from "./format";
import { slugId } from "./stock-admin-pure";
import { FORMAT_LIMITS, PUBLISH_MODE, type PostFormat } from "./networks";
import type { CarFacts } from "@/lib/ai/tasks";

// The writers for posts and newsletters. Plain templates over the car's own facts and the dealer's voice settings: the same car and
// settings always give the same text, and nothing is invented (no claims, no offers). The dealer edits the text before it goes anywhere.
// The AI writer's plain draft (src/lib/ai/mock.ts) is this text too, so only its adjust buttons write differently.
type Voice = Pick<DealerSettings["marketing"], "signOff" | "hashtags">;

const priceText = (c: Car) => {
  const p = priceInfo(c);
  return [p.headline, p.vatLine].filter(Boolean).join(" ");
};

// What a writer may say about a car: its own fields, its price as the site shows it, and its link on the dealer's website (`siteUrl`, none
// without one).
export function carFacts(c: Car, siteUrl: string): CarFacts {
  return {
    name: `${carName(c)}${c.variant ? ` ${c.variant}` : ""}`,
    year: c.year, mileageKm: c.mileageKm, fuel: c.fuel && FUEL_LABELS[c.fuel], gearbox: c.gearbox && GEARBOX_LABELS[c.gearbox], body: c.bodyType, engineLitres: c.engineLitres,
    colour: c.colour, doors: c.doors, seats: c.seats, owners: c.owners, nctExpiry: c.nctExpiry,
    price: priceText(c),
    was: isReduced(c) ? fmtEur(c.wasPriceEur!) : undefined,
    features: c.features?.slice(0, 12),
    link: siteUrl ? `${siteUrl}${carHref(c.slug)}` : undefined,
  };
}

// The cars for sale, newest first (the highest id was added last): the first `n`, or all of them.
export const newestForSale = (cars: Car[], n?: number) => cars.filter(forSale).sort((a, b) => Number(b.id) - Number(a.id)).slice(0, n);

export const writePost = (car: Car, siteUrl: string, network: Network, voice: Voice, format: PostFormat = "post") => postText(carFacts(car, siteUrl), network, voice, format);
export function postText(c: CarFacts, network: Network, voice: Voice, format: PostFormat = "post"): string {
  const lead = { post: "Just in", story: "Just in", reel: "Walkaround", carousel: "More photos" }[format];
  const head = `${lead}: ${c.name}.`;
  const facts = [c.mileageKm !== undefined && `${c.mileageKm.toLocaleString("en-IE")} km`, c.fuel, c.gearbox].filter(Boolean).join(", ");
  const line = [facts, c.price].filter(Boolean).join(". ");
  const link = network === "Instagram" || network === "TikTok" ? "Link in bio." : c.link;
  const tags = voice.hashtags.trim();
  // A story is a few words on a photo: no specs, sign-off or hashtags. TikTok captions stay short too: no sign-off line.
  if (format === "story") return [head, c.price].filter(Boolean).join("\n");
  const parts = network === "TikTok" ? [head, line, tags] : [head, line, voice.signOff.trim(), link, network === "Instagram" ? tags : ""];
  return parts.filter(Boolean).join("\n");
}

// Whether a post has what its format needs to go out: a reel its video, a story a photo or a video, the rest their least number of photos.
// A draft may be unfinished; posting it, now or later, needs this.
export function readyToPost(p: Pick<SocialPost, "format" | "photos" | "video">): boolean {
  const format = p.format ?? "post";
  const photos = p.photos?.length ?? 0;
  return format === "reel" ? Boolean(p.video) : format === "story" ? photos + (p.video ? 1 : 0) > 0 : photos >= FORMAT_LIMITS[format].photos[0];
}

// The calendar's week (#177): the Monday to Sunday that holds `day` (an Irish YYYY-MM-DD), and what falls on each day. A post is on the day
// it is set for or went out; an ad on the day it started. Drafts have no day, so they are not on it.
export const weekDays = (day: string) => Array.from({ length: 7 }, (_, i) => addDays(day, i - ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7)));
export type CalendarItem = { id: string; kind: "post" | "ad"; at: number; title: string; sub: string; status: "scheduled" | "posted" | "running" | "paused" | "ended"; heldBy?: string };
export function calendarWeek(posts: SocialPost[], ads: Ad[], days: string[]): Record<string, CalendarItem[]> {
  const out: Record<string, CalendarItem[]> = Object.fromEntries(days.map((d) => [d, []]));
  const add = (i: CalendarItem) => out[dublinDay(i.at)]?.push(i);
  for (const p of posts) {
    if (p.status === "draft") continue;
    const at = p.status === "scheduled" ? p.scheduledFor : (p.postedAt ?? p.createdAt);
    if (at) add({ id: p.id, kind: "post", at, title: `${p.network} ${p.format ?? "post"}`, sub: p.carTitle ?? "", status: p.status, ...(PUBLISH_MODE[p.network][p.format ?? "post"] === "prepare" && { heldBy: p.network }) }); // held until the network approves us, not sent
  }
  for (const a of ads) if (a.status !== "draft") add({ id: a.id, kind: "ad", at: a.startedAt ?? a.createdAt, title: `${a.platform} ad`, sub: a.carTitle, status: a.status });
  for (const d of days) out[d].sort((x, y) => x.at - y.at);
  return out;
}

// `dealer`: their name and website, from the directory.
export function writeNewsletter(cars: Car[], voice: Voice, dealer: { name: string; siteUrl: string }): { subject: string; body: string } {
  return {
    subject: cars.length ? `New arrivals at ${dealer.name}` : `News from ${dealer.name}`,
    body: newsletterText(cars.map((c) => ({ name: carName(c), price: priceText(c), link: dealer.siteUrl ? `${dealer.siteUrl}${carHref(c.slug)}` : undefined })), voice),
  };
}
export function newsletterText(cars: Pick<CarFacts, "name" | "price" | "link">[], voice: Voice): string {
  const list = cars.map((c) => `- ${c.name}, ${c.price ?? "ask for the price"}. ${c.link ?? ""}`.trim());
  return [cars.length ? "New in this week:" : "", ...list, "", voice.signOff.trim()].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== "")).join("\n").trim();
}

// What a send or a publish returns. A service that is not connected is a message, never a thrown error and never a pretend success.
export type SendResult = { ok: true; simulated?: boolean } | { ok: false; reason: "not-connected" | "not-installed" };

// The figures a simulated send reports, so the lists and analytics have something to show. Worked out from the record's id, so a
// record always gets the same figures and nothing about a real audience is claimed. Real adapters replace these with the provider's own.
const spread = (id: string, mod: number) => [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 100003, 7) % mod;
export const simulatedPost = (id: string) => ({ reach: 380 + spread(id, 900), clicks: 14 + spread(id + "c", 60) });
export const simulatedAd = (id: string) => ({ impressions: 2400 + spread(id, 6000), clicks: 40 + spread(id + "c", 160), leads: 1 + spread(id + "l", 7) });
export const simulatedLetter = (id: string, subscribers: number) => ({ recipients: subscribers, opens: Math.round(subscribers * (0.38 + spread(id, 12) / 100)), clicks: Math.round(subscribers * (0.05 + spread(id + "c", 6) / 100)) });

// Cars worth a post: new this week, or reduced, with no post for them in the last two weeks. New ones first, newest first. At most three,
// so it reads as a nudge, not a to-do list. Pure, so the rules are tested.
const RECENT_POST = 14 * DAY;
const NEW_FOR = 7 * DAY;
export type PostIdea = { car: Car; reason: "New this week" | "Price dropped" };
export function worthPosting(cars: Car[], posts: Pick<SocialPost, "carSlug" | "createdAt">[], now = Date.now()): PostIdea[] {
  const posted = new Set(posts.filter((p) => p.carSlug && now - p.createdAt < RECENT_POST).map((p) => slugId(p.carSlug!))); // by id: an edit gives the car a new slug
  const open = cars.filter((c) => forSale(c) && !posted.has(c.id));
  const fresh = open.filter((c) => c.listedAt && now - Date.parse(`${c.listedAt}T00:00:00Z`) < NEW_FOR).sort((a, b) => b.listedAt!.localeCompare(a.listedAt!));
  const reduced = open.filter((c) => !fresh.includes(c) && isReduced(c));
  return [...fresh.map((car) => ({ car, reason: "New this week" as const })), ...reduced.map((car) => ({ car, reason: "Price dropped" as const }))].slice(0, 3);
}
