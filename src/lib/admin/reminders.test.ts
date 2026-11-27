import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  sales: new Map<string, Record<string, unknown>>(),
  customers: [] as Record<string, unknown>[],
  leads: [] as Record<string, unknown>[],
  histories: [] as { id: string; history: Record<string, unknown> }[],
  demo: false,
  modules: new Set(["sales", "whatsapp"]),
  channel: "whatsapp" as "whatsapp" | "none", // what a marketing message would go by now
  wa: [] as { d: Record<string, unknown>; kind: string }[],
  mail: [] as { to: string[]; subject: string; text: string; replyTo?: string }[],
  bounce: false, // the next email fails
}));
vi.mock("./collections", () => ({
  salesStore: {
    list: async () => [...db.sales.values()],
    update: async (id: string, fn: (x: never) => Record<string, unknown>) => void db.sales.set(id, fn(db.sales.get(id) as never)),
  },
  customersStore: { list: async () => db.customers },
  leadsStore: { list: async () => db.leads },
}));
vi.mock("./activity", () => ({ logActivity: async () => {} }));
vi.mock("@/lib/history", () => ({ carHistoryStore: { list: async () => db.histories } }));
vi.mock("./stock-admin", () => ({ adminCars: async () => [{ id: "car-1", reg: "191-D-1" }] }));
vi.mock("@/lib/tenancy/current", () => ({ currentDealer: async () => ({ name: "Byrne Motors", demo: db.demo, profile: { phone: "01 234 5678", rules: { serviceMonths: 12 } } }) }));
vi.mock("@/lib/integrations", () => ({ simulating: async () => db.demo }));
vi.mock("@/lib/modules", () => ({ hasModule: async (m: string) => db.modules.has(m) }));
vi.mock("@/lib/leads/mail", () => ({
  leadRecipients: async () => ["sales@byrne.ie"],
  sendTo: async (to: string[], m: { subject: string; text: string; replyTo?: string }) => {
    if (db.bounce) throw ((db.bounce = false), new Error(`${to[0]} bounced`));
    db.mail.push({ to, ...m });
  },
}));
// As the real one with canEmail false: WhatsApp when it can go (recorded in the conversation; simulated on a demo), else nothing.
vi.mock("@/lib/whatsapp/send", () => ({
  whatsappChannel: async () => db.channel,
  sendWhatsApp: async (d: Record<string, unknown>, kind: string) => (db.channel === "whatsapp" ? (db.wa.push({ d, kind }), d) : null),
}));
const { REMINDER_LEAD_DAYS, dueThisMonth, nctDue, reminderFacts, reminderReach, reminderText, remindersDue, sendReminders, serviceDue } = await import("./reminders");

const NOW = Date.parse("2026-11-24T10:00:00Z"); // today, 24 Nov 2026
const sale = (o: Record<string, unknown> = {}) => ({ id: "car-1", carTitle: "2019 Ford Focus", priceEur: 9000, soldOn: "2025-11-24", customerId: "cust-1", createdAt: 0, ...o });
const history = (nctExpiry?: string) => ({ reg: "191-D-1", checkedOn: "2025-11-01", financeOwed: false, mileage: [], mileageOff: false, imported: false, nctExpiry });
beforeEach(() => {
  db.sales.clear();
  db.sales.set("car-1", sale());
  db.customers = [{ id: "cust-1", name: "Pat Byrne", email: "pat@mail.ie", phone: "+353 83 000 1234", marketingConsent: true }];
  db.leads = [];
  db.histories = [];
  db.demo = false;
  db.modules = new Set(["sales", "whatsapp"]);
  db.channel = "whatsapp";
  db.wa = [];
  db.mail = [];
  db.bounce = false;
});

describe("the due dates", () => {
  it("takes the NCT typed on the sale, else the history check's, never one that ran out before the sale", () => {
    const car = (nct: string, reg = "191-D-1") => ({ reg, history: history(nct) as never });
    expect(nctDue({ soldOn: "2026-01-10", nctDue: "2026-12-01" }, car("2027-05-01"))).toBe("2026-12-01");
    expect(nctDue({ soldOn: "2026-01-10" }, car("2027-05-01"))).toBe("2027-05-01");
    expect(nctDue({ soldOn: "2026-01-10" }, car("2027-05-01", "191 d 1"))).toBe("2027-05-01"); // the same plate, typed loosely
    expect(nctDue({ soldOn: "2026-01-10" }, car("2025-12-01"))).toBeUndefined(); // done since, as prep
    expect(nctDue({ soldOn: "2026-01-10" }, car("2027-05-01", "201-D-2"))).toBeUndefined(); // a check of another plate (the reg corrected since)
    expect(nctDue({ soldOn: "2026-01-10" }, { history: history("2027-05-01") as never })).toBeUndefined(); // the car is gone: no plate to match
    expect(nctDue({ soldOn: "2026-01-10" })).toBeUndefined();
  });
  it("puts the service the rule's months after the sale, unless typed, and the next one after a past one", () => {
    expect(serviceDue({ soldOn: "2026-03-10" }, 12, "2026-11-24")).toBe("2027-03-10");
    expect(serviceDue({ soldOn: "2026-03-10", serviceDue: "2026-12-01" }, 12, "2026-11-24")).toBe("2026-12-01");
    expect(serviceDue({ soldOn: "2024-03-10" }, 12, "2026-11-24")).toBe("2027-03-10"); // the third
    expect(serviceDue({ soldOn: "2025-11-20" }, 12, "2026-11-24")).toBe("2026-11-20"); // a few days past still counts, for a missed run
    expect(serviceDue({ soldOn: "2025-11-20" }, 0, "2026-11-24")).toBeUndefined(); // a rule of 0: no service reminder
    expect(serviceDue({ soldOn: "2025-11-20", serviceDue: "2026-12-01" }, 0, "2026-11-24")).toBe("2026-12-01"); // unless typed
  });
  it("keeps month ends: 31 January is due on the last of each month after, never drifting", () => {
    expect(serviceDue({ soldOn: "2026-01-31" }, 1, "2026-01-31")).toBe("2026-02-28");
    expect(serviceDue({ soldOn: "2026-01-31" }, 1, "2026-03-20")).toBe("2026-03-31");
    expect(serviceDue({ soldOn: "2024-02-29" }, 12, "2024-03-01")).toBe("2025-02-28");
    expect(serviceDue({ soldOn: "2024-02-29" }, 12, "2027-11-24")).toBe("2028-02-29"); // a leap year again
  });
});

describe("which reminders are due", () => {
  it("the NCT 30 days before its day, the service on its day, a week late at most", () => {
    expect(REMINDER_LEAD_DAYS).toEqual({ nct: 30, service: 0 });
    const s = sale({ soldOn: "2025-12-24", nctDue: "2026-12-24" }) as never;
    expect(remindersDue(s, undefined, 12, "2026-11-23")).toEqual([]);
    expect(remindersDue(s, undefined, 12, "2026-11-24")).toEqual([{ kind: "nct", due: "2026-12-24" }]);
    expect(remindersDue(s, undefined, 12, "2026-12-24")).toEqual([{ kind: "nct", due: "2026-12-24" }, { kind: "service", due: "2026-12-24" }]);
    expect(remindersDue(s, undefined, 12, "2026-12-31")).toHaveLength(2);
    expect(remindersDue(s, undefined, 12, "2027-01-01")).toEqual([]);
  });
  it("drops an NCT past by more than the late week, so a page never shows it for ever", () => {
    const s = sale({ soldOn: "2025-11-24", nctDue: "2026-11-10" }) as never;
    expect(reminderFacts(s, undefined, 12, "2026-11-17")[0]).toBe("NCT due 10 Nov 2026");
    expect(reminderFacts(s, undefined, 12, "2026-11-24")).toEqual(["Service due 24 Nov 2026"]);
  });
  it("once per due date, never for a sale undone or with no buyer", () => {
    const s = sale({ soldOn: "2025-11-24", reminders: [{ kind: "service", due: "2026-11-24", on: "2026-11-24", via: "email" }] }) as never;
    expect(remindersDue(s, undefined, 12, "2026-11-24")).toEqual([]);
    expect(remindersDue(sale({ returnedOn: "2025-11-30" }) as never, undefined, 12, "2026-11-24")).toEqual([]);
    expect(remindersDue(sale({ customerId: undefined }) as never, undefined, 12, "2026-11-24")).toEqual([]);
    expect(remindersDue(sale() as never, undefined, 12, "2026-11-24")).toEqual([{ kind: "service", due: "2026-11-24" }]);
  });
});

describe("who gets one", () => {
  const optedIn = [{ id: "l", whatsappOptIn: true, phone: "087 123 4567" }];
  it("only a buyer who agreed to marketing, by WhatsApp if opted in and it can go, else email", () => {
    expect(reminderReach({ email: "a@b.ie", marketingConsent: false }, optedIn, true)).toBeNull();
    expect(reminderReach({ email: "a@b.ie", marketingConsent: true }, optedIn, true)).toEqual({ via: "whatsapp", leadId: "l" });
    expect(reminderReach({ email: "a@b.ie", marketingConsent: true }, optedIn, false)).toEqual({ via: "email" });
    expect(reminderReach({ email: "", marketingConsent: true }, [], true)).toBeNull(); // no way to reach them
  });
  it("never someone who stopped messages", () => {
    expect(reminderReach({ email: "a@b.ie", marketingConsent: true }, [{ id: "l", whatsappOptIn: false, phone: "087 123 4567" }], true)).toBeNull();
  });
});

describe("the message", () => {
  it("is short and plain, with no dash", () => {
    const nct = reminderText("nct", "Pat", "2019 Ford Focus", "2026-12-24", "Byrne Motors", "01 234 5678");
    expect(nct).toBe("Hi Pat, the NCT on your 2019 Ford Focus is due on 24 December. Byrne Motors can book it in for you: reply here or call 01 234 5678.");
    expect(reminderText("service", "Pat", "2019 Ford Focus", "2026-12-24", "Byrne Motors", "")).toBe("Hi Pat, your 2019 Ford Focus is due a service on 24 December. Byrne Motors can book it in for you: just reply here.");
    expect(nct).not.toMatch(/[–—]/);
  });
  it("and the dashboard says the dates and what was sent", () => {
    const s = sale({ nctDue: "2026-12-24", reminders: [{ kind: "nct", due: "2026-12-24", on: "2026-11-24", via: "whatsapp" }] }) as never;
    expect(reminderFacts(s, undefined, 12, "2026-11-24")).toEqual(["NCT due 24 Dec 2026", "Service due 24 Nov 2026", "NCT reminder sent 24 Nov 2026"]);
  });
});

describe("this month's list", () => {
  it("lists each buyer's NCT and service due this month, sent or not, never a sale undone", () => {
    const sales = [sale({ soldOn: "2025-11-02" }), sale({ id: "car-2", nctDue: "2026-11-30", soldOn: "2026-06-01", reminders: [{ kind: "nct", due: "2026-11-30", on: "2026-10-31", via: "email" }] }), sale({ id: "car-3", soldOn: "2025-11-10", returnedOn: "2025-11-12" })];
    const rows = dueThisMonth(sales as never, db.customers as never, () => undefined, 12, "2026-11-24");
    expect(rows.map((r) => [r.sale.id, r.kind, r.due, r.sent?.on])).toEqual([["car-1", "service", "2026-11-02", undefined], ["car-2", "nct", "2026-11-30", "2026-10-31"]]);
  });
});

describe("the daily job", () => {
  it("sends by WhatsApp as marketing usage, records it on the sale, and sends it once only", async () => {
    db.leads = [{ id: "lead-1", email: "pat@mail.ie", phone: "+353 83 000 1234", whatsappOptIn: true }];
    expect(await sendReminders(NOW)).toEqual({ sent: 1, failed: 0 });
    expect(db.wa).toEqual([{ d: expect.objectContaining({ thread: "buyer", leadId: "lead-1", ref: "car-1", text: expect.stringContaining("due a service on 24 November") }), kind: "marketing" }]);
    expect(db.sales.get("car-1")!.reminders).toEqual([{ kind: "service", due: "2026-11-24", on: "2026-11-24", via: "whatsapp" }]);
    expect(await sendReminders(NOW)).toEqual({ sent: 0, failed: 0 });
    expect(db.wa).toHaveLength(1);
  });
  it("sends by email with the dealer's reply-to and the way out when WhatsApp cannot go", async () => {
    db.leads = [{ id: "lead-1", email: "pat@mail.ie", phone: "+353 83 000 1234", whatsappOptIn: true }];
    db.channel = "none"; // past the cap: a marketing message is not sent by WhatsApp
    expect(await sendReminders(NOW)).toEqual({ sent: 1, failed: 0 });
    expect(db.mail).toEqual([{ to: ["pat@mail.ie"], subject: "Byrne Motors: your service is due", text: expect.stringContaining("reply and say so"), replyTo: "sales@byrne.ie" }]);
    expect(db.sales.get("car-1")!.reminders).toMatchObject([{ via: "email" }]);
  });
  it("sends nothing to a buyer without consent, who stopped, with no way to reach, or for a sale undone", async () => {
    db.customers[0].marketingConsent = false;
    expect(await sendReminders(NOW)).toEqual({ sent: 0, failed: 0 });
    db.customers[0].marketingConsent = true;
    db.leads = [{ id: "lead-1", email: "pat@mail.ie", phone: "", whatsappOptIn: false }];
    expect(await sendReminders(NOW)).toEqual({ sent: 0, failed: 0 });
    db.leads = [];
    db.customers[0].email = "";
    expect(await sendReminders(NOW)).toEqual({ sent: 0, failed: 0 });
    db.customers[0].email = "pat@mail.ie";
    db.sales.set("car-1", sale({ returnedOn: "2025-11-30" }));
    expect(await sendReminders(NOW)).toEqual({ sent: 0, failed: 0 });
    expect([db.wa, db.mail]).toEqual([[], []]);
  });
  it("on a demo dealer sends nothing outside, and still records it", async () => {
    db.demo = true;
    expect(await sendReminders(NOW)).toEqual({ sent: 1, failed: 0 });
    expect(db.mail).toEqual([]);
    expect(db.sales.get("car-1")!.reminders).toMatchObject([{ kind: "service", via: "email" }]);
  });
  it("uses the history check's NCT, and does nothing without the sales module", async () => {
    db.sales.set("car-1", sale({ soldOn: "2026-06-01" }));
    db.histories = [{ id: "car-1", history: history("2026-12-20") }];
    expect(await sendReminders(NOW)).toEqual({ sent: 1, failed: 0 });
    expect(db.mail[0].text).toContain("the NCT on your 2019 Ford Focus is due on 20 December");
    db.modules = new Set();
    db.sales.set("car-1", sale());
    expect(await sendReminders(NOW)).toEqual({ sent: 0, failed: 0 });
  });
  it("counts a failed send, never marks it sent, and goes on to the next", async () => {
    db.sales.set("car-2", sale({ id: "car-2", customerId: "cust-2" }));
    db.customers.push({ id: "cust-2", name: "Ann Kelly", email: "ann@mail.ie", phone: "", marketingConsent: true });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    db.bounce = true;
    expect(await sendReminders(NOW)).toEqual({ sent: 1, failed: 1 });
    expect(db.sales.get("car-1")!.reminders).toBeUndefined();
    expect(db.sales.get("car-2")!.reminders).toHaveLength(1);
    expect(err.mock.calls.flat().join(" ")).not.toContain("pat@");
    err.mockRestore();
  });
});
