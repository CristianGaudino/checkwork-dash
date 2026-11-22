import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const KEY = Buffer.alloc(32, 9).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 1).toString("base64");
const { seal, unseal, saveSecret, removeSecret, secretFor, savedNames } = await import("./dealer-secrets");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { isConnected } = await import("./integrations");

const TOKEN = "EAAB-super-secret-token-123";
const at = <T,>(id: string, fn: () => Promise<T>) => runAsDealer(id, fn);

beforeEach(() => {
  vi.stubEnv("DEALER_SECRETS_KEY", KEY);
  vi.stubEnv("APP_ENV", "production");
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
  it("are the only source: an app-wide variable never stands in, and they stay with their dealer, and are stored sealed", async () => {
    vi.stubEnv("META_PAGE_ID", "app-wide");
    await at("test-motors", async () => {
      expect(await secretFor("META_PAGE_ID")).toBeUndefined();
      expect(await isConnected("social")).toBe(false);
      await saveSecret("META_PAGE_ID", "mine-plain-value");
      expect(await secretFor("META_PAGE_ID")).toBe("mine-plain-value");
    });
    await at("checkwork-motors", async () => expect(await secretFor("META_PAGE_ID")).toBeUndefined());
    const store = (globalThis as { __checkworkDocs?: Map<string, Map<string, Map<string, unknown>>> }).__checkworkDocs!;
    const rows = JSON.stringify([...store.get("test-motors")!.get("secrets")!.values()]);
    expect(rows).toContain("v1.");
    expect(rows).not.toContain("mine-plain-value");
  });
  it("that cannot be opened give nothing, not the app-wide variable", async () => {
    vi.stubEnv("META_PAGE_ID", "app-wide");
    await at("test-motors", async () => {
      await saveSecret("META_PAGE_ID", "mine");
      vi.stubEnv("DEALER_SECRETS_KEY", OTHER_KEY);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await secretFor("META_PAGE_ID")).toBeUndefined();
      spy.mockRestore();
    });
  });
  it("do not count as connected while they cannot be opened (no sealing key)", async () => {
    await at("test-motors", async () => {
      await saveSecret("DONEDEAL_API_KEY", "k");
      expect(await isConnected("donedeal")).toBe(true);
      vi.stubEnv("DEALER_SECRETS_KEY", "");
      expect(await isConnected("donedeal")).toBe(false);
    });
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

describe("logging", () => {
  it("never logs a value", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await at("test-motors", async () => {
      await saveSecret("META_PAGE_ACCESS_TOKEN", TOKEN);
      vi.stubEnv("DEALER_SECRETS_KEY", OTHER_KEY); // cannot open it now: logs the name only
      await secretFor("META_PAGE_ACCESS_TOKEN");
    });
    expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
    expect(JSON.stringify(spy.mock.calls)).toContain("META_PAGE_ACCESS_TOKEN");
    spy.mockRestore();
  });
});
