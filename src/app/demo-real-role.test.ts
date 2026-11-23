import { beforeEach, describe, expect, it, vi } from "vitest";

// On a demo dealer the demo bar's cookie picks the role the screens show, but effects past the dashboard (the directory's team, website
// keys, the lead emails and the test email, real personal data) go by the role the directory gives (realCan, src/lib/permissions.ts).
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); }, notFound: () => { throw new Error("not-found"); } }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "checkwork-demo-role" ? { value: "Owner" } : undefined) }), // the bar always says Owner here
  headers: async () => ({ get: () => null }),
}));
// The directory's role for the signed-in person, set per test.
const real = vi.hoisted(() => ({ role: "Sales" }));
vi.mock("@/lib/tenancy/membership", async (orig) => ({
  ...(await orig<typeof import("@/lib/tenancy/membership")>()),
  dealerAccess: async () => ({
    state: "ok",
    dealer: { id: "checkwork-motors", name: "Checkwork Motors", binding: "DB_CHECKWORK_MOTORS", demo: true, status: "active", createdAt: 0, profile: (await import("@/lib/tenancy/profile")).DEMO_PROFILE },
    role: real.role,
    email: "conor@example.com",
    choices: [{ id: "checkwork-motors", name: "Checkwork Motors" }],
  }),
}));
const settings = await import("./settings/actions");
const { eraseAction, exportAction, findAction } = await import("./data-requests/actions");
const leads = await import("./leads/export/route");
const customers = await import("./customers/export/route");
const { can, DEMO_ROLE_REFUSED } = await import("@/lib/permissions");
const { getSettings, settingsStore } = await import("@/lib/admin/collections");
const { membersOf, resetMemoryDirectory } = await import("@/lib/tenancy/directory");

const form = (o: Record<string, string>) => Object.entries(o).reduce((f, [k, v]) => (f.set(k, v), f), new FormData());
const get = (route: { GET: (r: Request) => Promise<Response> }, path: string) => route.GET(new Request(`http://localhost${path}`));
const conor = async () => (await getSettings()).team.find((t) => t.email === "conor@example.com")!;
beforeEach(async () => {
  vi.stubEnv("APP_ENV", "demo");
  resetMemoryDirectory();
  await settingsStore.reset();
});

describe("a demo Sales member with the demo bar on Owner", () => {
  beforeEach(() => void (real.role = "Sales"));

  it("still sees the owner's screens", async () => {
    expect(await can("team")).toBe(true);
    expect(await can("data")).toBe(true);
  });

  it("cannot add or remove a member, and the directory is untouched", async () => {
    const before = await membersOf("checkwork-motors");
    expect((await settings.addTeamAction(undefined, form({ name: "Sam Reilly", email: "sam@example.com", role: "Owner" })))?.errors?.role).toBe(DEMO_ROLE_REFUSED);
    expect(await settings.removeTeamAction((await conor()).id)).toEqual({ error: DEMO_ROLE_REFUSED });
    expect(await settings.setRoleAction((await conor()).id, undefined, form({ role: "Owner" }))).toEqual({ errors: { role: DEMO_ROLE_REFUSED } });
    expect(await membersOf("checkwork-motors")).toEqual(before);
  });

  it("cannot change the lead emails or send the test email", async () => {
    expect(await settings.saveLeadEmailsAction(undefined, form({ leadEmails: "someone@example.com" }))).toEqual({ errors: { leadEmails: DEMO_ROLE_REFUSED } });
    expect(await settings.sendTestEmailAction()).toEqual({ errors: { test: DEMO_ROLE_REFUSED } });
    expect((await getSettings()).leadEmails).not.toContain("someone@example.com");
  });

  it("cannot change the dealer's name or details, which everyone at the dealer sees", async () => {
    const { dealerById } = await import("@/lib/tenancy/directory");
    expect(await settings.saveBusinessAction(undefined, form({ name: "Renamed Motors", phone: "01 234 5678" }))).toEqual({ errors: { name: DEMO_ROLE_REFUSED } });
    expect((await dealerById("checkwork-motors"))?.name).not.toBe("Renamed Motors");
  });

  it("cannot export leads or customers, or run a data request", async () => {
    for (const r of [await get(leads, "/leads/export"), await get(customers, "/customers/export")]) {
      expect(r.status).toBe(403);
      expect(await r.text()).toBe(DEMO_ROLE_REFUSED);
    }
    expect(await findAction(undefined, form({ q: "x@example.com" }))).toEqual({ error: DEMO_ROLE_REFUSED });
    expect(await exportAction("x@example.com")).toBeNull();
    await expect(eraseAction(form({ q: "x@example.com", checked: "on" }))).resolves.toBeUndefined(); // no erasure, no redirect
  });
});

describe("the real Owner", () => {
  beforeEach(() => void (real.role = "Owner"));

  it("can do each of them", async () => {
    expect((await settings.addTeamAction(undefined, form({ name: "Sam Reilly", email: "sam@example.com", role: "Sales" })))?.saved).toBe(true);
    expect((await membersOf("checkwork-motors")).some((m) => m.email === "sam@example.com")).toBe(true);
    expect(await settings.removeTeamAction((await getSettings()).team.find((t) => t.email === "sam@example.com")!.id)).toBeUndefined();
    expect(await settings.saveLeadEmailsAction(undefined, form({ leadEmails: "someone@example.com" }))).toEqual({ saved: true });
    expect((await settings.sendTestEmailAction())?.errors?.test).not.toBe(DEMO_ROLE_REFUSED);
    expect((await get(leads, "/leads/export")).status).toBe(200);
    expect((await get(customers, "/customers/export")).status).toBe(200);
    expect((await findAction(undefined, form({ q: "x@example.com" })))?.error).toBeUndefined();
    expect(await exportAction("x@example.com")).not.toBeNull();
    await expect(eraseAction(form({ q: "x@example.com", checked: "on" }))).rejects.toThrow("redirect:/data-requests?erased=0");
  });
});
