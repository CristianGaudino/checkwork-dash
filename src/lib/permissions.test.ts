import { afterEach, describe, expect, it, vi } from "vitest";

// What the request carries, set per test.
let cookie: string | undefined;
let email: string | undefined;
vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn })); // a fresh answer per call
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "checkwork-demo-role" && cookie !== undefined ? { value: cookie } : undefined) }),
  headers: async () => ({ get: (n: string) => (n === "x-admin-email" ? (email ?? null) : null) }),
}));
// The verified Access email (src/lib/staff.ts verifies the token; here the test says who it is).
vi.mock("@/lib/staff", () => ({ staffIdentity: async () => (email === undefined ? { ok: false } : { ok: true, email: email.toLowerCase() }), toSignIn: async () => {} }));
vi.mock("@/lib/tenancy/membership", () => vi.importActual("@/lib/tenancy/membership")); // the real directory check, not the setup's stand-in
const { can, currentMember, realCan } = await import("./permissions");
const { settingsStore } = await import("@/lib/admin/collections");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { putMember, resetMemoryDirectory } = await import("@/lib/tenancy/directory");

afterEach(async () => {
  vi.unstubAllEnvs();
  cookie = undefined;
  email = undefined;
  resetMemoryDirectory();
  await runAsDealer("checkwork-motors", () => settingsStore.reset()); // nobody is signed in here, so as the dealer itself
});

describe("on a demo dealer (the directory's flag, whatever the deploy)", () => {
  it("acts as the owner by default, and as the first team member with the role the bar picked", async () => {
    vi.stubEnv("APP_ENV", "production"); // the deploy does not decide: the dealer does
    email = "aoife@example.com"; // signed in through Access, at the demo dealer
    expect(await currentMember()).toMatchObject({ name: "Aoife Brennan", role: "Owner" });
    expect([await can("margins"), await realCan("team")]).toEqual([true, true]);
    cookie = "Sales";
    expect(await currentMember()).toMatchObject({ name: "Conor Doyle", role: "Sales" });
    expect(await realCan("team")).toBe(false); // the bar's role still refuses, though the directory has her as an owner
    expect(await can("margins")).toBe(false);
    cookie = "Finance";
    expect([await can("margins"), await can("team")]).toEqual([true, false]);
    cookie = "nonsense";
    expect((await currentMember()).role).toBe("Owner");
  });
});

describe("on any other dealer", () => {
  it("ignores the role cookie: the role is the directory's for the signed-in email, whatever its case", async () => {
    await putMember("test-motors", "sales@test.example", "Sales"); // only at Test Motors, which is not a demo
    email = "SALES@test.example";
    cookie = "Owner";
    expect(await currentMember()).toMatchObject({ role: "Sales", email: "sales@test.example" });
    expect([await can("team"), await can("settings")]).toEqual([false, false]);
    expect([await realCan("team"), await realCan("data")]).toEqual([false, false]); // the same as can() off the demo
  });

  it("takes the role from the directory and grants nothing to anyone the directory does not have", async () => {
    await putMember("test-motors", "boss@test.example", "Manager");
    email = "boss@test.example";
    expect(await currentMember()).toMatchObject({ role: "Manager" });
    expect([await can("team"), await realCan("team")]).toEqual([true, true]);
    expect(await can("margins")).toBe(true); // a Manager may see margins: every dealer has every part (#212), whatever its stored plan
    email = "stranger@dealer.example";
    cookie = "Owner";
    expect(await currentMember()).toMatchObject({ role: null });
    expect(await can("settings")).toBe(false);
    email = undefined;
    expect(await can("settings")).toBe(false);
  });
});
