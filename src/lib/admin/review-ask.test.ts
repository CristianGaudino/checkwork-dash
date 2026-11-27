import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  sales: new Map<string, Record<string, unknown>>(),
  customers: new Map<string, Record<string, unknown>>(),
  leads: [] as Record<string, unknown>[],
  placeId: "ChIJ1" as string | undefined,
  demo: false,
  whatsapp: true,
  channel: "whatsapp" as "whatsapp" | "email", // what sendWhatsApp would pick (simulated and under the cap, or not)
  wa: [] as Record<string, unknown>[],
  mail: [] as { to: string[]; text: string; replyTo?: string }[],
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
vi.mock("@/lib/integrations", () => ({ simulating: async () => db.demo, isUsable: async () => db.whatsapp }));
vi.mock("@/lib/modules", () => ({ hasModule: async () => true })); // every dealer has every module (#212): the connection decides
vi.mock("@/lib/leads/mail", () => ({
  leadRecipients: async () => ["sales@byrne.ie"],
  sendTo: async (to: string[], m: { text: string; replyTo?: string }) => void db.mail.push({ to, text: m.text, replyTo: m.replyTo }),
}));
// As the real one: `email` records it as sent by email; otherwise WhatsApp when it can go, else (no address to fall back to) nothing.
vi.mock("@/lib/whatsapp/send", () => ({
  whatsappChannel: async () => db.channel,
  sendWhatsApp: async (d: Record<string, unknown>, _k: string, o: { email?: boolean; canEmail?: boolean } = {}) =>
    o.email ? (db.wa.push({ ...d, via: "email" }), { ...d, via: "email" }) : db.channel === "whatsapp" ? (db.wa.push(d), d) : o.canEmail === false ? null : (db.wa.push({ ...d, via: "email" }), { ...d, via: "email" }),
}));
const { DEMO_PLACE_ID, REVIEW_OPT_OUT, askForReview, leadsIndex, leadsOf, reviewByWhatsApp, reviewLink, reviewReach } = await import("./review-ask");

const lead = (o: Record<string, unknown>) => ({ id: "lead-1", type: "enquiry", status: "won", name: "Pat Byrne", email: "", phone: "+353 83 000 1234", message: "", source: "Website", notes: [], createdAt: 0, ...o });
beforeEach(() => {
  db.sales.clear();
  db.customers.clear();
  db.leads = [];
  db.placeId = "ChIJ1";
  db.demo = false;
  db.whatsapp = true;
  db.channel = "whatsapp";
  db.wa = [];
  db.mail = [];
  db.activity = [];
  db.sales.set("car-1", { id: "car-1", carTitle: "2019 Ford Focus", priceEur: 9000, soldOn: "2026-11-24", customerId: "cust-1", createdAt: 0 });
  db.customers.set("cust-1", { id: "cust-1", name: "Pat Byrne", email: "pat@mail.ie", phone: "+353 83 000 1234" });
});

describe("reviewReach", () => {
  it("is WhatsApp for a buyer who opted in, else email, else nobody", () => {
    expect(reviewReach({ email: "a@b.ie" }, [{ id: "l", whatsappOptIn: true, phone: "087 123 4567" }], true)).toEqual({ via: "whatsapp", leadId: "l" });
    expect(reviewReach({ email: "a@b.ie" }, [{ id: "l", whatsappOptIn: true, phone: "087 123 4567" }], false)).toEqual({ via: "email" }); // not in the plan
    expect(reviewReach({ email: "a@b.ie" }, [], true)).toEqual({ via: "email" });
    expect(reviewReach({ email: "" }, [{ id: "l", phone: "087 123 4567" }], true)).toBeNull();
  });
  it("emails a buyer who ticked WhatsApp but gave a landline (#196)", () => {
    expect(reviewReach({ email: "a@b.ie" }, [{ id: "l", whatsappOptIn: true, phone: "(021) 496 1234" }], true)).toEqual({ via: "email" });
    expect(reviewReach({ email: "" }, [{ id: "l", whatsappOptIn: true, phone: "(021) 496 1234" }], true)).toBeNull();
  });
  it("never reaches someone who stopped messages", () => {
    expect(reviewReach({ email: "a@b.ie" }, [{ id: "l", whatsappOptIn: false, phone: "087 123 4567" }], true)).toBeNull();
  });
});

describe("reviewByWhatsApp", () => {
  it("is on only when a WhatsApp message would really go", async () => {
    expect(await reviewByWhatsApp()).toBe(true);
    db.channel = "email"; // not simulated (no adapter yet) or past the cap
    expect(await reviewByWhatsApp()).toBe(false);
    db.channel = "whatsapp";
    db.whatsapp = false;
    expect(await reviewByWhatsApp()).toBe(false);
  });
});

describe("leadsIndex", () => {
  it("finds the same leads as leadsOf, in the same order", () => {
    const leads = [
      lead({ id: "a", email: "Pat@Mail.ie ", phone: "" }),
      lead({ id: "b", email: "", phone: "087 123 4567" }),
      lead({ id: "c", email: "pat@mail.ie", phone: "+353 87 123 4567" }),
      lead({ id: "d", email: "other@mail.ie", phone: "12" }),
      lead({ id: "e", email: "", phone: "00353831112222" }),
    ] as never[];
    const theirs = leadsIndex(leads);
    for (const c of [
      { email: "pat@mail.ie", phone: "" },
      { email: "", phone: "0871234567" },
      { email: "PAT@mail.ie", phone: "083 111 2222" },
      { email: "nobody@mail.ie", phone: "12" },
      { email: "", phone: "" },
      { email: "not an email 0831112222", phone: "" },
    ])
      expect(theirs(c).map((l) => (l as { id: string }).id)).toEqual(leadsOf(c, leads).map((l) => l.id));
  });
});

describe("askForReview", () => {
  it("emails the review link once, and stores the day it asked", async () => {
    expect(await askForReview("car-1")).toBe("email");
    expect(db.mail).toEqual([{ to: ["pat@mail.ie"], text: expect.stringContaining(reviewLink("ChIJ1")), replyTo: "sales@byrne.ie" }]); // replies reach the dealer
    expect(db.mail[0].text.endsWith(`

${REVIEW_OPT_OUT}`)).toBe(true);
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
    expect(db.wa[0].text).not.toContain(REVIEW_OPT_OUT); // the way out is the email's
    db.wa = [];
    db.channel = "email"; // past the cap: the email goes, then their conversation says so
    expect(await askForReview("car-1")).toBe("email");
    expect(db.mail).toEqual([{ to: ["pat@mail.ie"], text: expect.any(String), replyTo: "sales@byrne.ie" }]);
    expect(db.wa).toMatchObject([{ leadId: "lead-1", via: "email" }]);
  });

  it("goes by email alone, with nothing in a WhatsApp conversation, while the dealer's WhatsApp is not connected (#212)", async () => {
    db.leads = [lead({ whatsappOptIn: true })];
    db.whatsapp = false;
    expect(await askForReview("car-1")).toBe("email");
    expect(db.mail).toHaveLength(1);
    expect(db.wa).toEqual([]);
  });

  it("never says it went by email in their conversation when the email failed", async () => {
    db.leads = [lead({ whatsappOptIn: true })];
    db.channel = "email";
    const mail = await import("@/lib/leads/mail");
    vi.spyOn(mail, "sendTo").mockRejectedValueOnce(new Error("No lead email went out"));
    await expect(askForReview("car-1")).rejects.toThrow();
    expect(db.wa).toEqual([]);
    expect(db.sales.get("car-1")?.reviewAskedOn).toBeUndefined();
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
    db.channel = "email"; // WhatsApp could not send and there is no address
    expect(await askForReview("car-1")).toBeNull();
    expect(db.mail).toEqual([]);
    expect(db.sales.get("car-1")?.reviewAskedOn).toBeUndefined();
  });
});
