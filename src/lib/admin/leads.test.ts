import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import type { Lead } from "./collections";
import { SALES_LEAD_TYPES, countByStatus, filterLeads, isOpenLead, isSalesLead, leadFlag, leadMain, leadsToAnswer, onLeadsList, possibleSpam, openWarrantyRequests, parseLeadFilter, replyVia, statusCounts, urgentFirst } from "./leads";

const lead = (id: string, o: Partial<Lead> = {}): Lead => ({ id, type: "enquiry", status: "new", name: id, email: `${id}@example.com`, phone: "", message: "", source: "Website", notes: [], createdAt: Number(id.replace(/\D/g, "")) || 0, ...o });

describe("lead filters", () => {
  it("ignores values it does not know", () => {
    expect(parseLeadFilter({ status: "hacked", type: "nope", q: "  Ford  " })).toEqual({ status: undefined, type: undefined, q: "ford" });
    expect(parseLeadFilter({ status: "won", type: "finance" })).toMatchObject({ status: "won", type: "finance" });
    expect(parseLeadFilter({ q: "x".repeat(200) }).q).toHaveLength(60);
    expect(parseLeadFilter({ with: "M".repeat(90) }).with).toBe("M".repeat(90)); // a long team name still filters
  });
  it("filters by status, type and text, newest first", () => {
    const leads = [lead("a1", { status: "won" }), lead("a2", { type: "finance", carTitle: "2019 Ford Focus" }), lead("a3", { message: "Is the Ford still here?" })];
    expect(filterLeads(leads, { q: "" }).map((l) => l.id)).toEqual(["a3", "a2", "a1"]);
    expect(filterLeads(leads, { status: "won", q: "" }).map((l) => l.id)).toEqual(["a1"]);
    expect(filterLeads(leads, { type: "finance", q: "" }).map((l) => l.id)).toEqual(["a2"]);
    expect(filterLeads(leads, { q: "ford" }).map((l) => l.id)).toEqual(["a3", "a2"]);
  });
  it("finds a phone number however it was typed, and lists new leads past the reply target", () => {
    const H = 3_600_000;
    const leads = [lead("a1", { phone: "+353 87 123 4567", createdAt: 0 }), lead("a2", { createdAt: 30 * H }), lead("a3", { status: "contacted", createdAt: 0 })];
    expect(filterLeads(leads, { q: "087 123" }).map((l) => l.id)).toEqual(["a1"]);
    expect(filterLeads(leads, { q: "87 1234" }).map((l) => l.id)).toEqual(["a1"]);
    expect(filterLeads(leads, { q: "", late: true }, "", 24, 31 * H).map((l) => l.id)).toEqual(["a1"]);
    expect(parseLeadFilter({ due: "1", late: "1" })).toMatchObject({ due: true, late: undefined });
  });
  it("counts every status, including those with none", () => {
    expect(countByStatus([lead("a1"), lead("a2", { status: "lost" })])).toEqual({ new: 1, contacted: 0, appointment: 0, won: 0, lost: 1, closed: 0, spam: 0 });
  });
  it("counts the status tabs under the search and filters, whatever status is picked", () => {
    const leads = [lead("a1", { name: "Ford" }), lead("a2", { status: "won", name: "Ford" }), lead("a3", { status: "spam", name: "Ford" }), lead("a4"), lead("a5", { status: "won" })];
    expect(statusCounts(leads, { q: "ford" })).toMatchObject({ new: 1, won: 1, spam: 1 });
    expect(statusCounts(leads, { q: "ford", status: "won" })).toEqual(statusCounts(leads, { q: "ford" }));
    expect(statusCounts(leads, { q: "" })).toMatchObject({ new: 2, won: 2, spam: 1 });
  });
});

describe("warranty requests", () => {
  it("are not sales leads, and wait in Aftersales until a claim is opened from them or they are set aside", () => {
    const w = (id: string, o: Partial<Lead> = {}) => lead(id, { type: "warranty", ...o });
    const leads = [lead("l1"), w("w2"), w("w3"), w("w4", { status: "lost" }), w("w5")];
    expect(leads.filter(isSalesLead).map((l) => l.id)).toEqual(["l1"]);
    expect(SALES_LEAD_TYPES).not.toContain("warranty");
    expect(openWarrantyRequests(leads, [{ leadId: "w3" }, { leadId: undefined }]).map((l) => l.id)).toEqual(["w5", "w2"]); // newest first
  });
});

describe("the lead's main button", () => {
  const PHONE = "+353 87 123 4567";
  it("replies the way they got in touch", () => {
    expect(replyVia(lead("a", { source: "Phone", phone: PHONE }))).toBe("call");
    expect(replyVia(lead("a", { type: "general", source: "Website", phone: PHONE }))).toBe("call");
    expect(replyVia(lead("a", { source: "WhatsApp", phone: PHONE }))).toBe("whatsapp");
    expect(replyVia(lead("a", { phone: PHONE, answers: { contactVia: "whatsapp" } }))).toBe("whatsapp");
    expect(replyVia(lead("a", { source: "WhatsApp", phone: PHONE, whatsappOptIn: false }))).toBe("call"); // WhatsApp stopped on the lead
    expect(replyVia(lead("a", { source: "WhatsApp", phone: "(021) 496 1234" }))).toBe("call"); // a landline is not on WhatsApp
    expect(replyVia(lead("a", { phone: PHONE, answers: { contactVia: "email" } }))).toBe("email");
    expect(replyVia(lead("a", { source: "WhatsApp", phone: "" }))).toBe("email"); // no number to message
    expect(replyVia(lead("a", { phone: "12", email: "" }))).toBeUndefined();
  });
  it("is the request's own job when it can be done here, else the reply", () => {
    const all = { drive: true };
    expect(leadMain("enquiry", all)).toBe("reply");
    expect(leadMain("general", all)).toBe("reply");
    expect(leadMain("test-drive", all)).toBe("drive");
    expect(leadMain("test-drive", { ...all, drive: false })).toBe("reply"); // already booked
    expect(leadMain("warranty", all)).toBe("claim");
  });
});

describe("the lateness badge", () => {
  it("is Late past the reply target, else Urgent for this week, never both", () => {
    const H = 3_600_000;
    const hot = { topic: "buying", answers: { timing: "this-week" } };
    expect(leadFlag(lead("a", { createdAt: 0, ...hot }), 24, 30 * H)).toBe("late");
    expect(leadFlag(lead("a", { createdAt: 0, ...hot }), 24, 1 * H)).toBe("urgent");
    expect(leadFlag(lead("a", { createdAt: 0 }), 24, 1 * H)).toBeUndefined();
    expect(leadFlag(lead("a", { createdAt: 0, status: "contacted", ...hot }), 24, 30 * H)).toBeUndefined();
  });
});

describe("the list's order", () => {
  it("pins late and urgent new leads first, the rest keep their order", () => {
    const H = 3_600_000;
    const leads = [lead("a1", { createdAt: 29 * H }), lead("a2", { createdAt: 0 }), lead("a3", { createdAt: 29 * H, topic: "buying", answers: { timing: "this-week" } }), lead("a4", { createdAt: 29 * H })];
    expect(urgentFirst(leads, 30 * H, "1970-01-02", 24).map((l) => l.id)).toEqual(["a2", "a3", "a1", "a4"]);
  });
  it("pins an overdue follow-up too, by To answer now's rule, but not one due today or on a closed lead (#55)", () => {
    const today = "2026-11-10";
    const leads = [lead("b1", { status: "contacted" }), lead("b2", { status: "contacted", followUpOn: today }), lead("b3", { status: "contacted", followUpOn: "2026-11-09" }), lead("b4", { status: "closed", followUpOn: "2026-11-09" })];
    expect(urgentFirst(leads, 0, today, 24).map((l) => l.id)).toEqual(["b3", "b1", "b2", "b4"]);
    // The same leads To answer now marks now (red).
    expect(leadsToAnswer(leads, 0, today, 24).filter((t) => t.urgency === "now").map((t) => t.lead.id)).toEqual(["b3"]);
  });
});

describe("a closed lead (#55)", () => {
  it("is not open, so it leaves To answer now and the follow-ups, and has its own status tab", () => {
    expect(isOpenLead({ status: "closed" })).toBe(false);
    expect(leadsToAnswer([lead("c1", { status: "closed" }), lead("c2", { status: "closed", followUpOn: "2026-11-01" })], 0, "2026-11-10", 24)).toEqual([]);
    expect(countByStatus([lead("c1", { status: "closed" })]).closed).toBe(1);
    expect(parseLeadFilter({ status: "closed" }).status).toBe("closed");
  });
});

describe("spam (#56)", () => {
  const leads = [lead("s1", { status: "spam", statusBefore: "new" }), lead("s2", { maybeSpam: true }), lead("s3")];
  it("is only on its own tab, never open, never to answer; a possible one stays to answer, flagged", () => {
    expect(filterLeads(leads, { q: "" }).map((l) => l.id)).toEqual(["s3", "s2"]);
    expect(filterLeads(leads, { status: "spam", q: "" }).map((l) => l.id)).toEqual(["s1"]);
    expect(isOpenLead({ status: "spam" })).toBe(false);
    expect(leadsToAnswer(leads, 0, "2026-11-10", 24).map((t) => t.lead.id)).toEqual(["s2", "s3"]); // the longest waiting first
    expect(leads.map(possibleSpam)).toEqual([false, true, false]);
    expect(possibleSpam(lead("s4", { maybeSpam: true, status: "contacted" }))).toBe(false); // answered: a person has decided
    expect(openWarrantyRequests([lead("w1", { type: "warranty", status: "spam" })], [])).toEqual([]);
    // Leads lists spam of every kind, so a warranty request marked spam can be put back from its Spam tab.
    const listed = [lead("w2", { type: "warranty", status: "spam" }), lead("w3", { type: "warranty" }), lead("e1", { status: "spam" })].filter(onLeadsList);
    expect(listed.map((l) => l.id)).toEqual(["w2", "e1"]);
    expect(filterLeads(listed, { status: "spam", q: "" }).map((l) => l.id)).toEqual(["w2", "e1"]);
  });
});
