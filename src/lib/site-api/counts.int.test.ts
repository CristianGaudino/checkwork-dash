import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/tenancy/membership", () => vi.importActual("@/lib/tenancy/membership"));
vi.mock("drizzle-orm/d1", () => import("@/test/sqlite-d1"));
vi.mock("@opennextjs/cloudflare", async () => {
  const { env } = await import("@/test/sqlite-d1");
  return { getCloudflareContext: () => ({ env, ctx: { waitUntil: () => {} } }) };
});
const { env } = await import("@/test/sqlite-d1");
const { POST } = await import("@/app/api/site/v1/counts/route");
const { makeSiteKey } = await import("@/lib/tenancy/directory");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { countsBetween, bump } = await import("@/lib/owner-api/counters");
const { addDays, dublinDay } = await import("@/lib/admin/format");

const A = "checkwork-motors";
const B = "test-motors";
let keyA = "";
let keyB = "";
beforeAll(async () => {
  keyA = (await makeSiteKey(A, "Website")).key;
  keyB = (await makeSiteKey(B, "Website")).key;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete env.SITE_LIMITER;
});

const today = dublinDay();
const send = (key: string | null, body: unknown) =>
  POST(new Request("https://x.test/api/site/v1/counts", { method: "POST", headers: { "Content-Type": "application/json", ...(key !== null && { Authorization: `Bearer ${key}` }) }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const seen = (dealer: string, day: string) => runAsDealer(dealer, () => countsBetween(day, day));

describe("POST /api/site/v1/counts", () => {
  it("answers 204 and Analytics' countsBetween sees the counts, for that dealer only", async () => {
    const day = addDays(today, -3);
    const res = await send(keyA, { day, counts: { "visit:google": 7, saved: 2, "filter:make": 4 } });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect((await seen(A, day)).features).toEqual({ "visit:google": 7, saved: 2, "filter:make": 4 });
    expect((await seen(B, day)).features).toEqual({});
  });

  it("replaces the day's counts, never adds, and leaves other days and the dashboard's own counts", async () => {
    const day = addDays(today, -2);
    const other = addDays(today, -1);
    await runAsDealer(A, () => bump("dash:leads", Date.parse(`${day}T12:00:00Z`)));
    await send(keyA, { day, counts: { saved: 5, compare: 1 } });
    await send(keyA, { day: other, counts: { saved: 9 } });
    expect((await send(keyA, { day, counts: { saved: 3 } })).status).toBe(204);
    const got = await seen(A, day);
    expect(got.features).toEqual({ saved: 3 });
    expect(got.dashboard).toEqual({ leads: 1 });
    expect((await seen(A, other)).features).toEqual({ saved: 9 });
  });

  it("drops a name off the allow-list and stores the rest of the day, and never writes a dash: name", async () => {
    const day = addDays(today, -4);
    expect((await send(keyA, { day, counts: { saved: 1, "dash:leads": 1, nope: 1, "visit:made-up": 1 } })).status).toBe(204);
    const got = await seen(A, day);
    expect(got.features).toEqual({ saved: 1 });
    expect(got.dashboard).toEqual({});
  });

  it("caps the numbers and the keys", async () => {
    const day = addDays(today, -5);
    for (const v of [-1, 1.5, 1_000_001, "3", null]) expect((await send(keyA, { day, counts: { saved: v } })).status).toBe(400);
    expect((await send(keyA, { day, counts: { saved: 1_000_000, compare: 0 } })).status).toBe(204);
    const many = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`k${i}`, 1]));
    expect((await send(keyA, { day, counts: many })).status).toBe(400);
  });

  it("takes a day from the last 35 days to today, in Irish time", async () => {
    for (const day of [addDays(today, 1), addDays(today, -36), "2026-02-30", "2026-13-45", "26-1-1", "not a day"]) expect((await send(keyA, { day, counts: {} })).status).toBe(400);
    for (const day of [today, addDays(today, -35)]) expect((await send(keyA, { day, counts: { saved: 1 } })).status).toBe(204);
  });

  it("answers 400 with no body to a body that is not the contract", async () => {
    for (const b of ["{", "[]", {}, { day: today }, { day: today, counts: [] }, { day: today, counts: {}, extra: 1 }]) {
      const res = await send(keyA, b);
      expect(res.status).toBe(400);
      expect(await res.text()).toBe("");
    }
  });

  it("answers 401 to a missing or unknown key and 429 past the rate limit", async () => {
    for (const k of [null, "nonsense", `cw_site_${"x".repeat(43)}`]) expect((await send(k, { day: today, counts: {} })).status).toBe(401);
    env.SITE_LIMITER = { limit: vi.fn(async () => ({ success: false })) };
    expect((await send(keyB, { day: today, counts: {} })).status).toBe(429);
  });
});
