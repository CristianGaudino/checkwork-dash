import { describe, expect, it } from "vitest";
import { telHref, waHref, wantsWhatsApp } from "./phone";

describe("phone links", () => {
  it("dials an Irish number however it was typed", () => {
    for (const typed of ["087 123 4567", "+353 87 123 4567", "00353871234567", "(087) 123-4567"]) expect(telHref(typed)).toBe("tel:+353871234567");
    expect(waHref("087 123 4567")).toBe("https://wa.me/353871234567");
  });
  it("keeps a foreign number and gives nothing for an empty or short one", () => {
    expect(waHref("+44 7700 900123")).toBe("https://wa.me/447700900123");
    expect(telHref("")).toBeNull();
    expect(waHref("12345")).toBeNull();
  });
  it("drops a (0) after the country code, so Call and WhatsApp reach the right number", () => {
    for (const typed of ["+353 (0)87 765 4321", "+353 (0) 87 765 4321", "00353(0)877654321"]) expect(telHref(typed)).toBe("tel:+353877654321");
    expect(waHref("+353 (0)87 765 4321")).toBe("https://wa.me/353877654321");
    expect(telHref("(01) 906 0045")).toBe("tel:+35319060045"); // an area code in brackets is kept
  });
  it("offers WhatsApp for an Irish mobile or a number from abroad, never an Irish landline", () => {
    for (const mobile of ["083 123 4567", "089 123 4567", "+353 85 123 4567"]) expect(waHref(mobile)).not.toBeNull();
    for (const landline of ["(021) 496 1234", "0402 12345", "+353 1 906 0045", "081 123 4567"]) {
      expect(waHref(landline)).toBeNull();
      expect(telHref(landline)).not.toBeNull();
    }
    expect(waHref("+1 415 555 0100")).toBe("https://wa.me/14155550100");
  });
});

describe("wantsWhatsApp", () => {
  it("is a ticked box with a number that can be on WhatsApp, never a landline (#196)", () => {
    expect(wantsWhatsApp({ whatsappOptIn: true, phone: "087 123 4567" })).toBe(true);
    expect(wantsWhatsApp({ whatsappOptIn: true, phone: "+44 7700 900123" })).toBe(true);
    expect(wantsWhatsApp({ whatsappOptIn: true, phone: "(021) 496 1234" })).toBe(false);
    expect(wantsWhatsApp({ whatsappOptIn: true, phone: "" })).toBe(false);
    expect(wantsWhatsApp({ whatsappOptIn: false, phone: "087 123 4567" })).toBe(false);
  });
});
