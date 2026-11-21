import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

// One app serves every dealer (#5): each dealer's name and facts are in their profile in the directory (src/lib/tenancy/profile.ts), read
// for the dealer being viewed. This fails when a page or component writes a dealer's brand, town or phone in by hand again, which would
// show the demo's facts to every dealer. Allowed: the demo business's own profile, tests and their helpers (src/test), and the demo stock
// data and fixtures (the demo dealer's made-up records).
const ALLOWED = [/^src\/lib\/tenancy\/profile\.ts$/, /\.test\.tsx?$/, /^src\/test\//, /demo-cars\.json$/, /worst-cars\.ts$/, /^src\/lib\/reviews\//];
const WORDS = /checkwork motors|long mile road|demotown|co. demo|D00 ?0000|D12 ?AF77|906 ?0045|demo\.checkwork\.ie/i;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|css|json)$/.test(name) ? [path] : [];
  });
}
// Comments may name the client; only code and strings count.
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

it("keeps every dealer's brand, town and phone out of the code: they come from the dealer's profile", () => {
  const found = files("src")
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => !ALLOWED.some((a) => a.test(f)))
    .filter((f) => WORDS.test(code(readFileSync(f, "utf8"))));
  expect(found).toEqual([]);
});
