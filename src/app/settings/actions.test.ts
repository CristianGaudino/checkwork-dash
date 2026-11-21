import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// These act as the demo's roles (the demo bar's cookie), which count only for a demo dealer, as the tests' dealer is (src/lib/tenancy/current.ts).
beforeEach(() => vi.stubEnv("APP_ENV", "demo"));

// The demo acts as the role in the demo bar's cookie (src/lib/permissions.ts); set per test, the owner by default.
let role: string | undefined;
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "checkwork-demo-role" && role ? { value: role } : undefined) }),
  headers: async () => ({ get: () => null }),
}));
const { addTeamAction, removeTeamAction, resetDemoAction, saveBusinessAction, saveLeadEmailsAction, saveMarketingAction, saveNotificationsAction, saveTargetsAction, sendTestEmailAction, setRoleAction, makeSiteKeyAction, revokeSiteKeyAction } = await import("./actions");
const { adminCars, saveCar } = await import("@/lib/admin/stock-admin");
const { getSettings, leadsStore, settingsStore } = await import("@/lib/admin/collections");
const { listActivity } = await import("@/lib/admin/activity");
const { dealerById, resetMemoryDirectory } = await import("@/lib/tenancy/directory");
beforeEach(() => resetMemoryDirectory()); // who is on the team, and as what, is the directory's

const form = (o: Record<string, string>) => Object.entries(o).reduce((f, [k, v]) => (f.set(k, v), f), new FormData());

describe("business details", () => {
  const HOURS = Object.fromEntries([0, 1, 2, 3, 4].flatMap((i) => [[`opens${i}`, "09:00"], [`closes${i}`, "17:30"]]));
  const facts = { name: "Checkwork Motors", siteUrl: "https://www.example.com/", phone: "01 234 5678", email: "sales@example.com", street: "Main Street", town: "Naas", county: "Co. Kildare", eircode: "W91 X2Y3", ...HOURS };

  it("lets an owner or manager change the dealer's own facts in the directory, and logs it; the plan stays ours", async () => {
    role = "Manager";
    const before = (await listActivity({ area: "settings" }, 1, 1)).total;
    expect(await saveBusinessAction(undefined, form(facts))).toEqual({ saved: true });
    const d = (await dealerById("checkwork-motors"))!;
    expect(d.profile).toMatchObject({ siteUrl: "https://www.example.com", phone: "01 234 5678", address: { town: "Naas" }, modules: "all" });
    expect(d.profile.hours[0]).toEqual({ day: "Monday", opens: "09:00", closes: "17:30" });
    expect(d.profile.hours[6]).toEqual({ day: "Sunday" });
    expect((await listActivity({ area: "settings" }, 1, 1)).rows[0]).toMatchObject({ summary: "Changed the business details" });
    expect((await listActivity({ area: "settings" }, 1, 1)).total).toBe(before + 1);
  });

  it("refuses sales, a website that is not https, and a day that closes before it opens", async () => {
    role = "Sales";
    expect((await saveBusinessAction(undefined, form(facts)))?.errors?.name).toMatch(/owner or manager/);
    role = "Owner";
    expect((await saveBusinessAction(undefined, form({ ...facts, siteUrl: "http://www.example.com" })))?.errors?.siteUrl).toBeTruthy();
    expect((await saveBusinessAction(undefined, form({ ...facts, opens1: "18:00" })))?.errors?.opens1).toBeTruthy();
    expect((await saveBusinessAction(undefined, form({ ...facts, closes2: "" })))?.errors?.opens2).toBeTruthy();
    expect((await dealerById("checkwork-motors"))!.profile.phone).toBe("+353 1 906 0045"); // nothing saved
  });
});

describe("team settings", () => {
  beforeEach(async () => {
    role = undefined;
    await settingsStore.reset();
    await leadsStore.reset();
  });

  it("adds a person, and refuses the same name again whatever its case", async () => {
    expect((await addTeamAction(undefined, form({ name: "Sam reilly", email: "sam@example.com", role: "Sales" })))?.saved).toBe(true);
    expect((await getSettings()).team.map((t) => t.name)).toContain("Sam reilly");
    expect((await addTeamAction(undefined, form({ name: "sam reilly", email: "x@example.com", role: "Sales" })))?.errors?.name).toMatch(/already on the team/);
  });

  it("checks the email and the name", async () => {
    const r = await addTeamAction(undefined, form({ name: " ", email: "nope", role: "Sales" }));
    expect(Object.keys(r?.errors ?? {}).sort()).toEqual(["email", "name"]);
  });

  it("refuses the same email twice", async () => {
    expect((await addTeamAction(undefined, form({ name: "Someone new", email: "Conor@Example.com", role: "Sales" })))?.errors?.email).toMatch(/already on the team/);
  });

  it("removing a person unassigns their leads, and the last person cannot be removed", async () => {
    const leads = await leadsStore.list();
    const target = leads.find((l) => l.assignedTo && l.assignedTo !== "Aoife Brennan")!;
    const member = (await getSettings()).team.find((t) => t.name === target.assignedTo)!;
    await removeTeamAction(member.id);
    expect((await getSettings()).team.some((t) => t.id === member.id)).toBe(false);
    expect((await leadsStore.get(target.id))!.assignedTo).toBeUndefined();
    for (const t of (await getSettings()).team.filter((t) => t.role !== "Owner")) await removeTeamAction(t.id);
    const last = (await getSettings()).team;
    expect(last.map((t) => t.role)).toEqual(["Owner"]);
    await removeTeamAction(last[0].id);
    expect((await getSettings()).team).toHaveLength(1);
  });

  it("keeps an owner: the only owner cannot be demoted or removed", async () => {
    const owner = (await getSettings()).team.find((t) => t.role === "Owner")!;
    expect((await setRoleAction(owner.id, undefined, form({ role: "Sales" })))?.errors?.role).toMatch(/at least one owner/);
    await removeTeamAction(owner.id);
    expect((await getSettings()).team.some((t) => t.id === owner.id)).toBe(true);
  });

  it("a manager changes everyone but an owner, and cannot make anyone one", async () => {
    role = "Manager";
    const { team } = await getSettings();
    const sales = team.find((t) => t.role === "Sales")!;
    const owner = team.find((t) => t.role === "Owner")!;
    expect((await setRoleAction(sales.id, undefined, form({ role: "Finance" })))?.saved).toBe(true);
    // The activity history has it, by the manager, naming the team member (staff, not a customer).
    expect((await listActivity({}, 1, 1)).rows[0]).toMatchObject({ actor: "Ciara Walsh", area: "settings", summary: `Changed ${sales.name}'s role from Sales to Finance`, refLabel: sales.name });
    expect((await setRoleAction(sales.id, undefined, form({ role: "Owner" })))?.errors?.role).toMatch(/Only an owner/);
    expect((await setRoleAction(owner.id, undefined, form({ role: "Sales" })))?.errors?.role).toMatch(/Only an owner/);
    expect((await addTeamAction(undefined, form({ name: "New boss", email: "boss@example.com", role: "Owner" })))?.errors?.role).toMatch(/Only an owner/);
    await removeTeamAction(owner.id);
    expect((await getSettings()).team.find((t) => t.id === owner.id)?.role).toBe("Owner");
  });

  it("sales and finance cannot change the team or the settings", async () => {
    for (const r of ["Sales", "Finance"]) {
      role = r;
      const sales = (await getSettings()).team.find((t) => t.role === "Sales")!;
      expect((await addTeamAction(undefined, form({ name: "Sneaky", email: "sneaky@example.com", role: "Sales" })))?.errors?.role).toMatch(/owner or manager/);
      expect((await setRoleAction(sales.id, undefined, form({ role: "Manager" })))?.errors?.role).toMatch(/owner or manager/);
      await removeTeamAction(sales.id);
      expect((await saveTargetsAction(undefined, form({ leadSlaHours: "2", driveSlotMinutes: "30" })))?.errors?.leadSlaHours).toMatch(/owner or manager/);
    }
    expect((await getSettings()).team.map((t) => t.name)).not.toContain("Sneaky");
    expect((await getSettings()).team.filter((t) => t.role === "Manager")).toHaveLength(1); // nobody was promoted
    expect((await getSettings()).leadSlaHours).toBe(24);
  });
});

describe("lead emails", () => {
  beforeEach(() => {
    role = undefined;
    return settingsStore.reset();
  });
  it("records a change in the activity history, and not a save that changed nothing", async () => {
    const before = (await listActivity({ area: "settings" }, 1, 1)).total;
    await saveLeadEmailsAction(undefined, form({ leadEmails: "a@example.com" }));
    await saveLeadEmailsAction(undefined, form({ leadEmails: "a@example.com" }));
    const after = await listActivity({ area: "settings" }, 1, 1);
    expect(after.total).toBe(before + 1);
    expect(after.rows[0].summary).toBe("Changed who gets the lead emails");
  });

  it("saves a list (lower case, no repeats), and an empty box goes back to the site's own address", async () => {
    expect((await saveLeadEmailsAction(undefined, form({ leadEmails: "A@example.com, b@example.com\na@example.com" })))?.saved).toBe(true);
    expect((await getSettings()).leadEmails).toEqual(["a@example.com", "b@example.com"]);
    await saveLeadEmailsAction(undefined, form({ leadEmails: "" }));
    expect((await getSettings()).leadEmails).toEqual([]);
  });
  it("refuses a bad address or more than five, and changes nothing", async () => {
    expect((await saveLeadEmailsAction(undefined, form({ leadEmails: "ok@example.com nope" })))?.errors?.leadEmails).toMatch(/not a valid email/);
    expect((await saveLeadEmailsAction(undefined, form({ leadEmails: "1@example.com 2@example.com 3@example.com 4@example.com 5@example.com 6@example.com" })))?.errors?.leadEmails).toMatch(/5 addresses or fewer/);
    expect((await getSettings()).leadEmails).toEqual([]);
  });
});

describe("reset demo data", () => {
  it("puts the records back, and the Reserved marks with them: only on the cars with a held deposit", async () => {
    role = undefined; // the owner
    const car = (await adminCars()).find((c) => !c.soldAt && !c.reserved)!;
    const held = (await adminCars()).find((c) => c.reserved)!;
    await saveCar({ ...car, reserved: true });
    await saveCar({ ...held, reserved: undefined });
    await resetDemoAction();
    expect((await adminCars()).find((c) => c.id === car.id)?.reserved).toBeUndefined();
    expect((await adminCars()).find((c) => c.id === held.id)?.reserved).toBe(true);
  });
});

describe("the other settings", () => {
  beforeEach(async () => {
    role = undefined;
    await settingsStore.reset();
  });

  it("saves the slot length within its limits", async () => {
    expect((await saveTargetsAction(undefined, form({ leadSlaHours: "24", driveSlotMinutes: "10" })))?.errors?.driveSlotMinutes).toBe("At least 15 minutes");
    expect((await saveTargetsAction(undefined, form({ leadSlaHours: "24", driveSlotMinutes: "90" })))?.saved).toBe(true);
    expect((await getSettings()).driveSlotMinutes).toBe(90);
  });

  it("switches the morning follow-up email on and off", async () => {
    await saveNotificationsAction(undefined, form({}));
    expect((await getSettings()).notifications.followUps).toBe(false);
    await saveNotificationsAction(undefined, form({ followUps: "on" }));
    expect((await getSettings()).notifications.followUps).toBe(true);
  });

  it("keeps the marketing voice within its lengths", async () => {
    expect((await saveMarketingAction(undefined, form({ voice: "x".repeat(201), hashtags: "", signOff: "" })))?.errors).toBeDefined();
    expect((await saveMarketingAction(undefined, form({ voice: "Friendly", hashtags: "#cars", signOff: "See you soon" })))?.saved).toBe(true);
    expect((await getSettings()).marketing).toEqual({ voice: "Friendly", hashtags: "#cars", signOff: "See you soon" });
  });

  it("takes up to five lead email addresses, each once, and refuses a bad one", async () => {
    expect((await saveLeadEmailsAction(undefined, form({ leadEmails: "a@x.example, A@x.example\nb@x.example" })))?.saved).toBe(true);
    expect((await getSettings()).leadEmails).toEqual(["a@x.example", "b@x.example"]);
    expect((await saveLeadEmailsAction(undefined, form({ leadEmails: "a@x.example b@x.example c@x.example d@x.example e@x.example f@x.example" })))?.errors?.leadEmails).toBe("Use 5 addresses or fewer");
    expect((await saveLeadEmailsAction(undefined, form({ leadEmails: "not-an-email" })))?.errors?.leadEmails).toMatch(/is not a valid email$/);
  });

  it("says when the test email cannot go (no email set up here)", async () => {
    expect((await sendTestEmailAction())?.errors?.test).toMatch(/^The test email did not go/);
  });

  it("refuses all of them for Sales and Finance, and writes nothing", async () => {
    const before = await getSettings();
    for (const r of ["Sales", "Finance"]) {
      role = r;
      const results = [
        await saveTargetsAction(undefined, form({ leadSlaHours: "2", driveSlotMinutes: "30" })),
        await saveNotificationsAction(undefined, form({})),
        await saveMarketingAction(undefined, form({ voice: "x", hashtags: "", signOff: "" })),
        await saveLeadEmailsAction(undefined, form({ leadEmails: "sneaky@example.com" })),
        await sendTestEmailAction(),
      ];
      for (const res of results) expect(Object.values(res?.errors ?? {})).toEqual(["Only an owner or manager can change this"]);
    }
    expect(await getSettings()).toEqual(before);
  });

  it("does not reset the demo for Sales", async () => {
    await saveTargetsAction(undefined, form({ leadSlaHours: "12", driveSlotMinutes: "30" })); // as the owner: a change a reset would undo
    role = "Sales";
    await resetDemoAction();
    expect((await getSettings()).leadSlaHours).toBe(12);
  });
});

describe("removing a person", () => {
  it("gives their leads and test drives back to nobody", async () => {
    role = undefined;
    await settingsStore.reset();
    const { drivesStore } = await import("@/lib/admin/collections");
    const person = (await getSettings()).team.find((t) => t.role === "Sales")!;
    const drive = (await drivesStore.list())[0];
    await drivesStore.put({ ...drive, assignedTo: person.name });
    await removeTeamAction(person.id);
    expect((await drivesStore.get(drive.id))!.assignedTo).toBeUndefined();
  });

  it("removes their notifications on their devices, and nobody else's", async () => {
    role = undefined;
    await settingsStore.reset();
    const { pushStore } = await import("@/lib/push");
    const person = (await getSettings()).team.find((t) => t.role === "Sales")!;
    const other = (await getSettings()).team.find((t) => t.role === "Owner")!;
    const sub = (id: string, email: string) => ({ id, email, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, keys: { p256dh: "x", auth: "y" }, label: "Android phone", addedAt: 0 });
    await pushStore.put(sub("push-a", person.email));
    await pushStore.put(sub("push-b", person.email));
    await pushStore.put(sub("push-c", other.email));
    await removeTeamAction(person.id);
    expect((await pushStore.list()).map((s) => s.id)).toEqual(["push-c"]);
  });
});

describe("website keys", () => {
  it("an owner or manager makes one, shown once and kept only as its hash, and revokes it; the history names it, never the key", async () => {
    const { dealerOfSiteKey, hashSiteKey, siteKeysOf } = await import("@/lib/tenancy/directory");
    role = "Manager";
    const made = await makeSiteKeyAction(undefined, form({ label: "Main website" }));
    expect(made?.key).toMatch(/^cw_site_[A-Za-z0-9_-]{43}$/);
    const key = made!.key!;
    const [k] = (await siteKeysOf("checkwork-motors")).filter((x) => x.label === "Main website");
    expect(k).toMatchObject({ dealerId: "checkwork-motors", label: "Main website", lastUsedAt: null, revokedAt: null });
    expect(JSON.stringify(await siteKeysOf("checkwork-motors"))).not.toContain(key); // never listed again
    expect(JSON.stringify(await siteKeysOf("checkwork-motors"))).not.toContain(await hashSiteKey(key)); // nor its hash
    expect((await dealerOfSiteKey(key))?.dealer.id).toBe("checkwork-motors");
    expect(await revokeSiteKeyAction(k.id)).toBeUndefined();
    expect(await dealerOfSiteKey(key)).toBeNull();
    const history = (await listActivity({ area: "settings" }, 1, 5)).rows.map((r) => r.summary);
    expect(history).toEqual(expect.arrayContaining(["Made a website key: Main website", "Revoked the website key: Main website"]));
    expect(JSON.stringify(history)).not.toContain("cw_site_");
  });

  it("refuses Sales, and a name that is empty or more than one line", async () => {
    const { siteKeysOf } = await import("@/lib/tenancy/directory");
    const before = await siteKeysOf("checkwork-motors");
    role = "Sales";
    expect(await makeSiteKeyAction(undefined, form({ label: "Website" }))).toEqual({ errors: { label: "Only an owner or manager can change this" } });
    expect(await revokeSiteKeyAction(before[0].id)).toEqual({ error: "Only an owner or manager can change this" });
    role = "Owner";
    expect((await makeSiteKeyAction(undefined, form({ label: " " })))?.errors?.label).toBeTruthy();
    expect((await makeSiteKeyAction(undefined, form({ label: `a${String.fromCharCode(10)}b` })))?.errors?.label).toBeTruthy();
    expect(await siteKeysOf("checkwork-motors")).toEqual(before);
  });

  it("the demo dealer's fixed key, in memory only, is the one its stored hash says", async () => {
    const { DEMO_SITE_KEY, dealerOfSiteKey } = await import("@/lib/tenancy/directory");
    expect((await dealerOfSiteKey(DEMO_SITE_KEY))?.dealer.id).toBe("checkwork-motors");
  });
});
