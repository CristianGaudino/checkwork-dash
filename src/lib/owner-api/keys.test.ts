import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
const { ownerKeys } = await import("./keys");
const { secretFor, savedNamesNow } = await import("@/lib/dealer-secrets");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { listActivity } = await import("@/lib/admin/activity");

const KEY = Buffer.alloc(32, 9).toString("base64");
const TOKEN = "EAAB-super-secret-token-123";
const META = { META_PAGE_ID: "111", META_PAGE_ACCESS_TOKEN: TOKEN, META_INSTAGRAM_ID: "222" };
const call = (method: string, dealer: string, service?: string, body?: unknown, token = "right") =>
  ownerKeys(new Request("https://x.test/api/owner/v1/x", { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body: body === undefined ? undefined : JSON.stringify(body) }), dealer, service);

beforeEach(() => {
  vi.stubEnv("OWNER_API_TOKEN", "right");
  vi.stubEnv("DEALER_SECRETS_KEY", KEY);
  vi.stubEnv("APP_ENV", "production");
});
afterEach(async () => {
  await call("DELETE", "test-motors", "social");
  vi.unstubAllEnvs();
});

describe("owner API keys", () => {
  const stored = () => runAsDealer("test-motors", () => secretFor("META_PAGE_ACCESS_TOKEN"));
  const connected = async (dealer: string) => JSON.parse(await (await call("GET", dealer)).text()).services.find((s: { id: string }) => s.id === "social").connected;
  it("refuses a missing or wrong token and stores nothing", async () => {
    expect((await call("PUT", "test-motors", "social", META, "wrong")).status).toBe(404);
    expect((await call("PUT", "test-motors", "social", META, "")).status).toBe(404);
    expect((await call("GET", "test-motors", undefined, undefined, "")).status).toBe(404);
    expect(await stored()).toBeUndefined();
    expect(await connected("test-motors")).toBe(false);
  });
  it("keeps dealers apart: keys saved for one dealer are not saved or readable for another", async () => {
    expect((await call("PUT", "test-motors", "social", META)).status).toBe(204);
    expect(await stored()).toBe(TOKEN);
    expect(await runAsDealer("checkwork-motors", async () => (await savedNamesNow()).size)).toBe(0);
    expect(await runAsDealer("checkwork-motors", () => secretFor("META_PAGE_ACCESS_TOKEN"))).toBeUndefined();
  });
  it("answers 404 for an unknown dealer or service, and refuses the demo", async () => {
    expect((await call("PUT", "nobody", "social", META)).status).toBe(404);
    expect((await call("PUT", "test-motors", "nothing", META)).status).toBe(404);
    expect((await call("PUT", "test-motors", "email", META)).status).toBe(404);
    expect((await call("PUT", "checkwork-motors", "social", META)).status).toBe(400);
  });
  it("answers 400 unless the body has exactly the service's names, each a short non-empty string", async () => {
    for (const b of [{}, { META_PAGE_ID: "1" }, { ...META, EXTRA: "x" }, { ...META, META_PAGE_ID: "" }, { ...META, META_PAGE_ID: "  " }, { ...META, META_PAGE_ID: 5 }, { ...META, META_PAGE_ID: "x".repeat(4001) }, [META], "x", null])
      expect((await call("PUT", "test-motors", "social", b)).status).toBe(400);
    expect((await call("PUT", "test-motors", "social", "x".repeat(20_000))).status).toBe(400);
    expect(await stored()).toBeUndefined();
  });
  it("cuts off a valid-looking body over the byte cap, even with no content-length", async () => {
    const big = JSON.stringify({ ...META, META_PAGE_ID: "é".repeat(8_000) }); // under 16000 characters, over 16000 bytes
    expect((await call("PUT", "test-motors", "social", JSON.parse(big))).status).toBe(400);
    const chunk = new TextEncoder().encode(JSON.stringify(META).slice(0, -1) + ",\"X\":\"" + "x".repeat(10_000));
    const stream = new ReadableStream({ pull(c) { c.enqueue(chunk); } });
    const req = new Request("https://x.test/api/owner/v1/x", { method: "PUT", headers: { authorization: "Bearer right" }, body: stream, duplex: "half" } as RequestInit);
    expect((await ownerKeys(req, "test-motors", "social")).status).toBe(400);
    expect(await stored()).toBeUndefined();
  });
  it("answers 503 for a save when the sealing key is not set", async () => {
    vi.stubEnv("DEALER_SECRETS_KEY", "");
    expect((await call("PUT", "test-motors", "social", META)).status).toBe(503);
    vi.stubEnv("DEALER_SECRETS_KEY", KEY);
    expect(await stored()).toBeUndefined();
  });
  it("saves, shows connected by name only, then deletes", async () => {
    const put = await call("PUT", "test-motors", "social", META);
    expect(put.status).toBe(204);
    expect(await runAsDealer("test-motors", () => secretFor("META_PAGE_ACCESS_TOKEN"))).toBe(TOKEN);
    const list = await call("GET", "test-motors");
    const text = await list.text();
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("111");
    const social = JSON.parse(text).services.find((s: { id: string }) => s.id === "social");
    expect(social).toEqual({ id: "social", connected: true, names: Object.keys(META) });
    const log = await runAsDealer("test-motors", () => listActivity({ area: "settings" }, 1, 20));
    expect(log.rows[0]).toMatchObject({ actor: "Checkwork", summary: "Connected Facebook and Instagram posting" });
    expect((await call("DELETE", "test-motors", "social")).status).toBe(204);
    const after = JSON.parse(await (await call("GET", "test-motors")).text());
    expect(after.services.find((s: { id: string }) => s.id === "social").connected).toBe(false);
    expect(await runAsDealer("test-motors", () => secretFor("META_PAGE_ACCESS_TOKEN"))).toBeUndefined();
  });
});
