import { afterEach, vi } from "vitest";

// The same cases on the SQLite stand-in for D1 with the real directory migrations (src/test/sqlite-d1.ts).
vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm/d1", () => import("@/test/sqlite-d1"));
vi.mock("@opennextjs/cloudflare", async () => {
  const { env } = await import("@/test/sqlite-d1");
  return { getCloudflareContext: () => ({ env }) };
});
// The outbox is for a run with no directory bound, which this is not: a stand-in that keeps what would be sent.
vi.mock("./mail", () => {
  const box: { to: string; subject: string; text: string }[] = [];
  return { outbox: () => box, sendSignInMail: async (x: (typeof box)[number]) => {
      if (process.env.E2E_FAKE_BACKENDS !== "1") throw new Error("send failed"); // like the real one with no way to send
      box.push(x);
    },
  };
});
const { drizzle, truncateIn } = await import("@/test/sqlite-d1");
const { eq } = await import("drizzle-orm");
const { signInAttempts, staff } = await import("@/lib/db/directory-schema");
const a = await import("./attempts");
const s = await import("./email-signin");
const m = await import("./mail");
const sessions = await import("./session");
const dir = await import("@/lib/tenancy/directory");
const { emailCases } = await import("@/test/email-cases");

const db = drizzle("DIRECTORY");
afterEach(() => vi.unstubAllEnvs());
emailCases(
  {
    reset: () => truncateIn("DIRECTORY", "sign_in_attempts", "sessions", "passkeys", "staff"),
    attempts: () => db.select().from(signInAttempts),
    patchAttempt: async (id, patch) => void (await db.update(signInAttempts).set(patch).where(eq(signInAttempts.id, id))),
    patchStaff: async (email, patch) => void (await db.update(staff).set(patch).where(eq(staff.email, email))),
  },
  { s, a, m, sessions, dir },
);
