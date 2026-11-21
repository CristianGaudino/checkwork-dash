import { afterEach, describe, expect, it, vi } from "vitest";

// A request through the real resolver: the open app's person (at both dealers, an owner at each) picks a dealer with the dealer cookie, and
// the demo bar's cookies (role, plan, stock sync) are set beside it. They count for the demo dealer only.
const jar = new Map<string, string>();
vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn })); // a fresh answer per call
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined) }), headers: async () => ({ get: () => null }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/staff", () => ({ requireStaff: async () => {}, staffIdentity: async () => ({ ok: true, email: "dev@checkwork.invalid" }) }));
vi.mock("@/lib/tenancy/membership", () => vi.importActual("@/lib/tenancy/membership"));
const { currentDealer } = await import("./current");
const { enabledModules, requireModule } = await import("@/lib/modules");
const { stockSource } = await import("@/lib/stock-source");
const { currentMember } = await import("@/lib/permissions");
const { PlanGate } = await import("@/components/admin/PlanGate");
const { NotInPlan } = await import("@/components/admin/NotInPlan");
const { setDriveStatusAction } = await import("@/app/test-drives/actions");
const { DEALER_COOKIE } = await import("./membership");
const { resetMemoryDirectory } = await import("./directory");

afterEach(() => {
  jar.clear();
  resetMemoryDirectory();
});
const at = (dealer: string, switches: Record<string, string> = {}) => {
  jar.clear();
  jar.set(DEALER_COOKIE, dealer);
  for (const [k, v] of Object.entries(switches)) jar.set(k, v);
};
const ALL_SWITCHES = { "checkwork-demo-modules": "dashboard", "checkwork-demo-stock": "donedeal", "checkwork-demo-role": "Sales" };

describe("the demo bar's switches", () => {
  it("change the plan, the stock source and the role of a demo dealer", async () => {
    at("checkwork-motors", ALL_SWITCHES);
    expect((await currentDealer()).id).toBe("checkwork-motors");
    expect([...(await enabledModules())]).toEqual(["dashboard"]);
    expect(await stockSource()).toBe("donedeal");
    expect((await currentMember()).role).toBe("Sales");
  });

  it("change nothing for a dealer that is not a demo: its plan, stock source and role are its own", async () => {
    at("test-motors", ALL_SWITCHES);
    expect((await currentDealer()).id).toBe("test-motors");
    expect([...(await enabledModules())]).toEqual(["dashboard"]); // Test Motors' own plan: the dashboard alone
    jar.set("checkwork-demo-modules", "all");
    expect((await enabledModules()).has("whatsapp")).toBe(false);
    expect(await stockSource()).toBe("checkwork");
    expect((await currentMember()).role).toBe("Owner"); // the directory's role, not the cookie's Sales
  });
});

describe("a module that is off for one dealer and on for another", () => {
  it("shows its pages and runs its actions for the dealer that has it, and the not-in-plan screen and a refusal for the other", async () => {
    at("checkwork-motors"); // every module
    expect(await PlanGate({ id: "testDrives", children: "the page" })).toBe("the page");
    await expect(requireModule("testDrives")).resolves.toBeUndefined();
    await setDriveStatusAction("no-such-drive", "confirmed"); // past the module check: an unknown drive is the action's own answer

    at("test-motors"); // the dashboard alone
    const gated = (await PlanGate({ id: "testDrives", children: "the page" })) as React.ReactElement<{ id: string }>;
    expect(gated.type).toBe(NotInPlan);
    expect(gated.props.id).toBe("testDrives");
    await expect(requireModule("testDrives")).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
    await expect(setDriveStatusAction("no-such-drive", "confirmed")).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});
