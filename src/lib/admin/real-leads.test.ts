import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { mirrorLead, mirrorOf } = await import("./real-leads");
const { dublinMs } = await import("./format");
const { customersStore, drivesStore, leadsStore } = await import("./collections");
const { noticesStore } = await import("./notifications");
import type { LeadRow } from "@/lib/leads/store";

const row = (over: Partial<LeadRow>): LeadRow => ({ id: "abc", clientRef: "r", type: "enquiry", carId: "1", carSlug: "x-1", carTitle: "2020 Audi A3", carPriceEur: 10000, sourcePath: "/", name: "Pat", phone: null, email: "pat@example.com", message: "Hello", details: {}, photoKeys: [], consentAt: new Date("2026-11-10T10:00:00Z"), consentVersion: "v", ...over });

describe("dublinMs", () => {
  it("reads a time as Irish time: winter is UTC, summer is an hour earlier", () => {
    expect(new Date(dublinMs("2026-01-15", "10:00")).toISOString()).toBe("2026-01-15T10:00:00.000Z");
    expect(new Date(dublinMs("2026-07-15", "10:00")).toISOString()).toBe("2026-07-15T09:00:00.000Z");
  });
});

describe("mirrorOf", () => {
  it("files a warranty claim as a general message for a dealer without the service module, so it shows in Leads", () => {
    const claim = row({ type: "general", sourcePath: "/warranty" });
    expect(mirrorOf(claim).lead?.type).toBe("warranty");
    expect(mirrorOf(claim, true, false).lead?.type).toBe("general");
  });

  it("makes a lead with the visitor's words and marks it as real", () => {
    const m = mirrorOf(row({}));
    expect(m.lead).toMatchObject({ id: "real-abc", type: "enquiry", status: "new", message: "Hello", carTitle: "2020 Audi A3", source: "Website" });
    expect(m.drive).toBeUndefined();
  });
  it("keeps the channel a website lead came from", () => {
    expect(mirrorOf(row({ details: { channel: "Facebook" } })).lead?.channel).toBe("Facebook");
    expect(mirrorOf(row({})).lead).not.toHaveProperty("channel");
  });
  it("makes a booking and a lead from a test drive", () => {
    const m = mirrorOf(row({ type: "test_drive", message: null, details: { driveDate: "2026-11-12", driveTime: "10:30" } }));
    expect(m.drive).toMatchObject({ id: "real-abc", status: "requested", carSlug: "x-1" });
    expect(new Date(m.drive!.startsAt).toISOString()).toBe("2026-11-12T10:30:00.000Z");
    expect(m.lead).toMatchObject({ type: "test-drive", message: "Test drive on 2026-11-12 at 10:30." });
  });
  it("makes an alert, not a lead, from an alert sign-up", () => {
    const m = mirrorOf(row({ type: "alert", name: "Stock alert", details: { alertKind: "price-drop" } }));
    expect(m.lead).toBeUndefined();
    expect(m.alert).toMatchObject({ id: "real-abc", kind: "price-drop", email: "pat@example.com", criteria: "2020 Audi A3", active: true });
  });
  it("says so when the email to the dealer failed", () => {
    const m = mirrorOf(row({ type: "trade_in" }), false);
    expect(m.lead).toMatchObject({ notes: [{ text: expect.stringMatching(/didn't reach you/) }] });
    expect(mirrorOf(row({})).lead!.notes).toEqual([]);
  });
  it("files a message from the Warranty or Service page under that type", () => {
    expect(mirrorOf(row({ type: "general", carId: null, sourcePath: "/warranty" })).lead?.type).toBe("warranty");
    expect(mirrorOf(row({ type: "general", carId: null, sourcePath: "/service" })).lead?.type).toBe("service");
    expect(mirrorOf(row({ type: "general", carId: null, sourcePath: "/contact" })).lead?.type).toBe("general");
  });
  it("keeps the answers with the words: a factory order says the car", () => {
    expect(mirrorOf(row({ type: "order", carId: null, message: "White please", details: { make: "Kia", model: "Sportage", regPeriod: "271" } })).lead).toMatchObject({ type: "order", message: "Kia Sportage, 271 reg\n\nWhite please" });
  });
  it("describes a form with no free text from its answers", () => {
    const m = mirrorOf(row({ type: "finance", message: null, details: { deposit: 2000, term: 48 } }));
    expect(m.lead!.message).toBe("Deposit: 2000. Term (months): 48");
  });
});

describe("mirrorLead", () => {
  it("notes a clash when the same car is already booked at that time", async () => {
    const booking = (id: string) => row({ id, type: "test_drive", message: null, carSlug: "clash-car-1", details: { driveDate: "2030-01-15", driveTime: "10:00" } });
    await mirrorLead(booking("first"));
    await mirrorLead(booking("second"));
    expect((await drivesStore.get("real-first"))?.notes).toBe("");
    expect((await drivesStore.get("real-second"))?.notes).toMatch(/Clashes with another booking/);
  });
});

describe("the spam check on arrival (#56)", () => {
  const pitch = "We offer cheap backlinks and guest posts for your website: https://linkfarm.top";
  it("files clear spam as spam, an unsure one as possible spam, and a real one as it is", () => {
    expect(mirrorOf(row({ message: pitch })).lead).toMatchObject({ status: "spam", statusBefore: "new" });
    expect(mirrorOf(row({ message: "Photos: https://imgur.com/a/x1" })).lead).toMatchObject({ status: "new", maybeSpam: true });
    expect(mirrorOf(row({ message: "Is it still for sale?" })).lead).not.toHaveProperty("maybeSpam");
    expect(mirrorOf(row({ message: "This one? https://www.dealer.ie/cars/a3" }), true, true, 0, undefined, "https://www.dealer.ie").lead).not.toHaveProperty("maybeSpam");
  });
  it("keeps spam, and nothing more: no booking, no customer, no notice", async () => {
    const notices = (await noticesStore.list()).length;
    const customers = (await customersStore.list()).length;
    await mirrorLead(row({ id: "spam-1", type: "test_drive", message: pitch, carSlug: "spam-car-1", details: { driveDate: "2030-01-16", driveTime: "10:00" } }));
    expect((await leadsStore.get("real-spam-1"))?.status).toBe("spam");
    expect(await drivesStore.get("real-spam-1")).toBeUndefined();
    expect((await noticesStore.list()).length).toBe(notices);
    expect((await customersStore.list()).length).toBe(customers);
  });
});
