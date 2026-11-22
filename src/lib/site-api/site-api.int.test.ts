import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/tenancy/membership", () => vi.importActual("@/lib/tenancy/membership")); // nobody is signed in: only the key names a dealer
// The D1 path, as on the Worker: the directory and each dealer's database on SQLite with the committed migrations (src/test/sqlite-d1.ts).
vi.mock("drizzle-orm/d1", () => import("@/test/sqlite-d1"));
vi.mock("@opennextjs/cloudflare", async () => {
  const { env } = await import("@/test/sqlite-d1");
  return { getCloudflareContext: () => ({ env }) };
});
const { drizzle, env } = await import("@/test/sqlite-d1");
const { POST } = await import("@/app/api/site/v1/leads/route");
const { GET } = await import("@/app/api/site/v1/stock/route");
const { makeSiteKey, revokeSiteKey, dealerOfSiteKey, siteKeysOf, patchDealer } = await import("@/lib/tenancy/directory");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { leadsStore, costsStore } = await import("@/lib/admin/collections");
const { saveCar } = await import("@/lib/admin/stock-admin");
const { leads } = await import("@/lib/db/schema");
const { siteKeys } = await import("@/lib/db/directory-schema");

const A = "checkwork-motors"; // the demo dealer
const B = "test-motors";
let keyA = "";
let keyB = "";
beforeAll(async () => {
  keyA = (await makeSiteKey(A, "Website")).key;
  keyB = (await makeSiteKey(B, "Website")).key;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete env.SITE_LIMITER;
});

const NAME = "Mary Murphy";
const EMAIL = "mary.murphy@example.com";
const PHONE = "087 123 4567";
const lead = (over: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  clientRef: crypto.randomUUID(),
  type: "general",
  carId: null,
  carSlug: null,
  carTitle: null,
  carPriceEur: null,
  sourcePath: "/contact",
  name: NAME,
  phone: PHONE,
  email: EMAIL,
  message: "Do you have any estates coming in?",
  details: { channel: "Google" },
  consentAt: Date.now(),
  consentVersion: "2026-11-10",
  createdAt: Date.now(),
  ...over,
});
const send = (key: string | null, body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("https://x.test/api/site/v1/leads", { method: "POST", headers: { "Content-Type": "application/json", ...(key !== null && { Authorization: `Bearer ${key}` }), ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const body = (l: object = lead(), over: object = {}) => ({ lead: l, emailed: true, photoCount: 0, ...over });
const rowsIn = async (binding: string, clientRef: string) => (await drizzle(binding).select().from(leads)).filter((r) => r.clientRef === clientRef);

describe("POST /api/site/v1/leads", () => {
  it("stores a valid lead in the key's dealer's table and inbox, and nowhere else", async () => {
    const l = lead({ details: { channel: "Google" } });
    const res = await send(keyA, body(l, { photoCount: 2 }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect(await rowsIn("DB_CHECKWORK_MOTORS", l.clientRef)).toMatchObject([{ id, name: NAME, email: EMAIL, details: { channel: "Google" }, consentVersion: "2026-11-10" }]);
    expect((await rowsIn("DB_CHECKWORK_MOTORS", l.clientRef))[0].notifiedAt).not.toBeNull(); // the website emailed the dealer
    expect(await rowsIn("DB_TEST_MOTORS", l.clientRef)).toEqual([]);
    const inbox = await runAsDealer(A, () => leadsStore.get(`real-${id}`));
    expect(inbox).toMatchObject({ name: NAME, source: "Website", status: "new", notes: [{ text: "Sent with 2 photos, kept by your website." }] });
    expect((await runAsDealer(B, () => leadsStore.list())).some((x) => x.name === NAME)).toBe(false);
  });

  it("answers a retry of the same clientRef with 200 and the same id, and stores it once", async () => {
    const l = lead();
    const first = await send(keyA, body(l));
    const again = await send(keyA, body({ ...l, id: crypto.randomUUID() }));
    expect([first.status, again.status]).toEqual([201, 200]);
    expect((await again.json()).id).toBe((await first.json()).id);
    expect(await rowsIn("DB_CHECKWORK_MOTORS", l.clientRef)).toHaveLength(1);
  });

  it("puts a lead sent with B's key in B, never in A, whatever the lead says", async () => {
    const l = lead({ sourcePath: "/contact", details: { dealer: A, channel: "Google" } });
    expect((await send(keyB, body(l))).status).toBe(201);
    expect(await rowsIn("DB_TEST_MOTORS", l.clientRef)).toHaveLength(1);
    expect(await rowsIn("DB_CHECKWORK_MOTORS", l.clientRef)).toEqual([]);
    expect((await runAsDealer(A, () => leadsStore.list())).some((x) => x.message.includes("estates") && x.createdAt === l.consentAt)).toBe(false);
  });

  it("answers 401 with no body to a missing, malformed, unknown or revoked key", async () => {
    const { key, siteKey } = await makeSiteKey(A, "Old website");
    await revokeSiteKey(A, siteKey.id);
    for (const k of [null, "", "nonsense", `cw_site_${"x".repeat(43)}`, key]) {
      const res = await send(k, body());
      expect(res.status).toBe(401);
      expect(await res.text()).toBe("");
    }
    const res = await POST(new Request("https://x.test/api/site/v1/leads", { method: "POST", headers: { Authorization: `Basic ${keyA}` }, body: JSON.stringify(body()) }));
    expect(res.status).toBe(401);
  });

  it("answers 413 to a body over 64 KB, by its Content-Length or by what arrives", async () => {
    const big = JSON.stringify(body(lead({ message: "x".repeat(70_000) })));
    expect((await send(keyA, big)).status).toBe(413);
    // A body that says it is small: counted as it is read.
    expect((await send(keyA, big, { "Content-Length": "100" })).status).toBe(413);
    const stream = new ReadableStream({ start: (c) => (c.enqueue(new TextEncoder().encode(big)), c.close()) });
    const res = await POST(new Request("https://x.test/api/site/v1/leads", { method: "POST", headers: { Authorization: `Bearer ${keyA}` }, body: stream, duplex: "half" } as RequestInit));
    expect(res.status).toBe(413);
    expect(await res.text()).toBe("");
  });

  it("answers 400 with no detail to a body that is not the contract or breaks the lead rules, and stores nothing", async () => {
    const bad = [
      "not json",
      {},
      { lead: lead() }, // no emailed or photoCount
      body(lead(), { extra: 1 }),
      body({ ...lead(), dealerId: B }), // a field the contract does not have
      body(lead({ email: "not an email", phone: null })),
      body(lead({ name: "Mary\nPhone: 01 000 0000" })),
      body(lead({ type: "enquiry", carId: null })), // an enquiry is about a car
      body(lead({ type: "nonsense" })),
      body(lead({ sourcePath: "https://evil.example/" })),
      body(lead({ consentAt: null })),
      body(lead({ consentVersion: "" })),
      body(Object.fromEntries(Object.entries(lead()).filter(([k]) => k !== "consentVersion"))),
    ];
    for (const b of bad) {
      const res = await send(keyA, b);
      expect(res.status, JSON.stringify(b).slice(0, 80)).toBe(400);
      expect(await res.text()).toBe("");
    }
  });

  it("answers 429 past the key's rate limit", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    env.SITE_LIMITER = { limit };
    expect((await send(keyA, body())).status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: (await dealerOfSiteKey(keyA))!.keyId }); // per key, never the key itself
  });

  const JOURNEY = { v: 1, minutes: 14, cars: [{ id: "4508173", views: 3 }], searches: [{ make: "toyota", body: "suv", priceBand: "20k-30k" }], tools: { finance: { monthlyEur: 320 }, saved: 2 } };
  it("keeps the visit note with the lead in the dealer's inbox", async () => {
    const res = await send(keyA, body(lead(), { journey: JOURNEY }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect(await runAsDealer(A, () => leadsStore.get(`real-${id}`))).toMatchObject({ journey: JOURNEY });
  });

  it("stores the lead without its note when the note is bad, too big or of a version it does not know", async () => {
    for (const journey of [{ ...JOURNEY, v: 2 }, { ...JOURNEY, url: "https://x.ie" }, { ...JOURNEY, searches: [{ make: "Toyota Corolla" }] }, { ...JOURNEY, cars: Array.from({ length: 300 }, (_, i) => ({ id: String(i), views: 1 })) }, "no"]) {
      const res = await send(keyA, body(lead(), { journey }));
      expect(res.status).toBe(201);
      const stored = await runAsDealer(A, async () => leadsStore.get(`real-${(await res.json()).id}`));
      expect(stored).toMatchObject({ name: NAME });
      expect(stored).not.toHaveProperty("journey");
    }
  });

  it("logs the route, the dealer, the outcome and the status: never the key, a name, an email or a phone", async () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await send(keyA, body());
    await send(keyA, body(lead(), { journey: JOURNEY }));
    await send(keyA, body(lead(), { journey: { ...JOURNEY, v: 9 } }));
    await send(keyA, body(lead({ email: "bad" })));
    await send("cw_site_wrong", body());
    const logged = [...out.mock.calls, ...err.mock.calls, ...warn.mock.calls].map((c) => c.map(String).join(" ")).join(" | ");
    expect(logged).toContain(`"site":"leads","dealerId":"${A}","outcome":"stored","status":201`);
    expect(logged).toContain(`"outcome":"invalid","status":400`);
    expect(logged).toContain(`"outcome":"no-key","status":401`);
    for (const secret of [keyA, "cw_site_", NAME, "Murphy", EMAIL, PHONE, "estates", "4508173", "toyota", "journey", "320"]) expect(logged).not.toContain(secret);
  });
});

describe("GET /api/site/v1/stock", () => {
  const car = (id: string, over: object = {}) => ({ id, slug: `skoda-octavia-2021-${id}`, make: "Skoda", makeSlug: "skoda", model: "Octavia", modelSlug: "octavia", year: 2021, priceEur: 18950, photos: [], ...over });
  const get = (key: string) => GET(new Request("https://x.test/api/site/v1/stock", { headers: { Authorization: `Bearer ${key}` } }));
  const today = new Date().toISOString().slice(0, 10);

  it("gives the key's dealer's cars on their website only, with the public fields only", async () => {
    await runAsDealer(B, async () => {
      await saveCar(car("9100001"));
      await saveCar(car("9100002", { soldAt: today, listingUrl: "https://www.donedeal.ie/x", takenDownAt: today }));
      await saveCar(car("9100003", { listing: "hidden" }));
      await saveCar(car("9100004", { soldAt: "2001-01-01" }));
      await costsStore.put({ id: "9100001", buyPriceEur: 12000, prep: [] } as never);
    });
    await runAsDealer(A, () => saveCar(car("9200001")));
    const res = await get(keyB);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");
    const { cars } = (await res.json()) as { cars: Record<string, unknown>[] };
    expect(cars.map((c) => c.id).sort()).toEqual(["9100001", "9100002"]);
    const text = JSON.stringify(cars);
    for (const hidden of ["listing", "listingUrl", "takenDownAt", "buyPriceEur", "prep", "cost", "margin", "notes"]) expect(text).not.toContain(`"${hidden}"`);
    expect(text).not.toContain("9200001");
  });

  it("answers 404 for a dealer whose stock is synced from a listing site, and 401 with no key", async () => {
    await patchDealer(B, "Test Motors", { stock: { source: "donedeal", listingSite: "DoneDeal", listingUrl: "https://www.donedeal.ie/" } });
    try {
      const res = await get(keyB);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("");
    } finally {
      await patchDealer(B, "Test Motors", null);
    }
    expect((await get("nope")).status).toBe(401);
  });
});

describe("website keys in the directory", () => {
  it("are kept as a SHA-256 hash, never the key", async () => {
    const { key, siteKey } = await makeSiteKey(B, "Second site");
    const [row] = (await drizzle("DIRECTORY").select().from(siteKeys)).filter((r) => r.id === siteKey.id);
    expect(row.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(key.slice(8));
    expect(JSON.stringify(await siteKeysOf(B))).not.toContain(row.hash);
  });

  it("note when a key was last used at most once an hour", async () => {
    const { key, siteKey } = await makeSiteKey(B, "Busy site");
    const used = async () => (await siteKeysOf(B)).find((k) => k.id === siteKey.id)!.lastUsedAt;
    vi.useFakeTimers({ toFake: ["Date"], now: Date.UTC(2026, 10, 21, 9, 0) });
    await dealerOfSiteKey(key);
    const first = await used();
    expect(first).toBe(Date.UTC(2026, 10, 21, 9, 0));
    vi.setSystemTime(Date.UTC(2026, 10, 21, 9, 50));
    await dealerOfSiteKey(key);
    expect(await used()).toBe(first);
    vi.setSystemTime(Date.UTC(2026, 10, 21, 10, 5));
    await dealerOfSiteKey(key);
    expect(await used()).toBe(Date.UTC(2026, 10, 21, 10, 5));
  });

  it("a revoked key, or one of a paused dealer, names no dealer; one dealer cannot revoke another's key", async () => {
    const { key, siteKey } = await makeSiteKey(B, "Shared nothing");
    expect(await revokeSiteKey(A, siteKey.id)).toBeUndefined();
    expect((await dealerOfSiteKey(key))?.dealer.id).toBe(B);
    const { dealers } = await import("@/lib/db/directory-schema");
    const { eq } = await import("drizzle-orm");
    await drizzle("DIRECTORY").update(dealers).set({ status: "paused" }).where(eq(dealers.id, B));
    expect(await dealerOfSiteKey(key)).toBeNull();
    await drizzle("DIRECTORY").update(dealers).set({ status: "active" }).where(eq(dealers.id, B));
    expect((await revokeSiteKey(B, siteKey.id))?.label).toBe("Shared nothing");
    expect(await dealerOfSiteKey(key)).toBeNull();
  });
});

describe("a lead the website could not email", () => {
  it("is stored and marked in the inbox as not emailed when the dealer has no lead email either", async () => {
    const l = lead();
    const res = await send(keyB, body(l, { emailed: false }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect((await rowsIn("DB_TEST_MOTORS", l.clientRef))[0].notifiedAt).toBeNull();
    expect((await runAsDealer(B, () => leadsStore.get(`real-${id}`)))?.notes).toMatchObject([{ text: "The email about this lead didn't reach you. Reply from here." }]);
  });
});
