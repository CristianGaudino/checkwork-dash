import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
const { ownerSiteKeys } = await import("./site-keys");
const { dealerOfSiteKey, siteKeysOf } = await import("@/lib/tenancy/directory");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { listActivity } = await import("@/lib/admin/activity");

const call = (method: string, dealer: string, keyId?: string, body?: unknown, token = "right") =>
  ownerSiteKeys(new Request("https://x.test/api/owner/v1/x", { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body: body === undefined ? undefined : JSON.stringify(body) }), dealer, keyId);

beforeEach(() => vi.stubEnv("OWNER_API_TOKEN", "right"));
afterEach(() => vi.unstubAllEnvs());

describe("owner API website keys", () => {
  it("refuses a missing or wrong token and makes nothing", async () => {
    const before = await siteKeysOf("test-motors");
    expect((await call("POST", "test-motors", undefined, { label: "X" }, "wrong")).status).toBe(404);
    expect((await call("GET", "test-motors", undefined, undefined, "")).status).toBe(404);
    expect(await siteKeysOf("test-motors")).toEqual(before);
  });
  it("answers 404 for an unknown dealer, 400 for a bad label", async () => {
    expect((await call("GET", "nobody")).status).toBe(404);
    for (const label of ["", "  ", "x".repeat(61), "a\nb", 5]) expect((await call("POST", "test-motors", undefined, { label })).status).toBe(400);
  });
  it("makes a key shown once, lists it without the key, logs it as Checkwork, and revokes it for that dealer only", async () => {
    const made = await call("POST", "test-motors", undefined, { label: "Main website" });
    expect(made.status).toBe(201);
    const { key, id } = await made.json();
    expect(key).toMatch(/^cw_site_[A-Za-z0-9_-]{43}$/);
    expect((await dealerOfSiteKey(key))?.dealer.id).toBe("test-motors");
    const list = await (await call("GET", "test-motors")).text();
    expect(list).toContain(id);
    expect(list).not.toContain(key);
    expect((await call("DELETE", "checkwork-motors", id)).status).toBe(404); // another dealer's key is not found
    expect((await call("DELETE", "test-motors", id)).status).toBe(204);
    expect((await call("DELETE", "test-motors", id)).status).toBe(404); // already revoked
    expect(await dealerOfSiteKey(key)).toBeNull();
    const log = await runAsDealer("test-motors", () => listActivity({ area: "settings" }, 1, 20));
    expect(log.rows.slice(0, 2).map((r) => [r.actor, r.summary])).toEqual([["Checkwork", "Revoked the website key: Main website"], ["Checkwork", "Made a website key: Main website"]]);
  });
});
