import { afterEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/tenancy/membership", () => vi.importActual("@/lib/tenancy/membership"));
vi.mock("drizzle-orm/d1", () => import("@/test/sqlite-d1"));
vi.mock("@opennextjs/cloudflare", async () => {
  const { env } = await import("@/test/sqlite-d1");
  return { getCloudflareContext: () => ({ env, ctx: { waitUntil: () => {} } }) };
});
const { drizzle } = await import("@/test/sqlite-d1");
const { saveSecrets, removeSecrets, savedNamesNow, secretFor } = await import("./dealer-secrets");
const { runAsDealer } = await import("@/lib/tenancy/current");

const D = "test-motors";
const db = drizzle("DB_TEST_MOTORS");
afterEach(async () => {
  vi.unstubAllEnvs();
  await db.run(sql`drop trigger if exists no_bad`);
  await runAsDealer(D, async () => removeSecrets([...(await savedNamesNow())]));
});

describe("dealer keys on D1 (SQLite)", () => {
  it("saves a pair all or nothing: a failing write leaves the old pair as it was", async () => {
    vi.stubEnv("DEALER_SECRETS_KEY", Buffer.alloc(32, 9).toString("base64"));
    await runAsDealer(D, () => saveSecrets({ A: "a1", B: "b1" }));
    await db.run(sql`create trigger no_bad before insert on admin_docs when new.id = 'B' begin select raise(abort, 'no'); end`);
    await expect(runAsDealer(D, () => saveSecrets({ A: "a2", B: "b2" }))).rejects.toThrow();
    expect(await runAsDealer(D, async () => [await secretFor("A"), await secretFor("B")])).toEqual(["a1", "b1"]);
  });

  it("removes every name in one go", async () => {
    vi.stubEnv("DEALER_SECRETS_KEY", Buffer.alloc(32, 9).toString("base64"));
    await runAsDealer(D, () => saveSecrets({ A: "a", B: "b", C: "c" }));
    await runAsDealer(D, () => removeSecrets(["A", "B"]));
    expect([...(await runAsDealer(D, savedNamesNow))]).toEqual(["C"]);
  });
});
