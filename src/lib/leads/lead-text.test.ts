import { describe, expect, it } from "vitest";
import { readLead, splitOldMessage } from "./lead-text";

// A lead stored before #59 glued the form's answers onto its message. Shown, it reads as the new ones do: words, and a list.
describe("splitOldMessage", () => {
  it("reads the answers glued to the front back into answers and the words", () => {
    expect(splitOldMessage("About: Buying a car. Hoping to buy: This month. Came from: Typed in or bookmarked\n\nSomething small, under 15k.")).toEqual({
      text: "Something small, under 15k.",
      given: [["topic", "Buying a car"], ["timing", "This month"], ["channel", "Typed in or bookmarked"]],
    });
  });
  it("reads a message that is only answers, and puts raw figures in words", () => {
    expect(splitOldMessage("Finance: PCP. Deposit: 2000. Term (months): 48. Employment status: self_employed")).toEqual({
      text: "",
      given: [["product", "PCP"], ["deposit", "€2,000"], ["term", "48"], ["employment", "Self-employed"]],
    });
  });
  it("reads an old test drive's day and time in plain words", () => {
    expect(splitOldMessage("Test drive on 2026-11-28 at 10:00. After 5 is best.")).toEqual({ text: "After 5 is best.", given: [["drive", "Sat 28 Nov, 10:00"]] });
    expect(splitOldMessage("Test drive on 2026-11-28 at 10:00.")).toEqual({ text: "", given: [["drive", "Sat 28 Nov, 10:00"]] });
  });
  it("leaves the buyer's own words alone, and a factory order's car", () => {
    for (const m of ["Is it still there? Make: not sure.", "Kia Sportage, 271 reg\n\nWhite please", ""]) expect(splitOldMessage(m)).toEqual({ text: m, given: [] });
  });
});

describe("readLead", () => {
  it("shows an old lead's words, and only the answers no tag or source already shows", () => {
    const old = { message: "About: Buying a car. Hoping to buy: This month. Budget up to: 15000. Came from: Google\n\nHi there", topic: "buying", answers: { timing: "this-month", contactWhen: "evening" }, channel: "Google" };
    expect(readLead(old)).toEqual({ text: "Hi there", facts: { "Budget up to": "€15,000", "Best time": "Evening" } });
  });
  it("keeps an old answer the lead holds nowhere else", () => {
    expect(readLead({ message: "Came from: Google. Hoping to buy: This week" }).facts).toEqual({ "Hoping to buy": "This week", "Came from": "Google" });
  });
  it("shows a new lead's words and stored details as they are, with how to reach them", () => {
    expect(readLead({ message: "Hello", details: { Deposit: "€2,000" }, topic: "finance", answers: { contactVia: "whatsapp" } })).toEqual({ text: "Hello", facts: { Deposit: "€2,000", "Reach by": "WhatsApp" } });
  });
});
