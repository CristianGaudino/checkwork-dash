import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  sales: new Map<string, Record<string, unknown>>(),
  customers: new Map<string, Record<string, unknown>>(),
  leads: [] as Record<string, unknown>[],
  placeId: "ChIJ1" as string | undefined,
  demo: false,
  whatsapp: true,
  waVia: undefined as "email" | undefined | null, // null: sendWhatsApp sent nothing
  wa: [] as Record<string, unknown>[],
  mail: [] as { to: string[]; text: string }[],
  activity: [] as string[],
}));
const store = (m: Map<string, Record<string, unknown>>) => ({
  get: async (id: string) => m.get(id),
  update: async (id: string, fn: (x: never) => Record<string, unknown>) => {
    const cur = m.get(id);
    if (cur) m.set(id, fn(cur as never));
    return m.get(id);
  },
});
vi.mock("./collections", () => ({ salesStore: store(db.sales), customersStore: store(db.customers), leadsStore: { list: async () => db.leads } }));
vi.mock("./activity", () => ({ logActivity: async (_a: string, text: string) => void db.activity.push(text) }));
vi.mock("@/lib/tenancy/current", () => ({ currentDealer: async () => ({ name: "Byrne Motors", demo: db.demo, profile: { placeId: db.placeId } }) }));
vi.mock("@/lib/integrations", () => ({ simulating: async () => db.demo }));
vi.mock("@/lib/modules", () => ({ hasModule: async () => db.whatsapp }));
vi.mock("@/lib/leads/mail", () => ({ sendTo: async (to: string[], m: { text: string }) => void db.mail.push({ to, text: m.text }) }));
vi.mock("@/lib/whatsapp/send", () => ({
  sendWhatsApp: async (d: Record<string, unknown>) => (db.waVia === null ? null : (db.wa.push(d), { ...d, via: db.waVia })),
}));
const { DEMO_PLACE_ID, askForReview, reviewLink, reviewReach } = await import("./review-ask");

const lead = (o: Record<string, unknown>) => ({ id: "lead-1", type: "enquiry", status: "won", name: "Pat Byrne", email: "", phone: "+353 83 000 1234", message: "", source: "Website", notes: [], createdAt: 0, ...o });
beforeEach(() => {
  db.sales.clear();
  db.customers.clear();
  db.leads = [];
  db.placeId = "ChIJ1";
  db.demo = false;
  db.whatsapp = true;
  db.waVia = undefined;
  db.wa = [];
  db.mail = [];
  db.activity = [];
  db.sales.set("car-1", { id: "car-1", carTitle: "2019 Ford Focus", priceEur: 9000, soldOn: "2026-11-24", customerId: "cust-1", createdAt: 0 });
  db.customers.set("cust-1", { id: "cust-1", name: "Pat Byrne", email: "pat@mail.ie", phone: "+353 83 000 1234" });
});

describe("reviewReach", () => {
  it("is WhatsApp for a buyer who opted in, else email, else nobody", () => {
    expect(reviewReach({ email: "a@b.ie" }, [{ id: "l", whatsappOptIn: true, phone: "1" }], true)).toEqual({ via: "whatsapp", leadId: "l" });
    expect(reviewReach({ email: "a@b.ie" }, [{ id: "l", whatsappOptIn: true, phone: "1" }], false)).toEqual({ via: "email" }); // not in the plan
    expect(reviewReach({ email: "a@b.ie" }, [], true)).toEqual({ via: "email" });
    expect(reviewReach({ email: "" }, [{ id: "l", phone: "1" }], true)).toBeNull();
  });
  it("never reaches someone who stopped messages", () => {
    expect(reviewReach({ email: "a@b.ie" }, [{ id: "l", whatsappOptIn: false, phone: "1" }], true)).toBeNull();
  });
});

describe("askForReview", () => {
  it("emails the review link once, and stores the day it asked", async () => {
    expect(await askForReview("car-1")).toBe("email");
    expect(db.mail).toEqual([{ to: ["pat@mail.ie"], text: expect.stringContaining(reviewLink("ChIJ1")) }]);
    expect(db.mail[0].text).toMatch(/^Hi Pat, thanks for buying your 2019 Ford Focus from Byrne Motors/);
    expect(db.mail[0].text).not.toMatch(/—/);
    expect(db.sales.get("car-1")?.reviewAskedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(db.activity).toEqual(["Asked the buyer for a Google review, by email"]);
    expect(db.activity.join()).not.toMatch(/Pat/);
    expect(await askForReview("car-1")).toBeNull(); // once per sale
    expect(db.mail).toHaveLength(1);
  });

  it("asks on WhatsApp when the buyer opted in on a lead, and falls back to email past the cap", async () => {
    db.leads = [lead({ whatsappOptIn: true })];
    expect(await askForReview("car-1")).toBe("whatsapp");
    expect(db.wa).toMatchObject([{ thread: "buyer", leadId: "lead-1" }]);
    expect(db.mail).toEqual([]);
    db.sales.set("car-1", { ...db.sales.get("car-1"), reviewAskedOn: undefined });
    db.waVia = "email"; // sendWhatsApp only records the fallback: the one email is sent here
    expect(await askForReview("car-1")).toBe("email");
    expect(db.mail).toEqual([{ to: ["pat@mail.ie"], text: expect.any(String) }]);
  });

  it("sends nothing outside for a demo dealer, but still records the ask", async () => {
    db.demo = true;
    expect(await askForReview("car-1")).toBe("email");
    expect(db.mail).toEqual([]);
    expect(db.sales.get("car-1")?.reviewAskedOn).toBeDefined();
  });

  it("uses a made-up place on a demo with none of its own, so the ask can be shown", async () => {
    db.demo = true;
    db.placeId = undefined;
    db.leads = [lead({ whatsappOptIn: true })];
    expect(await askForReview("car-1")).toBe("whatsapp");
    expect(db.wa[0].text).toContain(reviewLink(DEMO_PLACE_ID));
  });

  it("does not mark the sale asked when the email fails", async () => {
    const mail = await import("@/lib/leads/mail");
    vi.spyOn(mail, "sendTo").mockRejectedValueOnce(new Error("No lead email went out"));
    await expect(askForReview("car-1")).rejects.toThrow();
    expect(db.sales.get("car-1")?.reviewAskedOn).toBeUndefined();
  });

  it("asks nobody without a review link, a sale, or a way to reach them, or once they stopped messages", async () => {
    db.placeId = undefined;
    expect(await askForReview("car-1")).toBeNull();
    db.placeId = "ChIJ1";
    expect(await askForReview("car-2")).toBeNull(); // undone: gone from the car's id
    db.sales.set("car-1", { ...db.sales.get("car-1"), returnedOn: "2026-11-24" });
    expect(await askForReview("car-1")).toBeNull();
    db.sales.set("car-1", { ...db.sales.get("car-1"), returnedOn: undefined });
    db.leads = [lead({ whatsappOptIn: false })];
    expect(await askForReview("car-1")).toBeNull();
    db.leads = [lead({ whatsappOptIn: true })];
    db.customers.set("cust-1", { ...db.customers.get("cust-1"), email: "" });
    db.waVia = null; // WhatsApp could not send and there is no address
    expect(await askForReview("car-1")).toBeNull();
    expect(db.mail).toEqual([]);
    expect(db.sales.get("car-1")?.reviewAskedOn).toBeUndefined();
  });
});
