import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const reset = vi.fn(async () => {});
vi.mock("@/lib/admin/demo-reset", () => ({ resetDemoRecords: reset }));
const { POST } = await import("./route");

const call = (key?: string, dealer = "checkwork-motors") => POST(new Request(`https://x/api/demo/reset?dealer=${dealer}`, { method: "POST", headers: key ? { authorization: `Bearer ${key}` } : {} }));

afterEach(() => {
  vi.unstubAllEnvs();
  reset.mockClear();
});

// The directory's demo flag decides, on any deploy: APP_ENV=production, as on the one shared deploy.
describe("the morning demo reset", () => {
  it("resets a demo dealer's records with the cron key, on a production deploy too", async () => {
    vi.stubEnv("CRON_KEY", "k");
    vi.stubEnv("APP_ENV", "production");
    expect((await call()).status).toBe(404);
    expect((await call("wrong")).status).toBe(404);
    expect((await call("k")).status).toBe(200);
    expect(reset).toHaveBeenCalledOnce();
  });
  it("is not there for a dealer that is not a demo, nor for one the directory does not have", async () => {
    vi.stubEnv("CRON_KEY", "k");
    vi.stubEnv("APP_ENV", "production");
    expect((await call("k", "test-motors")).status).toBe(404);
    expect((await call("k", "nobody-motors")).status).toBe(404);
    expect((await call("k", "")).status).toBe(404);
    expect(reset).not.toHaveBeenCalled();
  });
});
