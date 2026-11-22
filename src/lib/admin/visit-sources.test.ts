import { describe, expect, it } from "vitest";
import { CHANNELS } from "@/lib/visit-rules";
import { buildAnalytics } from "./analytics";
import { visitorFigures } from "./visitor-figures";
import { ratePer100, sourceGroups, sourceTiles, type ChannelCount } from "./visit-sources";

const now: ChannelCount[] = [
  { channel: "google", visits: 200, leads: 4 },
  { channel: "bing", visits: 10, leads: 1 },
  { channel: "facebook", visits: 80, leads: 6 },
  { channel: "instagram", visits: 3, leads: 0 },
  { channel: "tiktok", visits: 0, leads: 0 },
  { channel: "email", visits: 0, leads: 1 }, // a lead whose visit was counted the period before
  { channel: "direct", visits: 0, leads: 0 },
];
const before = [
  { channel: "google", visits: 160 },
  { channel: "bing", visits: 10 },
  { channel: "facebook", visits: 100 },
  { channel: "instagram", visits: 8 },
  { channel: "tiktok", visits: 20 },
] as const;
const tiles = sourceTiles(now, [...before]);
const byChannel = (c: string) => tiles.find((t) => t.channel === c)!;

describe("leads per 100 visits", () => {
  it("is leads over visits, to one decimal, and none without visits", () => {
    expect(ratePer100(4, 200)).toBe(2);
    expect(ratePer100(1, 3)).toBe(33.3);
    expect(ratePer100(2, 0)).toBeNull();
    expect(byChannel("facebook").rate).toBe(7.5);
    expect(byChannel("email").rate).toBeNull();
  });
});

describe("sourceTiles", () => {
  it("leaves out the channels with nothing this period, busiest first", () => {
    expect(tiles.map((t) => t.channel)).toEqual(["google", "facebook", "bing", "instagram", "email"]);
    expect(byChannel("google").label).toBe("Google");
    expect(sourceTiles([{ channel: "direct", visits: 1, leads: 0 }], [])[0].label).toBe("Typed in");
  });
  it("gives the change on the period before, and too few to compare under 5 either side", () => {
    expect(byChannel("google")).toMatchObject({ change: "Up 25% on the period before", trend: "up" });
    expect(byChannel("facebook")).toMatchObject({ change: "Down 20% on the period before", trend: "down" });
    expect(byChannel("bing")).toMatchObject({ change: "The same as the period before", trend: null });
    expect(byChannel("instagram")).toMatchObject({ change: "Too few to compare", trend: null });
    expect(sourceTiles(now, [...before], "month")[0].change).toBe("Up 25% on the month before");
    expect(sourceTiles([{ channel: "google", visits: 772, leads: 0 }], [{ channel: "google", visits: 770 }])[0]).toMatchObject({ change: "The same as the period before", trend: null }); // rounds to 0%
  });
  it("marks the channel with the most leads as best, the better rate breaking a tie, and none when there are no leads", () => {
    expect(tiles.filter((t) => t.best).map((t) => t.channel)).toEqual(["facebook"]);
    const tie = sourceTiles([{ channel: "google", visits: 100, leads: 2 }, { channel: "bing", visits: 10, leads: 2 }], []);
    expect(tie.find((t) => t.best)?.channel).toBe("bing");
    expect(sourceTiles([{ channel: "google", visits: 100, leads: 0 }], []).some((t) => t.best)).toBe(false);
    expect(sourceTiles([], [])).toEqual([]);
  });
});

describe("sourceGroups", () => {
  const groups = sourceGroups(tiles, [...before]);
  it("groups the channels, adds them up and leaves out empty groups, busiest first", () => {
    expect(groups.map((g) => [g.label, g.channels.map((t) => t.channel)])).toEqual([
      ["Search", ["google", "bing"]],
      ["Social", ["facebook", "instagram"]],
      ["Email", ["email"]],
    ]);
    expect(groups[0]).toMatchObject({ visits: 210, leads: 5, rate: 2.4, before: 170 });
  });
  it("compares a group with all its channels the period before, also one with nothing now", () => {
    expect(groups[1]).toMatchObject({ visits: 83, before: 128, change: "Down 35% on the period before", trend: "down" }); // TikTok's 20 count
  });
  it("marks the group holding the best channel", () => {
    expect(groups.filter((g) => g.best).map((g) => g.id)).toEqual(["social"]);
  });
});

describe("the demo's sample", () => {
  it("has the same shape as the real counts: every channel, with visits and leads, and the period before", () => {
    const a = buildAnalytics({ range: 30, cars: [], now: Date.UTC(2026, 10, 10) });
    const real = visitorFigures({ counts: {}, leads: [], alerts: [] });
    expect(a.channels.map((c) => c.channel).sort()).toEqual([...CHANNELS].sort());
    expect(Object.keys(a.channels[0]).sort()).toEqual(Object.keys(real.channels[0]).sort());
    expect(a.previous.channels.map((c) => c.channel).sort()).toEqual([...CHANNELS].sort());
    // Each channel moves on its own, so the tiles do not all say the same change.
    expect(new Set(sourceTiles(a.channels, a.previous.channels).map((t) => t.change)).size).toBeGreaterThan(2);
  });
});
