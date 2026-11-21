import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The dealer's own fallback address is in their profile.
let leadEmail: string | undefined;
vi.mock("@/lib/tenancy/current", async (orig) => ({ ...(await orig<typeof import("@/lib/tenancy/current")>()), dealerProfile: async () => ({ leadEmail }) }));
const { getDeps } = await import("./deps");

afterEach(() => vi.unstubAllEnvs());

describe("the real lead dependencies", () => {
  it("refuse a lead before storing it when there is no address to email, so none is saved unseen", async () => {
    vi.stubEnv("E2E_FAKE_BACKENDS", "");
    leadEmail = undefined;
    await expect(getDeps().store.insert({} as never)).rejects.toThrow("No lead email set for this dealer");
    leadEmail = "dealer@example.com";
    // Past the email check, the next missing thing is the database binding (there is none outside the Worker).
    await expect(getDeps().store.insert({} as never)).rejects.toThrow("Missing the dealer's database binding");
  });

  it("do not rate limit a request with no IP, which would lock every buyer into one shared bucket", async () => {
    vi.stubEnv("E2E_FAKE_BACKENDS", "");
    await expect(getDeps().limiter.allow("")).resolves.toBe(true);
    await expect(getDeps().limiter.allow("1.2.3.4")).rejects.toThrow("Missing binding LEAD_LIMITER");
  });
});
