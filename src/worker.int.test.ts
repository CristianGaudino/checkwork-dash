import { describe, expect, it, vi } from "vitest";

// worker.mjs's scheduled handler on the SQLite stand-in for D1 (src/test/sqlite-d1.ts): the nightly retention purges run for every dealer,
// a paused one too, the sign-in purge once for the directory, and the app jobs only for active dealers. OpenNext's worker is a stand-in (vitest.config.mts, src/test/open-next-worker.ts).
vi.mock("drizzle-orm/d1", () => import("@/test/sqlite-d1"));
const { drizzle, env } = await import("@/test/sqlite-d1");
const { dealers } = await import("@/lib/db/directory-schema");
const { eq } = await import("drizzle-orm");
const { fetched, paths } = await import("@/test/open-next-worker");
const worker = (await import("../worker.mjs")).default as { scheduled(c: { cron: string }, env: unknown, ctx: unknown): Promise<void> };

describe("the Worker's scheduled jobs", () => {
  it("purge for every dealer, paused ones too, and run the app jobs for active dealers only", async () => {
    await drizzle("DIRECTORY").update(dealers).set({ status: "paused" }).where(eq(dealers.id, "test-motors"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await worker.scheduled({ cron: "0 3 * * *" }, env, {});
    const ran = log.mock.calls.map(([l]) => JSON.parse(String(l)) as { job: string; dealer: string });
    for (const job of ["purge-leads", "purge-activity", "purge-counts", "anonymise-sales"]) expect(ran.filter((r) => r.job === job).map((r) => r.dealer).sort()).toEqual(["checkwork-motors", "test-motors"]);
    expect(ran.filter((r) => r.job === "purge-sign-in")).toEqual([{ job: "purge-sign-in", dealer: "directory", attempts: 0, sessions: 0, passkeys: 0, staff: 0 }]); // once, counts only
    await worker.scheduled({ cron: "0 7 * * *" }, { ...env, CRON_KEY: "k" }, {});
    expect([...new Set(fetched)]).toEqual(["checkwork-motors"]);
    expect(paths).toContain("/api/reminders?dealer=checkwork-motors"); // the buyers' NCT and service reminders, each morning, active dealers only (#171)
    log.mockRestore();
  });
});
