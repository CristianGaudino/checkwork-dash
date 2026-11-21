import { describe, expect, it, vi } from "vitest";

// A failed directory query must not carry a staff email (or a key's hash) into the logs: drizzle's error lists the query's values, so the
// directory rethrows with the operation's name only. On the SQLite stand-in for D1 (src/test/sqlite-d1.ts), with its tables gone.
vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm/d1", () => import("@/test/sqlite-d1"));
vi.mock("@opennextjs/cloudflare", async () => {
  const { env } = await import("@/test/sqlite-d1");
  return { getCloudflareContext: () => ({ env }) };
});
const { drizzle } = await import("@/test/sqlite-d1");
const { sql } = await import("drizzle-orm");
const directory = await import("./directory");

const EMAIL = "pat.secret@example.com";
const failure = async (p: Promise<unknown>) => String(await p.then(() => "no error", (e: Error) => `${e.message} ${String(e.cause ?? "")}`));

describe("a directory query that fails", () => {
  it("throws without the email or any other value it was given", async () => {
    for (const t of ["members", "site_keys"]) await drizzle("DIRECTORY").run(sql.raw(`DROP TABLE ${t}`));
    const errors = [
      await failure(directory.membershipsOf(EMAIL)),
      await failure(directory.putMember("checkwork-motors", EMAIL, "Sales")),
      await failure(directory.removeMember("checkwork-motors", EMAIL)),
      await failure(directory.makeSiteKey("checkwork-motors", EMAIL)),
      await failure(directory.dealerOfSiteKey(`cw_site_${"a".repeat(43)}`)),
    ];
    expect(errors).toEqual(["directory membershipsOf failed ", "directory putMember failed ", "directory removeMember failed ", "directory makeSiteKey failed ", "directory dealerOfSiteKey failed "]);
    expect(await failure(directory.patchDealer("checkwork-motors", EMAIL, { email: EMAIL }))).toBe("no error"); // the dealers table is still there
    await drizzle("DIRECTORY").run(sql.raw("DROP TABLE dealers"));
    expect(await failure(directory.patchDealer("checkwork-motors", EMAIL, { email: EMAIL }))).toBe("directory patchDealer failed ");
  });
});
