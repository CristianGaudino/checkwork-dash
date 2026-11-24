import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { lookupReg, regCache } = await import("./reg-lookup");

describe("lookupReg", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("on the demo gives the plate's facts and a sample car, the same car for the same plate", async () => {
    const a = await lookupReg("191-KY-1234");
    expect(a).toMatchObject({ year: 2019, half: 1, county: "Kerry" });
    expect(a?.car?.make).toBeTruthy();
    expect((await lookupReg("191 ky 1234"))?.car).toEqual(a?.car);
  });

  it("for a real dealer with no service, only what the plate itself says: never an invented car", async () => {
    const { runAsDealer } = await import("@/lib/tenancy/current");
    const a = await runAsDealer("test-motors", () => lookupReg("191-KY-1234"));
    expect(a).toEqual({ reg: "191-KY-1234", year: 2019, half: 1, county: "Kerry" });
  });

  it("not an Irish plate: nothing", async () => {
    expect(await lookupReg("AB12 CDE")).toBeNull();
  });
});

// A real dealer (not a demo): a demo dealer never calls the paid service, keys or not.
describe("lookupReg with the paid service", () => {
  const asReal = (fn: () => Promise<void>) => async () => (await import("@/lib/tenancy/current")).runAsDealer("test-motors", fn);
  const FOCUS = { make: "Ford", model: "Focus" };
  beforeEach(async () => {
    vi.stubEnv("ONE_AUTO_API_KEY", "key");
    await asReal(() => regCache.reset())();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("past the dealer's monthly limit gives a plate already in the cache, free, and only the plate's facts for a new one", asReal(async () => {
    const service = vi.fn(async () => FOCUS);
    const paid = vi.fn(async () => {});
    expect((await lookupReg("191-KY-1234", service, { allowed: async () => true, paid }))?.car).toEqual(FOCUS);
    const full = { allowed: async () => false, paid };
    expect((await lookupReg("191-KY-1234", service, full))?.car).toEqual(FOCUS); // cached: free
    const fresh = await lookupReg("192-D-555", service, full);
    expect(fresh?.limited).toBe(true);
    expect(fresh?.car).toBeUndefined();
    expect(service).toHaveBeenCalledOnce();
    expect(paid).toHaveBeenCalledOnce();
  }));

  it("asks the service once per plate, then answers from the cache", asReal(async () => {
    const service = vi.fn(async () => FOCUS);
    expect((await lookupReg("191-KY-1234", service))?.car).toEqual(FOCUS);
    expect((await lookupReg("191 ky 1234", service))?.car).toEqual(FOCUS);
    expect(service).toHaveBeenCalledOnce();
  }));

  it("gives the plate's facts when the service fails, and does not cache the failure", asReal(async () => {
    const service = vi.fn(async () => Promise.reject(new Error("down")));
    expect((await lookupReg("191-KY-1234", service))?.car).toBeUndefined();
    expect(await regCache.get("191-KY-1234")).toBeUndefined();
  }));
});
