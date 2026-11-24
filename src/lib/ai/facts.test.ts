import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => ({ get: () => null }) }));
const { buildFacts } = await import("./facts");
const { leadsStore } = await import("@/lib/admin/collections");

describe("buildFacts for a lead reply", () => {
  it("gives the car's own details and whether it is still for sale, so the reply can answer", async () => {
    const lead = (await leadsStore.list()).find((l) => l.carSlug)!;
    const built = await buildFacts({ task: "leadReply", leadId: lead.id }, "D", "https://www.demo.checkwork.ie");
    expect(built?.task).toBe("leadReply");
    const f = built!.facts as { carDetails?: { name: string; forSale: boolean; link?: string } };
    expect(f.carDetails).toMatchObject({ name: expect.any(String), forSale: expect.any(Boolean), link: expect.stringContaining(lead.carSlug!) });
    expect(JSON.stringify(f)).not.toContain(lead.email); // the customer's contacts still never go in
  });
  it("gives the price and link of a car for sale, and neither for a sold one (#160)", async () => {
    const { adminCars } = await import("@/lib/admin/stock-admin");
    const stock = await adminCars();
    const [live, sold] = [stock.find((c) => !c.soldAt && !c.listing && c.priceEur > 0 && c.condition !== "new" && c.condition !== "commercial")!, stock.find((c) => c.soldAt)!];
    const lead = (await leadsStore.list())[0]!;
    const facts = async (c: typeof live) => {
      await leadsStore.put({ ...lead, id: "lead-price", carSlug: c.slug, carTitle: c.model });
      return ((await buildFacts({ task: "leadReply", leadId: "lead-price" }, "D", "https://www.demo.checkwork.ie"))!.facts as import("./tasks").FactsOf["leadReply"]).carDetails!;
    };
    expect(await facts(live)).toMatchObject({ price: expect.stringMatching(/^€[\d,]+/), link: `https://www.demo.checkwork.ie/used-cars/${live.slug}` });
    const gone = await facts(sold);
    expect(gone.forSale).toBe(false);
    expect(gone.price).toBeUndefined();
    expect(gone.was).toBeUndefined();
    expect(gone.link).toBeUndefined();
    const { saveCar } = await import("@/lib/admin/stock-admin");
    await saveCar({ ...live, reserved: true }); // a deposit on it
    const held = await facts(live);
    await saveCar(live);
    expect(held).toMatchObject({ reserved: true, forSale: false });
    expect(held.price).toBeUndefined();
    expect(held.link).toBeUndefined();
  });
  it("gives the buyer's words as the message and the form's answers apart, as it reads an old lead too (#59)", async () => {
    const lead = (await leadsStore.list())[0]!;
    await leadsStore.put({ ...lead, id: "lead-answers", source: "Website", message: "Finance: PCP. Deposit: 3000\n\nCall me on 087 123 4567 please", details: undefined, topic: undefined, answers: undefined });
    const f = (await buildFacts({ task: "leadReply", leadId: "lead-answers" }, "D", ""))!.facts as import("./tasks").FactsOf["leadReply"];
    expect(f.details).toEqual({ Finance: "PCP", Deposit: "€3,000" });
    expect(f.message).not.toMatch(/Finance:|087 123 4567/);
  });
});

describe("buildFacts for Prepare me", () => {
  it("carries the lead's cut message and fixed words only: no name, no contacts, no other free text", async () => {
    const { adminCars } = await import("@/lib/admin/stock-admin");
    const { CHANNEL_LABELS } = await import("@/lib/visit-rules");
    const seeded = (await leadsStore.list()).find((l) => l.journey && l.carSlug)!;
    const message = `Call me on 087 123 4567 or ${seeded.email}. ${"Long words. ".repeat(80)}`;
    // A make taken from an edited address can be any slug, a phone number too.
    await leadsStore.put({ ...seeded, id: "lead-brief", message, notes: [{ at: 1, text: "Private note" }], journey: { ...seeded.journey!, cars: [], searches: [{ make: "0871234567" }, { make: "0871234567" }, { make: "0871234567" }] } });
    const built = await buildFacts({ task: "leadBrief", leadId: "lead-brief" }, "Checkwork Motors", "");
    expect(built?.task).toBe("leadBrief");
    const f = built!.facts as import("./tasks").FactsOf["leadBrief"];
    expect(f.message.length).toBeLessThanOrEqual(600);
    expect(f.closest.length).toBeGreaterThan(0);
    // Every string in the facts is the cut message, the dealer, a car of the stock, or words made from fixed values.
    const stock = await adminCars();
    const names = new Set(stock.flatMap((c) => [`${c.year} ${c.make} ${c.model}`, `${c.year} ${c.make} ${c.model}${c.variant ? ` ${c.variant}` : ""}`]));
    const strings: string[] = [];
    const walk = (v: unknown, key = ""): void => {
      if (typeof v === "string") strings.push(`${key}=${v}`);
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, Array.isArray(v) ? key : k);
    };
    walk(f);
    for (const s of strings) {
      const [k, v] = [s.slice(0, s.indexOf("=")), s.slice(s.indexOf("=") + 1)];
      if (k === "message") expect(v).toBe(f.message);
      else if (k === "dealer") expect(v).toBe("Checkwork Motors");
      else if (k === "name" || k === "car") expect(names.has(v) || v === seeded.carTitle, v).toBe(true);
      else if (k === "from") expect(Object.values(CHANNEL_LABELS)).toContain(v);
      else expect(v, s).toMatch(/^[\w€ ,.:'·-]{1,60}$/u); // a label, a chip, a spec or a pattern: short fixed words
    }
    const all = JSON.stringify(f);
    for (const gone of [seeded.name, seeded.email, seeded.phone, "087 123 4567", "0871234567", "Private note"]) expect(all).not.toContain(gone);
  });

  it("finds the car they asked about by its id, after an edit gave it a new slug", async () => {
    const seeded = (await leadsStore.list()).find((l) => l.journey && l.carSlug)!;
    const id = seeded.carSlug!.slice(seeded.carSlug!.lastIndexOf("-") + 1);
    await leadsStore.put({ ...seeded, id: "lead-old-slug", carSlug: `renamed-make-model-2001-${id}` });
    const f = (await buildFacts({ task: "leadBrief", leadId: "lead-old-slug" }, "D", ""))!.facts as import("./tasks").FactsOf["leadBrief"];
    expect(f.carForSale).toBeDefined();
  });

  it("is nothing for a lead without a visit note", async () => {
    const plain = (await leadsStore.list()).find((l) => !l.journey)!;
    expect(await buildFacts({ task: "leadBrief", leadId: plain.id }, "D", "")).toBeNull();
  });
});
