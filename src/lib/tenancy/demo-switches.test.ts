import { afterEach, describe, expect, it, vi } from "vitest";

// A request through the real resolver: the open app's person (at both dealers, an owner at each) picks a dealer with the dealer cookie, and
// the demo bar's cookies (role, stock sync) are set beside it. They count for the demo dealer only.
const jar = new Map<string, string>();
vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn })); // a fresh answer per call
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined) }), headers: async () => ({ get: () => null }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/staff", () => ({ requireStaff: async () => {}, staffIdentity: async () => ({ ok: true, email: "dev@checkwork.invalid" }) }));
vi.mock("@/lib/tenancy/membership", () => vi.importActual("@/lib/tenancy/membership"));
const { currentDealer } = await import("./current");
const { stockSource } = await import("@/lib/stock-source");
const { currentMember } = await import("@/lib/permissions");
const { billingSettings, currentPlan, monthUsage, recordUsage, usageStore } = await import("@/lib/billing/usage");
const { planLines } = await import("@/lib/billing/rules");
const { eventsFor } = await import("@/lib/notify-rules");
const { setDriveStatusAction } = await import("@/app/test-drives/actions");
const { DEALER_COOKIE } = await import("./membership");
const { patchDealer, resetMemoryDirectory } = await import("./directory");

afterEach(() => {
  jar.clear();
  resetMemoryDirectory();
});
const at = (dealer: string, switches: Record<string, string> = {}) => {
  jar.clear();
  jar.set(DEALER_COOKIE, dealer);
  for (const [k, v] of Object.entries(switches)) jar.set(k, v);
};
const ALL_SWITCHES = { "checkwork-demo-modules": "dashboard", "checkwork-demo-stock": "donedeal", "checkwork-demo-role": "Sales" }; // the plan cookie is from before #212

describe("the demo bar's switches", () => {
  it("change the stock source and the role of a demo dealer, and an old plan cookie changes nothing (#212)", async () => {
    at("checkwork-motors", ALL_SWITCHES);
    expect((await currentDealer()).id).toBe("checkwork-motors");
    expect(await stockSource()).toBe("donedeal");
    expect((await currentMember()).role).toBe("Sales");
  });

  it("change nothing for a dealer that is not a demo: its stock source and role are its own", async () => {
    at("test-motors", ALL_SWITCHES);
    expect((await currentDealer()).id).toBe("test-motors");
    expect(await stockSource()).toBe("checkwork");
    expect((await currentMember()).role).toBe("Owner"); // the directory's role, not the cookie's Sales
  });
});

// One system (#212): a profile stored before it may still hold "modules". It only decides the plan billed (read once, src/lib/tenancy/profile.ts
// planOf): that dealer has every page and action and every notification, as any other.
describe("a dealer with an old stored modules value", () => {
  const seen = async (dealer: string) => {
    at(dealer);
    await setDriveStatusAction("no-such-drive", "confirmed"); // no plan check first: an unknown drive is the action's own answer
    for (const d of await usageStore.list()) await usageStore.remove(d.id);
    await recordUsage("lookup", "dashboard", 100);
    return { plan: planLines(await currentPlan(), await billingSettings()), lookup: (await monthUsage()).lookup.costEur, events: eventsFor((await currentMember()).role) };
  };
  it("of the dashboard alone sees and is billed the same as a dealer with nothing stored: the dashboard plan, 100 lookups included", async () => {
    const plain = await seen("test-motors");
    expect(plain).toEqual({ plan: [{ label: "Dashboard plan", eur: 149 }], lookup: 0, events: eventsFor("Owner") });
    await patchDealer("test-motors", "Test Motors", { modules: "dashboard" } as never);
    expect(await seen("test-motors")).toEqual(plain);
    expect(await seen("checkwork-motors")).toMatchObject({ plan: [{ label: "Website + Dashboard plan", eur: 249 }], lookup: 0 });
  });
  it("of website parts only is billed the Website plan, with no lookups included, and still sees everything", async () => {
    await patchDealer("test-motors", "Test Motors", { modules: "tradeIn,finance" } as never);
    expect(await seen("test-motors")).toEqual({ plan: [{ label: "Website plan", eur: 149 }], lookup: 30, events: eventsFor("Owner") }); // 100 x EUR 0.30
    await patchDealer("test-motors", "Test Motors", { plan: "both" }); // a plan set later wins
    expect((await seen("test-motors")).plan).toEqual([{ label: "Website + Dashboard plan", eur: 249 }]);
  });
});
