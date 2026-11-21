import { describe, expect, it, vi } from "vitest";
import { separationCases } from "@/test/separation-cases";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tenancy/membership", () => vi.importActual("@/lib/tenancy/membership"));
// The D1 path: the directory and each dealer's database on SQLite with the committed migrations (src/test/sqlite-d1.ts), picked by the
// real getDb() from the directory's binding name; the photo bucket in memory.
vi.mock("drizzle-orm/d1", () => import("@/test/sqlite-d1"));
vi.mock("@opennextjs/cloudflare", async () => {
  const { env } = await import("@/test/sqlite-d1");
  return { getCloudflareContext: () => ({ env }) };
});
const { drizzle, objects } = await import("@/test/sqlite-d1");
const { runAsDealer } = await import("@/lib/tenancy/current");

describe("dealers kept apart (D1 path, a SQLite database per dealer)", () => {
  separationCases();

  it("writes each dealer's records into that dealer's own database, and no other", async () => {
    const { defineCollection } = await import("@/lib/admin/docs");
    const { adminDocs } = await import("@/lib/db/schema");
    const c = defineCollection<{ id: string }>("separation-where", () => []);
    await runAsDealer("test-motors", () => c.put({ id: "only-b" }));
    const ids = async (binding: string) => (await drizzle(binding).select().from(adminDocs)).filter((r) => r.collection === "separation-where").map((r) => r.id);
    expect(await ids("DB_TEST_MOTORS")).toEqual(["only-b"]);
    expect(await ids("DB_CHECKWORK_MOTORS")).toEqual([]);
  });

  it("fails for a dealer whose database is not bound, never falling back to another's", async () => {
    const { dealers } = await import("@/lib/db/directory-schema");
    await drizzle("DIRECTORY").insert(dealers).values({ id: "ghost-motors", name: "Ghost Motors", binding: "DB_GHOST_MOTORS" });
    const { leadsStore } = await import("@/lib/admin/collections");
    await expect(runAsDealer("ghost-motors", () => leadsStore.list())).rejects.toThrow();
  });

  it("stores each dealer's photos under its own prefix, and serves another dealer's to nobody", async () => {
    const { storeCarPhoto } = await import("@/lib/admin/car-photos");
    const { GET } = await import("@/app/car-photos/[...key]/route");
    const photo = await runAsDealer("checkwork-motors", () => storeCarPhoto("4710001", new Uint8Array([0xff, 0xd8, 0xff]), 10, 10));
    const key = photo.src.replace("/car-photos/", "");
    expect([...objects.keys()]).toContain(`dealers/checkwork-motors/${key}`);
    const fetchAs = (dealer: string) => runAsDealer(dealer, () => GET(new Request("https://x.test"), { params: Promise.resolve({ key: key.split("/") }) }));
    expect((await fetchAs("checkwork-motors")).status).toBe(200);
    expect((await fetchAs("test-motors")).status).toBe(404);
  });
});
