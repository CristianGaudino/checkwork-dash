import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/integrations", () => ({ simulating: async () => false }));
const countsBetween = vi.fn(async (from: string) => ({ features: from === "2026-03-01" ? { "visit:google": 40 } : { "visit:google": 30 }, dashboard: {} }));
vi.mock("@/lib/owner-api/counters", () => ({ countsBetween: (from: string) => countsBetween(from) }));

const { realVisitSources } = await import("./visit-sources-load");
const now = Date.UTC(2026, 2, 29, 23, 30); // 00:30 Irish summer time, 30 March 2026

describe("realVisitSources", () => {
  it("reads only the period before when given this period's counts, and the same windows as visitWindows", async () => {
    countsBetween.mockClear();
    const r = await realVisitSources(30, now, [], { "visit:google": 12 });
    expect(countsBetween.mock.calls.map((c) => c[0])).toEqual(["2026-01-30"]);
    expect(r.now.find((c) => c.channel === "google")?.visits).toBe(12);
    expect(r.before.find((c) => c.channel === "google")?.visits).toBe(30);
  });
  it("reads nothing when given both periods' counts (Analytics reads them alongside its own)", async () => {
    countsBetween.mockClear();
    const r = await realVisitSources(30, now, [], { "visit:google": 12 }, { "visit:google": 7 });
    expect(countsBetween).not.toHaveBeenCalled();
    expect(r.before.find((c) => c.channel === "google")?.visits).toBe(7);
  });
  it("reads both windows when it has no counts", async () => {
    countsBetween.mockClear();
    const r = await realVisitSources(30, now, []);
    expect(countsBetween.mock.calls.map((c) => c[0]).sort()).toEqual(["2026-01-30", "2026-03-01"]);
    expect(r.now.find((c) => c.channel === "google")?.visits).toBe(40);
  });
  it("leaves a closed enquiry out of a channel's leads (#55)", async () => {
    const { CHANNEL_LABELS } = await import("@/lib/visit-rules");
    const lead = (status: string) => ({ type: "enquiry", source: "Website", channel: CHANNEL_LABELS.google, status, createdAt: now - 3_600_000 }) as unknown as import("./collections").Lead;
    const r = await realVisitSources(30, now, [lead("new"), lead("closed")], { "visit:google": 12 }, {});
    expect(r.now.find((c) => c.channel === "google")?.leads).toBe(1);
  });
});
