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
const { addTeamAction, removeTeamAction, resetDemoAction, saveBusinessAction, saveDefaultsAction, saveLeadEmailsAction, saveMarketingAction, saveMyNotificationsAction, savePersonAction, saveProfileAction, saveTargetsAction, sendTestEmailAction } = await import("./actions");
const { staffStore } = await import("@/lib/whatsapp/store");
const { membersOf } = await import("@/lib/tenancy/directory");
const { adminCars, saveCar } = await import("@/lib/admin/stock-admin");
const { getSettings, leadsStore, ordersStore, reservationsStore, settingsStore } = await import("@/lib/admin/collections");
const { listActivity } = await import("@/lib/admin/activity");
const { dealerById, putMember, resetMemoryDirectory } = await import("@/lib/tenancy/directory");
const { ensureStaff, staffByEmail } = await import("@/lib/auth/attempts");
beforeEach(() => resetMemoryDirectory()); // who is on the team, and as what, is the directory's

const form = (o: Record<string, string | string[]>) => Object.entries(o).reduce((f, [k, v]) => ([v].flat().forEach((x) => f.append(k, x)), f), new FormData());
// A person's role change from their Team dialog: the rest of what they have, as the dialog sends it.
const setRole = async (id: string, role: string) => {
  const t = (await getSettings()).team.find((x) => x.id === id)!;
  return savePersonAction(id, undefined, form({ name: t.name, email: t.email, role }));
};

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
    expect((await setRole(owner.id, "Sales"))?.errors?.role).toMatch(/at least one owner/);
    await removeTeamAction(owner.id);
    expect((await getSettings()).team.some((t) => t.id === owner.id)).toBe(true);
  });

  it("a manager changes everyone but an owner, and cannot make anyone one", async () => {
    role = "Manager";
    const { team } = await getSettings();
    const sales = team.find((t) => t.role === "Sales")!;
    const owner = team.find((t) => t.role === "Owner")!;
    expect((await setRole(sales.id, "Finance"))?.saved).toBe(true);
    // The activity history has it, by the manager, naming the team member (staff, not a customer).
    expect((await listActivity({}, 1, 1)).rows[0]).toMatchObject({ actor: "Ciara Walsh", area: "settings", summary: `Changed ${sales.name}'s role from Sales to Finance`, refLabel: sales.name });
    expect((await setRole(sales.id, "Owner"))?.errors?.role).toMatch(/Only an owner/);
    expect((await setRole(owner.id, "Sales"))?.errors?.role).toMatch(/Only an owner/);
    expect((await addTeamAction(undefined, form({ name: "New boss", email: "boss@example.com", role: "Owner" })))?.errors?.role).toMatch(/Only an owner/);
    await removeTeamAction(owner.id);
    expect((await getSettings()).team.find((t) => t.id === owner.id)?.role).toBe("Owner");
  });

  it("sales and finance cannot change the team or the settings", async () => {
    for (const r of ["Sales", "Finance"]) {
      role = r;
      const sales = (await getSettings()).team.find((t) => t.role === "Sales")!;
      expect((await addTeamAction(undefined, form({ name: "Sneaky", email: "sneaky@example.com", role: "Sales" })))?.errors?.role).toMatch(/owner or manager/);
      expect((await setRole(sales.id, "Manager"))?.errors?.role).toMatch(/owner or manager/);
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

  it("saves the reply time and the slot each on its own", async () => {
    expect((await saveTargetsAction(undefined, form({ leadSlaHours: "6" })))?.saved).toBe(true);
    expect((await saveTargetsAction(undefined, form({ driveSlotMinutes: "45" })))?.saved).toBe(true);
    expect(await getSettings()).toMatchObject({ leadSlaHours: 6, driveSlotMinutes: 45 });
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
  it("the demo dealer's fixed key, in memory only, is the one its stored hash says", async () => {
    const { DEMO_SITE_KEY, dealerOfSiteKey } = await import("@/lib/tenancy/directory");
    expect((await dealerOfSiteKey(DEMO_SITE_KEY))?.dealer.id).toBe("checkwork-motors");
  });
});

describe("your account and a person's details (#142)", () => {
  beforeEach(async () => {
    role = undefined;
    await settingsStore.reset();
    await staffStore.reset();
    await leadsStore.reset();
    await reservationsStore.reset();
    await ordersStore.reset();
  });
  const find = async (r: string) => (await getSettings()).team.find((t) => t.role === r)!;

  it("lets anyone change their own name and phone, and a new name follows them to their leads", async () => {
    role = "Sales";
    const me = await find("Sales");
    const lead = (await leadsStore.list()).find((l) => l.assignedTo === me.name)!;
    expect(await saveProfileAction(undefined, form({ name: "Conor D", phone: "+353 85 111 2222", email: "hacker@example.com" }))).toEqual({ saved: true });
    expect((await getSettings()).team.find((t) => t.id === me.id)).toMatchObject({ name: "Conor D", email: me.email }); // never the email
    expect((await staffStore.get(me.id))?.phone).toBe("+353 85 111 2222");
    expect((await leadsStore.get(lead.id))?.assignedTo).toBe("Conor D");
    // Their deposits and orders too, so a sale from a held car and the orders filter name someone on the team.
    for (const x of [...(await reservationsStore.list()), ...(await ordersStore.list())]) expect(x.salesperson).not.toBe(me.name);
    expect((await saveProfileAction(undefined, form({ name: "Aoife Brennan", phone: "" })))?.errors?.name).toMatch(/already on the team/);
    expect((await saveProfileAction(undefined, form({ name: "Conor D", phone: "abc" })))?.errors?.phone).toBeTruthy();
  });

  it("saves their own grid, keeping what a hidden column or module had, and never WhatsApp for Finance", async () => {
    role = "Sales";
    const me = await find("Sales");
    expect(await saveMyNotificationsAction(undefined, form({ "notify-grid": "1", "notify-push": ["enquiry"], "notify-email": ["follow-ups"], "notify-whatsapp": ["trade-in"], quietFrom: "21:00", quietTo: "08:00" }))).toEqual({ saved: true });
    expect(await staffStore.get(me.id)).toMatchObject({ push: ["enquiry"], email: ["follow-ups"], alerts: ["trade-in"], quietFrom: "21:00", quietTo: "08:00" });
    expect((await saveMyNotificationsAction(undefined, form({ "notify-grid": "1", quietFrom: "21:00" })))?.errors?.quietTo).toBeTruthy();
    role = "Finance";
    const fin = await find("Finance");
    const was = (await staffStore.get(fin.id))!.alerts;
    await saveMyNotificationsAction(undefined, form({ "notify-grid": "1", "notify-whatsapp": ["finance", "deposit"], "notify-push": [] }));
    expect((await staffStore.get(fin.id))!.alerts).toEqual(was); // no WhatsApp column: what was there stays, and nothing is sent to it
    expect((await staffStore.get(fin.id))!.push).toEqual([]);
  });

  it("an owner or manager changes a person's email, and the directory follows; sales cannot", async () => {
    role = "Manager";
    const sales = await find("Sales");
    expect(await savePersonAction(sales.id, undefined, form({ name: sales.name, email: "conor.new@example.com", role: "Sales", phone: "" }))).toEqual({ saved: true });
    const emails = (await membersOf("checkwork-motors")).map((m) => m.email);
    expect(emails).toContain("conor.new@example.com");
    expect(emails).not.toContain(sales.email);
    expect((await getSettings()).team.find((t) => t.id === sales.id)?.email).toBe("conor.new@example.com");
    expect((await savePersonAction(sales.id, undefined, form({ name: sales.name, email: "aoife@example.com", role: "Sales" })))?.errors?.email).toMatch(/already on the team/);
    role = "Sales";
    expect((await savePersonAction(sales.id, undefined, form({ name: "Renamed", email: "conor.new@example.com", role: "Sales" })))?.errors?.role).toMatch(/owner or manager/);
    // Never their own: Access still signs them in with the old address.
    role = "Manager";
    const self = await find("Manager");
    expect((await savePersonAction(self.id, undefined, form({ name: self.name, email: "manager.new@example.com", role: "Manager" })))?.errors?.email).toMatch(/your own sign-in email/);
  });

  it("a changed email takes the person's sign-in with it (passkeys and sessions keep its id), unless it is shared or taken", async () => {
    role = "Manager";
    const sales = await find("Sales");
    const signIn = await ensureStaff(sales.email.toLowerCase(), Date.now());
    expect(await savePersonAction(sales.id, undefined, form({ name: sales.name, email: "conor.moved@example.com", role: "Sales", phone: "" }))).toEqual({ saved: true });
    expect((await staffByEmail("conor.moved@example.com"))?.id).toBe(signIn.id);
    expect(await staffByEmail(sales.email.toLowerCase())).toBeUndefined();
    // Someone else already signs in with the address: refused, nothing moves.
    await ensureStaff("taken@example.com", Date.now());
    expect((await savePersonAction(sales.id, undefined, form({ name: sales.name, email: "taken@example.com", role: "Sales" })))?.errors?.email).toMatch(/already signs in/);
    // On another dealer's team too: their sign-in is not this dealer's to move.
    await putMember("another-dealer", "conor.moved@example.com", "Sales");
    expect((await savePersonAction(sales.id, undefined, form({ name: sales.name, email: "conor.third@example.com", role: "Sales" })))?.errors?.email).toMatch(/another dealer/);
    expect((await staffByEmail("conor.moved@example.com"))?.id).toBe(signIn.id);
  });

  it("starts a new person with the owner's defaults (a role's senders still skip what it may not get); only an owner sets them", async () => {
    role = "Manager";
    expect((await saveDefaultsAction(undefined, form({ "notify-grid": "1", "notify-push": ["assigned"] })))?.errors?.defaults).toMatch(/Only an owner/);
    role = undefined;
    expect(await saveDefaultsAction(undefined, form({ "notify-grid": "1", "notify-push": ["assigned"], "notify-email": ["follow-ups"], "notify-whatsapp": ["enquiry", "monday"] }))).toEqual({ saved: true });
    await addTeamAction(undefined, form({ name: "New Person", email: "new.person@example.com", role: "Sales" }));
    const added = (await getSettings()).team.find((t) => t.name === "New Person")!;
    expect(await staffStore.get(added.id)).toMatchObject({ push: ["assigned"], email: ["follow-ups"], alerts: ["enquiry", "monday"], phone: "" });
    // Someone already on the team with no record of their own keeps their role's, not the new defaults.
    const sales = await find("Sales");
    await staffStore.remove(sales.id);
    const { people } = await import("@/lib/people");
    const { roleDefaults } = await import("@/lib/notify-rules");
    expect((await people()).find((t) => t.id === sales.id)?.prefs).toEqual(roleDefaults("Sales", (await getSettings()).notifications.followUps));
  });
});
