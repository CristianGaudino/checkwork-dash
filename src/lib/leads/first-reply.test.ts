import { describe, expect, it } from "vitest";
import { firstReply, mailtoHref } from "./first-reply";
import { waHref } from "@/lib/phone";

const SITE = "https://www.demo.checkwork.ie";
const car = { slug: "2021-toyota-corolla-4508173", priceEur: 21950, soldAt: undefined, listing: undefined, condition: "used" } as const;
const base = { name: "Mary Byrne", from: "Sean Walsh", dealer: "Checkwork Motors", title: "2021 Toyota Corolla", car, siteUrl: SITE, modules: new Set<never>() };

describe("the first reply to a lead", () => {
  it("says who it is from, the car, its price and its full link on the website", () => {
    const r = firstReply(base);
    expect(r.subject).toBe("The 2021 Toyota Corolla");
    expect(r.body).toBe(
      "Hi Mary,\n\nThis is Sean Walsh at Checkwork Motors. Thanks for getting in touch about the 2021 Toyota Corolla.\n\nIt's €21,950.\n\nYou can see it here: https://www.demo.checkwork.ie/used-cars/2021-toyota-corolla-4508173",
    );
    expect(r.body).not.toMatch(/[—–]/);
    expect(firstReply({ ...base, car: { ...car, vat: "ex" } }).body).toContain("It's €21,950 plus VAT.");
  });

  it("gives no price and no link for a lead about no car", () => {
    const r = firstReply({ ...base, title: undefined, car: undefined });
    expect(r).toEqual({ subject: "Your message to Checkwork Motors", body: "Hi Mary,\n\nThis is Sean Walsh at Checkwork Motors. Thanks for getting in touch." });
  });

  it("says a sold car has sold, with no price or link", () => {
    const { body } = firstReply({ ...base, car: { ...car, soldAt: "2026-11-01" } });
    expect(body).toContain("It has sold");
    expect(body).not.toMatch(/€|https:/);
  });

  it("says a reserved car is reserved, with no price or link", () => {
    const { body } = firstReply({ ...base, car: { ...car, reserved: true } });
    expect(body).toContain("It's reserved at the moment, but we can let you know if that changes.");
    expect(body).not.toMatch(/€|https:/);
  });

  it("leaves out a price on request, and the link with no website or no page there", () => {
    expect(firstReply({ ...base, car: { ...car, priceEur: 0 } }).body).not.toContain("€");
    expect(firstReply({ ...base, siteUrl: "" }).body).not.toContain("https:");
    expect(firstReply({ ...base, car: { ...car, listing: "hidden" } }).body).not.toContain("https:");
    expect(firstReply({ ...base, car: { ...car, condition: "new" } }).body).not.toContain("https:"); // new cars are off the plan
  });

  it("greets them as there with no usable first name, and signs as the dealer with no staff name", () => {
    expect(firstReply({ ...base, name: "M", from: "" }).body).toMatch(/^Hi there,\n\nThis is Checkwork Motors\./);
  });

  it("goes into the mailto and WhatsApp links encoded, and leaves them as they were without one", () => {
    const r = firstReply(base);
    const mail = new URL(mailtoHref("mary@example.com", r));
    expect(mail.searchParams.get("subject")).toBe(r.subject);
    expect(mail.searchParams.get("body")).toBe(r.body);
    expect(mailtoHref("mary@example.com")).toBe("mailto:mary@example.com");
    expect(new URL(waHref("087 123 4567", r.body)!).searchParams.get("text")).toBe(r.body);
    expect(waHref("087 123 4567")).toBe("https://wa.me/353871234567");
  });
});
