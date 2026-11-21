import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/tenancy/membership", () => vi.importActual("@/lib/tenancy/membership")); // nobody is signed in: only the key names a dealer
// The D1 path, as on the Worker: the directory and each dealer's database on SQLite with the committed migrations (src/test/sqlite-d1.ts).
vi.mock("drizzle-orm/d1", () => import("@/test/sqlite-d1"));
vi.mock("@opennextjs/cloudflare", async () => {
  const { env } = await import("@/test/sqlite-d1");
  return { getCloudflareContext: () => ({ env, ctx: { waitUntil: () => {} } }) };
});
const { drizzle, env, objects } = await import("@/test/sqlite-d1");
const { POST } = await import("@/app/api/site/v1/leads/route");
const { GET } = await import("@/app/api/site/v1/stock/route");
const { GET: PHOTO } = await import("@/app/api/site/v1/photos/[dealer]/[...key]/route");
const { NextRequest } = await import("next/server");
const { storeCarPhoto } = await import("@/lib/admin/car-photos");
const { makeSiteKey, revokeSiteKey, dealerOfSiteKey, siteKeysOf, patchDealer } = await import("@/lib/tenancy/directory");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { leadsStore, costsStore } = await import("@/lib/admin/collections");
const { saveCar, updateCar } = await import("@/lib/admin/stock-admin");
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

  it("logs the route, the dealer, the outcome and the status: never the key, a name, an email or a phone", async () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await send(keyA, body());
    await send(keyA, body(lead({ email: "bad" })));
    await send("cw_site_wrong", body());
    const logged = [...out.mock.calls, ...err.mock.calls, ...warn.mock.calls].map((c) => c.map(String).join(" ")).join(" | ");
    expect(logged).toContain(`"site":"leads","dealerId":"${A}","outcome":"stored","status":201`);
    expect(logged).toContain(`"outcome":"invalid","status":400`);
    expect(logged).toContain(`"outcome":"no-key","status":401`);
    for (const secret of [keyA, "cw_site_", NAME, "Murphy", EMAIL, PHONE, "estates"]) expect(logged).not.toContain(secret);
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

describe("car photos on the website", () => {
  const SECRET = "test-site-photo-secret";
  const STATIC = { src: "/stock/4710001/1.webp", width: 1600, height: 1067 };
  const car = (id: string, photos: { src: string; width: number; height: number }[], over: object = {}) => ({ id, slug: `golf-2020-${id}`, make: "Volkswagen", makeSlug: "volkswagen", model: "Golf", modelSlug: "golf", year: 2020, priceEur: 17950, photos, ...over });
  const stock = async (key: string) => ((await (await GET(new Request("https://x.test/api/site/v1/stock", { headers: { Authorization: `Bearer ${key}` } }))).json()) as { cars: { id: string; photos: { src: string }[] }[] }).cars;
  const srcsOf = async (key: string, id: string) => (await stock(key)).find((c) => c.id === id)?.photos.map((p) => p.src);
  // The route as a browser opens a link: the dealer and key from the path, the signature from the query.
  const open = (link: string) => {
    const url = new URL(link);
    const [dealer, ...key] = url.pathname.replace("/api/site/v1/photos/", "").split("/");
    return PHOTO(new NextRequest(url), { params: Promise.resolve({ dealer, key }) });
  };
  const store = (dealer: string, carId: string) => runAsDealer(dealer, () => storeCarPhoto(carId, new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), 1600, 1200));
  const keyOf = (src: string) => src.replace("/car-photos/", "");
  const withSecret = async <T,>(secret: string | undefined, fn: () => Promise<T>) => {
    const before = process.env.SITE_PHOTO_SECRET;
    if (secret === undefined) delete process.env.SITE_PHOTO_SECRET;
    else process.env.SITE_PHOTO_SECRET = secret;
    try {
      return await fn();
    } finally {
      if (before === undefined) delete process.env.SITE_PHOTO_SECRET;
      else process.env.SITE_PHOTO_SECRET = before;
    }
  };

  it("gives a car on the website its photos as absolute links: signed ones open with a long public cache, a hidden car's are never given", () =>
    withSecret(SECRET, async () => {
      const stored = await store(B, "9300001");
      const draftPhoto = await store(B, "9300002");
      await runAsDealer(B, async () => {
        await saveCar(car("9300001", [stored, STATIC]));
        await saveCar(car("9300002", [draftPhoto], { listing: "draft" }));
      });
      const srcs = (await srcsOf(keyB, "9300001"))!;
      const link = new URL(srcs[0]);
      expect(link.origin).toBe("https://www.dash.checkwork.ie");
      expect(link.pathname).toBe(`/api/site/v1/photos/test-motors/${keyOf(stored.src)}`);
      expect(link.searchParams.get("sig")).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(srcs[1]).toBe(STATIC.src);
      expect(JSON.stringify(await stock(keyB))).not.toContain(keyOf(draftPhoto.src));

      const res = await open(srcs[0]);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/jpeg");
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0xff, 0xd8, 0xff, 1, 2, 3]);
    }));

  it("answers 404 to a tampered signature, dealer or key, and to one dealer's signature on another dealer's photo", () =>
    withSecret(SECRET, async () => {
      const stored = await store(B, "9300003");
      await runAsDealer(B, () => saveCar(car("9300003", [stored])));
      const link = (await srcsOf(keyB, "9300003"))![0];
      expect((await open(link)).status).toBe(200);
      const sig = new URL(link).searchParams.get("sig")!;
      const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
      expect((await open(link.replace(sig, flipped))).status).toBe(404);
      expect((await open(link.replace(/\?sig=.*/, ""))).status).toBe(404);
      expect((await open(link.replace(/\/[0-9a-f-]{36}\.jpg/, `/${crypto.randomUUID()}.jpg`))).status).toBe(404);
      // Dealer A has a car of the same id with a photo at the same key, on its website: B's signature still opens nothing of A's.
      objects.set(`dealers/${A}/${keyOf(stored.src)}`, new Blob([new Uint8Array([9])]));
      await runAsDealer(A, () => saveCar(car("9300003", [stored])));
      expect((await open(link.replace("/test-motors/", `/${A}/`))).status).toBe(404);
      expect((await open(link.replace("/test-motors/", "/nobody/"))).status).toBe(404);
    }));

  it("stops a link once its photo is taken off the car or the car is hidden", () =>
    withSecret(SECRET, async () => {
      const [one, two] = [await store(B, "9300004"), await store(B, "9300004")];
      await runAsDealer(B, () => saveCar(car("9300004", [one, two])));
      const [l1, l2] = (await srcsOf(keyB, "9300004"))!;
      expect((await open(l2)).status).toBe(200);
      // The signature covers the key: the first photo's signature opens nothing at the second's path, both still on the car.
      expect((await open(l2.replace(/sig=.*/, new URL(l1).search.slice(1)))).status).toBe(404);
      await runAsDealer(B, () => updateCar("9300004", (c) => ({ ...c, photos: [one] })));
      expect((await open(l2)).status).toBe(404);
      expect((await open(l1)).status).toBe(200);
      await runAsDealer(B, () => updateCar("9300004", (c) => ({ ...c, listing: "hidden" })));
      expect((await open(l1)).status).toBe(404);
    }));

  it("stops a link while its dealer is paused", () =>
    withSecret(SECRET, async () => {
      const { dealers } = await import("@/lib/db/directory-schema");
      const { eq } = await import("drizzle-orm");
      const stored = await store(B, "9300007");
      await runAsDealer(B, () => saveCar(car("9300007", [stored])));
      const link = (await srcsOf(keyB, "9300007"))![0];
      expect((await open(link)).status).toBe(200);
      await drizzle("DIRECTORY").update(dealers).set({ status: "paused" }).where(eq(dealers.id, B));
      try {
        expect((await open(link)).status).toBe(404);
      } finally {
        await drizzle("DIRECTORY").update(dealers).set({ status: "active" }).where(eq(dealers.id, B));
      }
    }));

  it("signs nothing with no secret, in production too: stored photos are left out and no link opens", async () => {
    const stored = await store(B, "9300005");
    await runAsDealer(B, () => saveCar(car("9300005", [stored, STATIC])));
    const link = await withSecret(SECRET, async () => (await srcsOf(keyB, "9300005"))![0]);
    vi.stubEnv("APP_ENV", "production");
    try {
      await withSecret(undefined, async () => {
        expect(await srcsOf(keyB, "9300005")).toEqual([STATIC.src]);
        expect((await open(link)).status).toBe(404);
      });
      await withSecret("", async () => expect((await open(link)).status).toBe(404));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("never logs a key or a signature, a failure included", () =>
    withSecret(SECRET, async () => {
      const stored = await store(B, "9300006");
      await runAsDealer(B, () => saveCar(car("9300006", [stored])));
      const lines: string[] = [];
      for (const m of ["log", "warn", "error", "info"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" ")));
      const link = (await srcsOf(keyB, "9300006"))![0];
      expect((await open(link)).status).toBe(200);
      expect((await open(link.replace(/sig=(.)/, (_, c: string) => `sig=${c === "A" ? "B" : "A"}`))).status).toBe(404); // always a different first character
      vi.spyOn(env.LEAD_PHOTOS as { get: () => unknown }, "get").mockRejectedValueOnce(new Error(`R2 down for ${link}`));
      expect((await open(link)).status).toBe(500);
      expect(lines.some((l) => l.includes('"photos"') && l.includes('"error"'))).toBe(true);
      const sig = new URL(link).searchParams.get("sig")!;
      for (const l of lines) for (const secret of [keyOf(stored.src), sig, SECRET]) expect(l).not.toContain(secret);
    }));

  // The Workers cache (caches.default) in front of the checks, after the signature: a stub that keeps what it is given.
  describe("with the Workers cache", () => {
    const withCache = async (fn: (c: { kept: Map<string, Response>; calls: string[] }) => Promise<void>) => {
      const kept = new Map<string, Response>();
      const calls: string[] = [];
      vi.stubGlobal("caches", { default: { match: async (u: string) => (calls.push("match"), kept.get(u)?.clone()), put: async (u: string, r: Response) => void (calls.push("put"), kept.set(u, r)) } });
      try {
        await withSecret(SECRET, () => fn({ kept, calls }));
      } finally {
        vi.unstubAllGlobals();
      }
    };
    const linkFor = async (carId: string) => {
      const stored = await store(B, carId);
      await runAsDealer(B, () => saveCar(car(carId, [stored])));
      return (await srcsOf(keyB, carId))![0];
    };

    it("keeps a copy for 10 minutes on a miss; the browser still gets a year", () =>
      withCache(async ({ kept }) => {
        const link = await linkFor("9300008");
        const res = await open(link);
        expect(res.status).toBe(200);
        expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
        expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0xff, 0xd8, 0xff, 1, 2, 3]);
        expect([...kept.keys()]).toEqual([link]);
        expect(kept.get(link)!.headers.get("Cache-Control")).toBe("public, max-age=600");
        expect([...new Uint8Array(await kept.get(link)!.arrayBuffer())]).toEqual([0xff, 0xd8, 0xff, 1, 2, 3]);
      }));

    it("answers a hit without reading D1", () =>
      withCache(async ({ kept }) => {
        const link = await linkFor("9300009");
        kept.set(link, new Response(new Uint8Array([7])));
        const before = { dir: env.DIRECTORY, db: env.DB_TEST_MOTORS };
        Object.assign(env, { DIRECTORY: "unreachable", DB_TEST_MOTORS: "unreachable" }); // any D1 read now throws
        try {
          const res = await open(link);
          expect(res.status).toBe(200);
          expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
          expect(res.headers.get("Content-Type")).toBe("image/jpeg");
          expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([7]);
        } finally {
          Object.assign(env, { DIRECTORY: before.dir, DB_TEST_MOTORS: before.db });
        }
      }));

    it("an extra query parameter finds the same copy, so it cannot skip the cache", () =>
      withCache(async ({ kept }) => {
        const link = await linkFor("9300010");
        kept.set(link, new Response(new Uint8Array([8])));
        const before = { dir: env.DIRECTORY, db: env.DB_TEST_MOTORS };
        Object.assign(env, { DIRECTORY: "unreachable", DB_TEST_MOTORS: "unreachable" }); // a miss would read D1 and throw
        try {
          const res = await open(`${link}&r=${Math.random()}`);
          expect(res.status).toBe(200);
          expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([8]);
          expect([...kept.keys()]).toEqual([link]); // no new entry
        } finally {
          Object.assign(env, { DIRECTORY: before.dir, DB_TEST_MOTORS: before.db });
        }
      }));

    it("never touches the cache for a bad signature", () =>
      withCache(async ({ calls }) => {
        const link = await linkFor("9300010");
        const sig = new URL(link).searchParams.get("sig")!;
        expect((await open(link.replace(sig, (sig[0] === "A" ? "B" : "A") + sig.slice(1)))).status).toBe(404);
        expect((await open(link.replace("/test-motors/", `/${A}/`))).status).toBe(404);
        expect(calls).toEqual([]);
      }));
  });
});
