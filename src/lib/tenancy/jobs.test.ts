import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Counts the directory reads of a dealer row, so a job reads its dealer once.
const reads = vi.hoisted(() => ({ n: 0 }));
vi.mock("./directory", async (orig) => {
  const real = await orig<typeof import("./directory")>();
  return { ...real, dealerById: (id: string) => (reads.n++, real.dealerById(id)) };
});
const { dealerJob } = await import("./jobs");
const { runForDealers } = await import("./run-jobs");
const { currentDealer } = await import("./current");

const call = (dealer: string, key = "k") => new Request(`https://x/api/job?dealer=${dealer}`, { method: "POST", headers: { authorization: `Bearer ${key}` } });
afterEach(() => vi.unstubAllEnvs());

describe("a scheduled job's route", () => {
  it("runs inside the dealer the Worker names, behind the cron key only", async () => {
    vi.stubEnv("CRON_KEY", "k");
    const run = vi.fn(async () => ({ dealer: (await currentDealer()).id }));
    expect(await (await dealerJob(call("test-motors"), run)).json()).toEqual({ dealer: "test-motors" });
    expect(await (await dealerJob(call("checkwork-motors"), run)).json()).toEqual({ dealer: "checkwork-motors" });
    expect((await dealerJob(call("test-motors", "wrong"), run)).status).toBe(404);
    expect((await dealerJob(call("nobody-motors"), run)).status).toBe(404);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("reads the dealer from the directory once", async () => {
    vi.stubEnv("CRON_KEY", "k");
    reads.n = 0;
    await dealerJob(call("test-motors"), async () => ({ dealer: (await currentDealer()).id }));
    expect(reads.n).toBe(1);
  });

  it("answers 404 when the job does not apply to that dealer", async () => {
    vi.stubEnv("CRON_KEY", "k");
    expect((await dealerJob(call("test-motors"), async () => null)).status).toBe(404);
  });
});

describe("a job for every dealer", () => {
  it("runs for each in turn, one failing never stops the next, and says how many failed, with ids and counts only in the logs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: string[] = [];
    const failed = await runForDealers([{ id: "a" }, { id: "b" }, { id: "c" }], "purge-leads", async (d) => {
      seen.push(d.id);
      if (d.id === "b") throw new Error("D1_ERROR: pat@example.com"); // a database error carries the values it was given
      return { deleted: 2 };
    });
    expect(seen).toEqual(["a", "b", "c"]);
    expect(failed).toBe(1);
    expect(log.mock.calls.map((c) => c[0])).toEqual(['{"job":"purge-leads","dealer":"a","deleted":2}', '{"job":"purge-leads","dealer":"c","deleted":2}']);
    expect(error.mock.calls.map((c) => c[0])).toEqual(['{"job":"purge-leads","dealer":"b","error":"failed"}']);
    log.mockRestore();
    error.mockRestore();
  });
});
