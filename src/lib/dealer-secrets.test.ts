import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
// The role the directory gives the signed-in person (realRole), per test: a job has none, so the actions need it set here.
const who = vi.hoisted(() => ({ role: "Owner" as string | null }));
vi.mock("@/lib/permissions", async (orig) => ({ ...(await orig<typeof import("@/lib/permissions")>()), realRole: async () => who.role }));

const KEY = Buffer.alloc(32, 9).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 1).toString("base64");
const { seal, unseal, saveSecret, removeSecret, secretFor, savedNames } = await import("./dealer-secrets");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { isConnected } = await import("./integrations");
const { saveKeysAction, removeKeysAction } = await import("@/app/settings/actions");
const { listActivity } = await import("@/lib/admin/activity");

const TOKEN = "EAAB-super-secret-token-123";
const form = (o: Record<string, string>) => Object.entries(o).reduce((f, [k, v]) => (f.set(k, v), f), new FormData());
const META = { META_PAGE_ID: "111", META_PAGE_ACCESS_TOKEN: TOKEN, META_INSTAGRAM_ID: "222" };
const at = <T,>(id: string, fn: () => Promise<T>) => runAsDealer(id, fn);

beforeEach(() => {
  vi.stubEnv("DEALER_SECRETS_KEY", KEY);
  vi.stubEnv("APP_ENV", "production");
  who.role = "Owner";
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await at("test-motors", async () => void (await Promise.all([...(await savedNames())].map(removeSecret)))); // the memory store outlives a test
});

describe("sealing", () => {
  it("round-trips, with a new iv each time, and the sealed text holds no plaintext", async () => {
    const a = await seal("test-motors", "X", TOKEN);
    const b = await seal("test-motors", "X", TOKEN);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(a).not.toContain(TOKEN);
    expect(await unseal("test-motors", "X", a)).toBe(TOKEN);
  });
  it("fails for another dealer, another name, a tampered value, an unknown version or another key", async () => {
    const a = await seal("test-motors", "X", TOKEN);
    await expect(unseal("checkwork-motors", "X", a)).rejects.toThrow();
    await expect(unseal("test-motors", "Y", a)).rejects.toThrow();
    const [v, iv, ct] = a.split(".");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] ^= 1;
    await expect(unseal("test-motors", "X", [v, iv, flipped.toString("base64")].join("."))).rejects.toThrow();
    await expect(unseal("test-motors", "X", a.replace("v1.", "v9."))).rejects.toThrow();
    vi.stubEnv("DEALER_SECRETS_KEY", OTHER_KEY);
    await expect(unseal("test-motors", "X", a)).rejects.toThrow();
  });
});

describe("a dealer's own keys", () => {
  it("win over the app-wide variable, stay with their dealer, and are stored sealed", async () => {
    vi.stubEnv("META_PAGE_ID", "app-wide");
    await at("test-motors", async () => {
      expect(await secretFor("META_PAGE_ID")).toBe("app-wide");
      await saveSecret("META_PAGE_ID", "mine-plain-value");
      expect(await secretFor("META_PAGE_ID")).toBe("mine-plain-value");
    });
    await at("checkwork-motors", async () => expect(await secretFor("META_PAGE_ID")).toBe("app-wide"));
    const store = (globalThis as { __checkworkDocs?: Map<string, Map<string, Map<string, unknown>>> }).__checkworkDocs!;
    const rows = JSON.stringify([...store.get("test-motors")!.get("secrets")!.values()]);
    expect(rows).toContain("v1.");
    expect(rows).not.toContain("mine-plain-value");
  });
  it("count as connected, without the app-wide variables", async () => {
    await at("test-motors", async () => {
      expect(await isConnected("whatsapp")).toBe(false);
      await saveSecret("WHATSAPP_PHONE_NUMBER_ID", "1");
      await saveSecret("WHATSAPP_ACCESS_TOKEN", "t");
      expect(await isConnected("whatsapp")).toBe(false); // the app secret is ours
      vi.stubEnv("WHATSAPP_APP_SECRET", "ours");
      expect(await isConnected("whatsapp")).toBe(true);
    });
  });
});

describe("saving from Settings", () => {
  it("an owner connects, replaces and removes a service; the activity names it and holds no value", async () => {
    await at("test-motors", async () => {
      expect(await saveKeysAction("social", undefined, form(META))).toEqual({ saved: true });
      expect([...(await savedNames())].sort()).toEqual(Object.keys(META).sort());
      expect(await secretFor("META_PAGE_ACCESS_TOKEN")).toBe(TOKEN);
      expect(await saveKeysAction("social", undefined, form(META))).toEqual({ saved: true });
      expect(await removeKeysAction("social")).toBeUndefined();
      expect((await savedNames()).size).toBe(0);
      const log = (await listActivity({ area: "settings" }, 1, 20)).rows.map((r) => r.summary);
      expect(log).toEqual(expect.arrayContaining(["Connected Facebook and Instagram posting", "Replaced Facebook and Instagram posting", "Removed the keys for Facebook and Instagram posting"]));
      expect(JSON.stringify(log)).not.toContain(TOKEN);
    });
  });
  it("is refused for anyone but an owner, and on the demo dealer, and changes nothing", async () => {
    who.role = "Manager";
    await at("test-motors", async () => {
      expect((await saveKeysAction("social", undefined, form(META)))?.errors?.form).toBe("Only an owner can change this");
      expect(await removeKeysAction("social")).toEqual({ error: "Only an owner can change this" });
      expect((await savedNames()).size).toBe(0);
    });
    who.role = "Owner";
    await at("checkwork-motors", async () => {
      expect((await saveKeysAction("social", undefined, form(META)))?.errors?.form).toBe("The demo never needs keys");
      expect((await savedNames()).size).toBe(0);
    });
  });
  it("is refused with a plain message when DEALER_SECRETS_KEY is not set, for a service that is ours, and for an empty box", async () => {
    await at("test-motors", async () => {
      vi.stubEnv("DEALER_SECRETS_KEY", "");
      expect((await saveKeysAction("social", undefined, form(META)))?.errors?.form).toMatch(/cannot be saved yet/);
      vi.stubEnv("DEALER_SECRETS_KEY", KEY);
      expect((await saveKeysAction("ai", undefined, form({ ANTHROPIC_API_KEY: "x" })))?.errors?.form).toBe("Not found");
      expect((await saveKeysAction("social", undefined, form({ ...META, META_PAGE_ID: " " })))?.errors?.form).toBe("Fill in every box");
      expect((await savedNames()).size).toBe(0);
    });
  });
  it("never logs a value", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await at("test-motors", async () => {
      await saveKeysAction("social", undefined, form(META));
      vi.stubEnv("DEALER_SECRETS_KEY", OTHER_KEY); // cannot open it now: logs the name only
      await secretFor("META_PAGE_ACCESS_TOKEN");
    });
    expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
    expect(JSON.stringify(spy.mock.calls)).toContain("META_PAGE_ACCESS_TOKEN");
    spy.mockRestore();
  });
});
