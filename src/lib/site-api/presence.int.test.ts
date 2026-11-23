import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/tenancy/membership", () => vi.importActual("@/lib/tenancy/membership"));
vi.mock("drizzle-orm/d1", () => import("@/test/sqlite-d1"));
vi.mock("@opennextjs/cloudflare", async () => {
  const { env } = await import("@/test/sqlite-d1");
  return { getCloudflareContext: () => ({ env, ctx: { waitUntil: () => {} } }) };
});
// Real dealers here: the demo's figure is made up (simulatedActive, below).
vi.mock("@/lib/integrations", () => ({ simulating: async () => false }));
const { POST } = await import("@/app/api/site/v1/presence/route");
const { makeSiteKey } = await import("@/lib/tenancy/directory");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { activeNow, presence, receivePresence, simulatedActive, KEEP_MS } = await import("./presence");

const A = "checkwork-motors";
const B = "test-motors";
let keyA = "";
beforeAll(async () => {
  keyA = (await makeSiteKey(A, "Website")).key;
});
const send = (key: string | null, body: unknown) =>
  POST(new Request("https://x.test/api/site/v1/presence", { method: "POST", headers: { "Content-Type": "application/json", ...(key !== null && { Authorization: `Bearer ${key}` }) }, body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("POST /api/site/v1/presence", () => {
  it("turns away no key, a bad body and a big one, and counts a tab once for that dealer only", async () => {
    expect(await runAsDealer(A, () => activeNow())).toBeNull();
    expect((await send(null, { tab: "tab-aaaaaaaa" })).status).toBe(401);
    expect((await send(keyA, "nope")).status).toBe(400);
    expect((await send(keyA, { tab: "short" })).status).toBe(400);
    expect((await send(keyA, { tab: "tab aaaaaaaa" })).status).toBe(400);
    expect((await send(keyA, { tab: "tab-aaaaaaaa", ip: "1.2.3.4" })).status).toBe(400);
    expect((await send(keyA, { tab: "x".repeat(300) })).status).toBe(413);
    expect((await send(keyA, { tab: "tab-aaaaaaaa" })).status).toBe(204);
    expect((await send(keyA, { tab: "tab-aaaaaaaa" })).status).toBe(204);
    expect((await send(keyA, { tab: "tab-bbbbbbbb" })).status).toBe(204);
    expect(await runAsDealer(A, () => activeNow())).toBe(2);
    expect(await runAsDealer(B, () => activeNow())).toBeNull();
  });

  it("stops counting a quiet tab after 30 minutes and deletes it after 35", async () => {
    const t = Date.now() + 60 * 60_000;
    await runAsDealer(A, async () => {
      await receivePresence(JSON.stringify({ tab: "tab-quiet-00" }), t);
      await receivePresence(JSON.stringify({ tab: "tab-busy-000" }), t + 31 * 60_000);
      expect(await activeNow(t + 31 * 60_000)).toBe(1);
      await receivePresence(JSON.stringify({ tab: "tab-busy-000" }), t + KEEP_MS + 1);
      expect((await presence.list()).map((s) => s.id)).not.toContain("tab-quiet-00");
      expect(await activeNow(t + 120 * 60_000)).toBe(0); // the website has pinged before: 0, not null
    });
  });
});

describe("simulatedActive", () => {
  it("is small, whole, the same within a minute and close to the minute before", () => {
    const t0 = Date.UTC(2026, 10, 23, 12, 0);
    for (let m = 0; m < 240; m++) {
      const n = simulatedActive(t0 + m * 60_000);
      expect(Number.isInteger(n) && n >= 4 && n <= 16).toBe(true);
      expect(simulatedActive(t0 + m * 60_000 + 59_000)).toBe(n);
      if (m) expect(Math.abs(n - simulatedActive(t0 + (m - 1) * 60_000))).toBeLessThanOrEqual(3);
    }
  });
});
