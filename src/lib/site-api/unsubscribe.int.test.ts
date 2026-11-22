import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/tenancy/membership", () => vi.importActual("@/lib/tenancy/membership")); // nobody is signed in: only the link names a dealer
vi.mock("drizzle-orm/d1", () => import("@/test/sqlite-d1"));
vi.mock("@opennextjs/cloudflare", async () => {
  const { env } = await import("@/test/sqlite-d1");
  return { getCloudflareContext: () => ({ env, ctx: { waitUntil: () => {} } }) };
});
const { env } = await import("@/test/sqlite-d1");
const { GET, POST } = await import("@/app/api/site/unsubscribe/route");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { subscribersStore, alertsStore } = await import("@/lib/admin/collections");
const { listActivity } = await import("@/lib/admin/activity");
const { unsubscribeLink, listUnsubscribeHeaders, ONE_CLICK } = await import("@/lib/unsubscribe");
const { readdirSync } = await import("node:fs");

const A = "checkwork-motors";
const B = "test-motors";
beforeAll(() => {
  vi.stubEnv("UNSUBSCRIBE_SECRET", "int-secret");
  vi.stubEnv("APP_URL", "https://x.test");
});
afterEach(() => {
  delete env.SITE_LIMITER;
});
const subscribed = async () => (await runAsDealer(A, () => subscribersStore.list())).find((s) => s.status === "subscribed")!;
const status = (dealer: string, id: string) => runAsDealer(dealer, async () => (await subscribersStore.get(id))?.status);
const get = (link: string) => GET(new Request(link));
const post = (link: string, body = "") => POST(new Request(link, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }));
const INVALID = "This link isn&#39;t valid any more";

describe("/api/site/unsubscribe", () => {
  it("GET shows a confirm page and changes nothing, however often a scanner opens it", async () => {
    const s = await subscribed();
    const link = await unsubscribeLink(A, "newsletter", s.id);
    for (let i = 0; i < 3; i++) {
      const res = await get(link);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Stop these emails");
      expect(html).toContain("Checkwork Motors");
      expect(html).not.toContain(s.email);
    }
    expect(await status(A, s.id)).toBe("subscribed");
  });

  it("POST turns the subscription off, shows the done page, and a second POST is fine", async () => {
    const s = await subscribed();
    const link = await unsubscribeLink(A, "newsletter", s.id);
    const res = await post(link);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("You won&#39;t get these emails again");
    expect(await status(A, s.id)).toBe("unsubscribed");
    expect((await post(link)).status).toBe(200);
    expect(await status(A, s.id)).toBe("unsubscribed");
  });

  it("takes RFC 8058's one-click POST from a mail provider", async () => {
    const s = await subscribed();
    const link = await unsubscribeLink(A, "newsletter", s.id);
    expect(listUnsubscribeHeaders(link)["List-Unsubscribe-Post"]).toBe(ONE_CLICK);
    expect((await post(link, ONE_CLICK)).status).toBe(200);
    expect(await status(A, s.id)).toBe("unsubscribed");
  });

  it("pauses a stock alert, and the activity log has no email in it", async () => {
    const a = (await runAsDealer(A, () => alertsStore.list())).find((x) => x.active)!;
    expect((await post(await unsubscribeLink(A, "alert", a.id))).status).toBe(200);
    expect((await runAsDealer(A, () => alertsStore.get(a.id)))?.active).toBe(false);
    const log = await runAsDealer(A, () => listActivity({ area: "customers" }, 1, 50));
    const mine = log.rows.filter((r) => r.refId === a.id);
    expect(mine).toMatchObject([{ actor: "The subscriber", summary: "Paused the stock alert" }]);
    for (const r of log.rows) expect(JSON.stringify(r)).not.toContain("@");
  });

  it("refuses a tampered, other-dealer, other-kind or unknown link with the same plain page, and changes nothing", async () => {
    const s = await subscribed();
    const link = await unsubscribeLink(A, "newsletter", s.id);
    const swap = (k: string, v: string) => {
      const x = new URL(link);
      x.searchParams.set(k, v);
      return x.toString();
    };
    const u = new URL(link);
    const sig = u.searchParams.get("sig")!;
    const bad = [swap("sig", (sig[0] === "A" ? "B" : "A") + sig.slice(1)), swap("d", B), swap("k", "alert"), swap("id", "sub-nope"), link.replace(/&sig=.*/, ""), `${u.origin}${u.pathname}`, await unsubscribeLink(A, "newsletter", "sub-9999")];
    for (const l of bad) {
      for (const send of [get, post]) {
        const res = await send(l);
        expect(res.status, l).toBe(404);
        expect(await res.text()).toContain(INVALID);
      }
    }
    expect(await status(A, s.id)).toBe("subscribed");
  });

  it("never reaches into another dealer's store", async () => {
    await runAsDealer(B, () => subscribersStore.put({ id: "sub-b1", email: "b@example.com", status: "subscribed", createdAt: 1 }));
    expect((await post(await unsubscribeLink(A, "newsletter", "sub-b1"))).status).toBe(404); // A's signature on B's record id: no such record in A
    expect(await status(B, "sub-b1")).toBe("subscribed");
    expect((await post(await unsubscribeLink(B, "newsletter", "sub-b1"))).status).toBe(200);
    expect(await status(B, "sub-b1")).toBe("unsubscribed");
  });

  it("answers 429 over the limit, and 404 with no secret set", async () => {
    const s = await subscribed();
    const link = await unsubscribeLink(A, "newsletter", s.id);
    env.SITE_LIMITER = { limit: async () => ({ success: false }) };
    expect((await post(link)).status).toBe(429);
    expect((await get(link)).status).toBe(200); // viewing is not limited: mail scanners share addresses
    delete env.SITE_LIMITER;
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    expect((await post(link)).status).toBe(404);
    vi.stubEnv("UNSUBSCRIBE_SECRET", "int-secret");
  });

  it("answers 500, never the not-valid page, when the store is down", async () => {
    const s = await subscribed();
    const link = await unsubscribeLink(A, "newsletter", s.id);
    const down = vi.spyOn(subscribersStore, "get").mockRejectedValue(new Error("D1 down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await get(link)).status).toBe(500);
    expect((await post(link)).status).toBe(500);
    down.mockRestore();
    expect((await get(link)).status).toBe(200);
  });

  it("is the only route under /api/site besides v1 (whose routes need a website key)", () => {
    expect(readdirSync("src/app/api/site").sort()).toEqual(["unsubscribe", "v1"]);
    expect(readdirSync("src/app/api/site/unsubscribe")).toEqual(["route.ts"]);
  });
});
