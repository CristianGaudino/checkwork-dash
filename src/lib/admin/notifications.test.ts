import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { leadLine, markRead, noticeOfLead, noticesFor, noticesStore, notify, readsOf, NOTICE_KEEP_DAYS } = await import("./notifications");
const { LEAD_TYPE_LABELS, LEAD_TYPES } = await import("./collections");
const { DAY } = await import("@/lib/time");

const aoife = { name: "Aoife Brennan", email: "aoife@example.com" };
const conor = { name: "Conor Doyle", email: "conor@example.com" };
const bell = async (r: typeof aoife) => noticesFor(await noticesStore.list(), await readsOf(r), r);

describe("the bell", () => {
  it("is per person: read by one stays unread for the rest, and a notice for someone is theirs alone", async () => {
    for (const n of await noticesStore.list()) await noticesStore.remove(n.id);
    await notify({ kind: "lead", text: "Car enquiry", detail: "2019 Kia Soul", href: "/leads/x" });
    await notify({ kind: "assigned", text: "Ciara Walsh gave you a lead", detail: "Finance application", href: "/leads/y", for: "Conor Doyle" });
    expect((await bell(aoife)).unread).toBe(1);
    expect((await bell(conor)).unread).toBe(2);
    await markRead(conor);
    expect((await bell(conor)).unread).toBe(0);
    expect((await bell(aoife)).unread).toBe(1);
    const [only] = (await bell(aoife)).items;
    await markRead(aoife, [only.id]);
    expect((await bell(aoife)).unread).toBe(0);
  });

  it("keeps both when two people read at the same moment, each in their own record", async () => {
    await notify({ kind: "lead", text: "Finance application", detail: "2019 Kia Soul", href: "/leads/z" });
    await Promise.all([markRead(aoife), markRead(conor)]);
    expect((await bell(aoife)).unread).toBe(0);
    expect((await bell(conor)).unread).toBe(0);
  });

  it("drops what is older than the keep period as new ones come, and forgets reads of what has gone", async () => {
    const now = Date.now();
    await notify({ kind: "sync", text: "DoneDeal stock did not update", href: "/stock" }, now - (NOTICE_KEEP_DAYS + 1) * DAY);
    await markRead(aoife);
    await notify({ kind: "sync", text: "DoneDeal stock did not update", href: "/stock" }, now);
    expect((await noticesStore.list()).every((n) => n.at >= now - NOTICE_KEEP_DAYS * DAY)).toBe(true);
    await markRead(aoife);
    const live = new Set((await noticesStore.list()).map((n) => n.id));
    expect([...(await readsOf(aoife))].every((id) => live.has(id))).toBe(true);
  });

  it("says the kind of request as the heading, and its topic, answers, car and time under it, never who sent it", () => {
    const customer = { name: "Sean O'Brien", email: "sean@example.ie", phone: "087 123 4567" };
    for (const type of LEAD_TYPES) {
      const n = noticeOfLead({ id: "l0", type, carTitle: "2019 Kia Soul", ...customer });
      expect(n.text).toBe(LEAD_TYPE_LABELS[type]);
      expect(n.text).not.toBe("General");
      expect(n.detail).toBe("2019 Kia Soul");
      expect(JSON.stringify(n)).not.toMatch(/Sean|sean@|087/);
    }
    expect(noticeOfLead({ id: "l1", type: "finance", carTitle: "2019 Kia Soul" })).toEqual({ kind: "lead", text: "Finance application", detail: "2019 Kia Soul", href: "/leads/l1" });
    expect(noticeOfLead({ id: "l2", type: "warranty" })).toMatchObject({ kind: "warranty", text: "Warranty request", detail: undefined, href: "/aftersales/requests/l2" });
    // A contact form message: its topic and answers as the leads list tags them, never the reg or how to reach them.
    expect(noticeOfLead({ id: "l4", type: "general", topic: "buying", answers: { timing: "this-week", hasTradeIn: "yes", reg: "201-D-1234", contactVia: "call" } })).toMatchObject({ text: "Message", detail: "Buying, this week, trade-in" });
    expect(noticeOfLead({ id: "l5", type: "service", topic: "service", answers: { serviceNeed: "warning-light", urgency: "this-week" } })).toMatchObject({ text: "Service request", detail: "Service, warning light, this week" });
    expect(noticeOfLead({ id: "l6", type: "general", topic: "other" })).toMatchObject({ text: "Message", detail: undefined }); // "Message" twice says nothing
    // A test drive: the car and the day and time asked for (Irish time), linking to the booking when it has one.
    const at = Date.parse("2026-11-28T11:00:00Z"); // a Saturday
    expect(noticeOfLead({ id: "l3", type: "test-drive", carTitle: "2019 Kia Soul" }, { id: "drive-9", startsAt: at })).toEqual({ kind: "drive", text: "Test drive request", detail: "2019 Kia Soul · asked for Sat 28 Nov, 11:00", href: "/test-drives/drive-9" });
    expect(noticeOfLead({ id: "l3", type: "test-drive", carTitle: "2019 Kia Soul" }, {})).toMatchObject({ href: "/test-drives" });
    expect(leadLine({ type: "enquiry", carTitle: "2019 Kia Soul" })).toBe("Car enquiry · 2019 Kia Soul");
  });

  it("seeds the demo with nothing that names a day, so it stays true", async () => {
    await noticesStore.reset(); // back to the seed
    const seeded = await noticesStore.list();
    expect(seeded.some((n) => n.kind === "drive")).toBe(true);
    expect(seeded.some((n) => /today|tomorrow|yesterday/i.test(`${n.text} ${n.detail ?? ""}`))).toBe(false);
  });
});
