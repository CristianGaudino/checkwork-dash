import { vi } from "vitest";

// Sessions on the SQLite stand-in for D1 with the real directory migrations (src/test/sqlite-d1.ts): the same cases as in memory.
vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm/d1", () => import("@/test/sqlite-d1"));
vi.mock("@opennextjs/cloudflare", async () => {
  const { env } = await import("@/test/sqlite-d1");
  return { getCloudflareContext: () => ({ env }) };
});
const { drizzle, truncateIn } = await import("@/test/sqlite-d1");
const { sessions, staff } = await import("@/lib/db/directory-schema");
const s = await import("./session");
const { sessionCases } = await import("@/test/session-cases");

const db = drizzle("DIRECTORY");
sessionCases(
  {
    reset: () => truncateIn("DIRECTORY", "sign_in_attempts", "sessions", "passkeys", "staff"),
    addPerson: async (id, email) => void (await db.insert(staff).values({ id, email, createdAt: new Date() })),
    stored: () => db.select().from(sessions),
  },
  s,
);
