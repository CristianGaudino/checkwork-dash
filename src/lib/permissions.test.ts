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
vi.mock("@/lib/staff", () => ({ staffIdentity: async () => (email === undefined ? { ok: false } : { ok: true, email: email.toLowerCase() }) }));
vi.mock("@/lib/tenancy/membership", () => vi.importActual("@/lib/tenancy/membership")); // the real directory check, not the setup's stand-in
const { can, currentMember } = await import("./permissions");
const { settingsStore } = await import("@/lib/admin/collections");
const { runAsDealer } = await import("@/lib/tenancy/current");

afterEach(async () => {
  vi.unstubAllEnvs();
  cookie = undefined;
  email = undefined;
  await runAsDealer("checkwork-motors", () => settingsStore.reset()); // nobody is signed in here, so as the dealer itself
});

const production = () => {
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_ADMIN_OPEN", "");
  vi.stubEnv("DEMO_RECORDS", "on"); // the demo team's names (Aoife Owner, Conor Sales, Niamh Finance); their roles are the directory's
};

describe("on the demo", () => {
  it("acts as the owner by default, and as the first team member with the role the bar picked", async () => {
    vi.stubEnv("APP_ENV", "demo");
    email = "aoife@example.com"; // signed in through Access, at the demo dealer
    expect(await currentMember()).toMatchObject({ name: "Aoife Brennan", role: "Owner" });
    expect(await can("margins")).toBe(true);
    cookie = "Sales";
    expect(await currentMember()).toMatchObject({ name: "Conor Doyle", role: "Sales" });
    expect(await can("margins")).toBe(false);
    cookie = "Finance";
    expect([await can("margins"), await can("team")]).toEqual([true, false]);
    cookie = "nonsense";
    expect((await currentMember()).role).toBe("Owner");
  });
});

describe("on a production site", () => {
  it("ignores the cookie, even with the demo bar left on", async () => {
    production();
    cookie = "Owner";
    expect(await currentMember()).toMatchObject({ role: null });
    expect(await can("margins")).toBe(false);
    // A build that forgot APP_ENV is treated the same: a cookie never makes anyone the owner.
    vi.stubEnv("APP_ENV", "");
    expect(await can("margins")).toBe(false);
  });

  it("gives the signed-in email the role the directory has for it, whatever its case, and the team's name for it", async () => {
    production();
    email = "CONOR@example.com";
    expect(await currentMember()).toMatchObject({ name: "Conor Doyle", role: "Sales" });
    expect(await can("margins")).toBe(false);
    email = "niamh@example.com";
    expect([await can("margins"), await can("team")]).toEqual([true, false]);
    email = "aoife@example.com";
    expect(await can("team")).toBe(true);
  });

  it("takes the role from the directory, not the team record, and grants nothing to anyone the directory does not have", async () => {
    production();
    const { putMember, resetMemoryDirectory } = await import("@/lib/tenancy/directory");
    await putMember("checkwork-motors", "conor@example.com", "Manager"); // the team record still says Sales
    email = "conor@example.com";
    expect(await currentMember()).toMatchObject({ name: "Conor Doyle", role: "Manager" });
    resetMemoryDirectory();
    email = "stranger@dealer.ie";
    expect(await currentMember()).toMatchObject({ role: null });
    expect(await can("margins")).toBe(false);
    email = undefined;
    expect(await can("margins")).toBe(false);
  });
});
