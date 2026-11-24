import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VehicleHistory } from "./history-rules";

vi.mock("server-only", () => ({}));
const { checkHistory, historyCache, HISTORY_CACHE_DAYS } = await import("./history");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { DAY } = await import("@/lib/time");

const meter = (allowed = true) => ({ allowed: vi.fn(async () => allowed), paid: vi.fn(async () => {}) });
const CLEAN_CAR: VehicleHistory = { reg: "191-KY-1234", checkedOn: "2026-11-24", financeOwed: false, mileage: [], mileageOff: false, imported: false, owners: 1, firstRegistered: "2019-01-01" };

describe("checkHistory on the demo (simulated)", () => {
  beforeEach(() => historyCache.reset());

  it("gives the made-up answer, counted once, then the same plate from the cache, free", async () => {
    const m = meter();
    const a = await checkHistory("151-D-1000", m);
    expect("history" in a && a.history.financeOwed).toBe(true);
    const b = await checkHistory("151 d 1000", meter(false)); // past the limit: still answered, from the cache
    expect(b).toEqual({ ...a, cached: true });
    expect(m.paid).toHaveBeenCalledOnce();
  });

  it("refuses a new plate past the dealer's limit, and counts nothing", async () => {
    const m = meter(false);
    expect(await checkHistory("162-C-1037", m)).toEqual({ error: "limited" });
    expect(m.paid).not.toHaveBeenCalled();
  });

  it("not an Irish plate: refused before any use", async () => {
    const m = meter();
    expect(await checkHistory("AB12 CDE", m)).toEqual({ error: "bad-reg" });
    expect(m.allowed).not.toHaveBeenCalled();
  });
});

// A real dealer: off with no key; with one, One Auto (here a stand-in).
describe("checkHistory with the paid service", () => {
  const asReal = (fn: () => Promise<void>) => async () => runAsDealer("test-motors", fn);
  beforeEach(asReal(async () => void (await historyCache.reset())));
  afterEach(() => vi.unstubAllEnvs());

  it("is off with no key: nothing asked, nothing counted", asReal(async () => {
    vi.stubEnv("ONE_AUTO_API_KEY", "");
    const m = meter();
    expect(await checkHistory("191-KY-1234", m)).toEqual({ error: "off" });
    expect(m.allowed).not.toHaveBeenCalled();
  }));

  it("asks the service once per plate within 30 days, and again after", asReal(async () => {
    vi.stubEnv("ONE_AUTO_API_KEY", "key");
    const service = vi.fn(async () => CLEAN_CAR);
    const m = meter();
    const now = Date.parse("2026-11-24T12:00:00Z");
    await checkHistory("191-KY-1234", m, service, now);
    await checkHistory("191-KY-1234", m, service, now + (HISTORY_CACHE_DAYS - 1) * DAY);
    expect(service).toHaveBeenCalledOnce();
    await checkHistory("191-KY-1234", m, service, now + (HISTORY_CACHE_DAYS + 1) * DAY);
    expect(service).toHaveBeenCalledTimes(2);
    expect(m.paid).toHaveBeenCalledTimes(2);
  }));

  it("a check that fails, or an adapter not installed yet (not connected), is neither paid nor cached", asReal(async () => {
    vi.stubEnv("ONE_AUTO_API_KEY", "key");
    const m = meter();
    expect(await checkHistory("191-KY-1234", m, async () => "not-installed")).toEqual({ error: "off" });
    expect(await checkHistory("191-KY-1234", m, async () => Promise.reject(new Error("down")))).toEqual({ error: "failed" });
    expect(await checkHistory("191-KY-1234", m, async () => null)).toEqual({ error: "unknown" });
    expect(m.paid).not.toHaveBeenCalled();
    expect(await historyCache.get("191-KY-1234")).toBeUndefined();
  }));

  it("the real adapter is a stub until One Auto is confirmed: not installed", async () => {
    const { historyByReg } = await import("./vehicle-data/one-auto");
    expect(await historyByReg("191-KY-1234")).toBe("not-installed");
  });
});
