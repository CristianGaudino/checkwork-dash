import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => import("@/test/sqlite-db"));
const { getDb } = await import("@/test/sqlite-db");
const { cars } = await import("@/lib/db/schema");

// drizzle/0006: a car stored as new becomes used (no condition), with updated_at moved on; a commercial and a used car are left alone (#188).
describe("the new cars to used migration", () => {
  it("drops the condition of a new car only, and moves its updated_at on", async () => {
    const db = getDb();
    await db.insert(cars).values([
      { id: "n", slug: "n", data: { id: "n", condition: "new" }, updatedAt: 100 },
      { id: "c", slug: "c", data: { id: "c", condition: "commercial" }, updatedAt: 100 },
      { id: "u", slug: "u", data: { id: "u" }, updatedAt: 100 },
    ] as (typeof cars.$inferInsert)[]);
    for (const stmt of readFileSync("drizzle/0006_new_cars_to_used.sql", "utf8").split("--> statement-breakpoint")) await db.run(sql.raw(stmt));
    const rows = Object.fromEntries((await db.select().from(cars)).map((r) => [r.id, { data: r.data, at: r.updatedAt }]));
    expect(rows.n).toEqual({ data: { id: "n" }, at: 101 });
    expect(rows.c).toEqual({ data: { id: "c", condition: "commercial" }, at: 100 });
    expect(rows.u).toEqual({ data: { id: "u" }, at: 100 });
  });
});
