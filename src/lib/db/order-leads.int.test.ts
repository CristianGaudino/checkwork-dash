import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => import("@/test/sqlite-db"));
const { getDb } = await import("@/test/sqlite-db");
const { adminDocs } = await import("@/lib/db/schema");

// drizzle/0005: a factory order request already stored (#168) becomes a car enquiry with its words, and its bell notice reads as one.
describe("the order leads migration", () => {
  it("files stored order requests as enquiries and leaves everything else alone", async () => {
    const db = getDb();
    await db.insert(adminDocs).values([
      { collection: "leads", id: "o", data: { id: "o", type: "order", message: "Kia Sportage, 271 reg\n\nWhite please" } },
      { collection: "leads", id: "f", data: { id: "f", type: "finance" } },
      { collection: "notifications", id: "n", data: { id: "n", kind: "order", text: "Factory order request", href: "/leads/o" } },
      { collection: "orders", id: "x", data: { id: "x", type: "order" } },
    ]);
    for (const stmt of readFileSync("drizzle/0005_order_leads_to_enquiries.sql", "utf8").split("--> statement-breakpoint")) await db.run(sql.raw(stmt));
    const rows = Object.fromEntries((await db.select().from(adminDocs)).map((r) => [r.id, r.data]));
    expect(rows.o).toEqual({ id: "o", type: "enquiry", message: "Kia Sportage, 271 reg\n\nWhite please" });
    expect(rows.f).toEqual({ id: "f", type: "finance" });
    expect(rows.n).toEqual({ id: "n", kind: "lead", text: "Car enquiry", href: "/leads/o" });
    expect(rows.x).toEqual({ id: "x", type: "order" });
  });
});
