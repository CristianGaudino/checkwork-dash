import { afterEach, vi } from "vitest";

// The emailed code and link against the directory in memory; email-signin.int.test.ts runs the same cases on the SQLite stand-in for D1.
vi.mock("server-only", () => ({}));
const a = await import("./attempts");
const s = await import("./email-signin");
const m = await import("./mail");
const sessions = await import("./session");
const dir = await import("@/lib/tenancy/directory");
const { emailCases } = await import("@/test/email-cases");

afterEach(() => vi.unstubAllEnvs());
emailCases(
  {
    reset: async () => dir.resetMemoryDirectory(),
    attempts: async () => dir.memoryDirectory().signInAttempts.map((r) => ({ ...r })),
    patchAttempt: async (id, patch) => void Object.assign(dir.memoryDirectory().signInAttempts.find((r) => r.id === id)!, patch),
    patchStaff: async (email, patch) => void Object.assign(dir.memoryDirectory().staff.find((p) => p.email === email)!, patch),
  },
  { s, a, m, sessions, dir },
);
