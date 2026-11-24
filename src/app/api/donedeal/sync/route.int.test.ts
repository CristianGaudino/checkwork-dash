import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/tenancy/membership", () => vi.importActual("@/lib/tenancy/membership")); // nobody is signed in: the cron names the dealer
vi.mock("drizzle-orm/d1", () => import("@/test/sqlite-d1"));
vi.mock("@opennextjs/cloudflare", async () => {
  const { env } = await import("@/test/sqlite-d1");
  return { getCloudflareContext: () => ({ env, ctx: { waitUntil: () => {} } }) };
});
const { POST } = await import("./route");
const { patchDealer } = await import("@/lib/tenancy/directory");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { enabledModules } = await import("@/lib/modules");

const B = "test-motors";
const call = () => POST(new Request(`https://x.test/api/donedeal/sync?dealer=${B}`, { method: "POST", headers: { authorization: "Bearer k" } }));

describe("the listing site sync for a website-only dealer", () => {
  it("runs for a dealer whose stock is synced, without the dashboard module, and not for one whose stock is kept here", async () => {
    vi.stubEnv("CRON_KEY", "k");
    try {
      expect((await call()).status).toBe(404); // stock kept here
      await patchDealer(B, "Test Motors", { modules: "tradeIn", stock: { source: "donedeal", listingSite: "DoneDeal", listingUrl: "https://www.donedeal.ie/" } });
      expect((await runAsDealer(B, enabledModules)).has("dashboard")).toBe(false);
      const res = await call();
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: false, held: false }); // it ran: no listing site key here, so it changed nothing
    } finally {
      await patchDealer(B, "Test Motors", null);
      vi.unstubAllEnvs();
    }
  });
});
