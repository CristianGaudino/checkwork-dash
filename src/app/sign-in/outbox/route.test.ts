import { afterEach, describe, expect, it, vi } from "vitest";

// The E2E run's mail is never readable on a deploy: it needs E2E_FAKE_BACKENDS=1 and neither a directory nor a mail binding.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/staff", () => ({ signInOpen: async () => true }));
let bindings: Record<string, unknown> = {};
vi.mock("@/lib/leads/bindings", () => ({ getBindings: () => bindings }));
const { GET } = await import("./route");
const { outbox } = await import("@/lib/auth/mail");

afterEach(() => {
  vi.unstubAllEnvs();
  bindings = {};
  outbox().length = 0;
});
const get = () => GET(new Request("http://x/sign-in/outbox?to=a%40example.com"));

describe("/sign-in/outbox", () => {
  it("answers only in an E2E run, with no directory and no mail binding", async () => {
    outbox().push({ to: "a@example.com", subject: "s", text: "Your code is 123 456" });
    expect((await get()).status).toBe(404); // no E2E_FAKE_BACKENDS
    vi.stubEnv("E2E_FAKE_BACKENDS", "1");
    expect(await (await get()).json()).toHaveLength(1);
    for (const b of [{ DIRECTORY: {} }, { EMAIL: {} }]) {
      bindings = b;
      expect((await get()).status, JSON.stringify(Object.keys(b))).toBe(404);
    }
  });
});
