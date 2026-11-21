// Adds a dealer to the directory with its first owner, after applying the dealer migrations to its database (docs/new-dealer.md has the
// steps before this: create the database, bind it in wrangler.jsonc). The owner then adds the rest of the team in Settings, Team.
// Usage: node scripts/add-dealer.mjs <dealer-id> "<Dealer name>" <owner email> --remote|--local [--demo]
//   --demo: a demo dealer (made-up records, the morning reset), with the made-up team (example.com) so the demo bar's roles have people.
// Prints nothing personal beyond what you typed. Safe to run again: an existing dealer or member is left as it is.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEALER_ID, bindingOf, dealerBindings, target, wrangler } from "./dealers.mjs";

const args = process.argv.slice(2);
const [id, name, email] = args.filter((a) => !a.startsWith("--"));
const where = target(args);
const demo = args.includes("--demo");
if (!id || !DEALER_ID.test(id) || id.length > 64) throw new Error("The dealer id is a slug: lower case letters, digits and single dashes, e.g. murphy-motors");
if (!name?.trim()) throw new Error('Give the dealer\'s name, in quotes: "Murphy Motors"');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? "")) throw new Error("Give the owner's email");
const binding = bindingOf(id);
if (!dealerBindings().includes(binding)) throw new Error(`Bind ${binding} in wrangler.jsonc first (docs/new-dealer.md)`);

wrangler("d1", "migrations", "apply", binding, where);

const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
const people = [[email.trim().toLowerCase(), "Owner"], ...(demo ? [["aoife@example.com", "Owner"], ["conor@example.com", "Sales"], ["niamh@example.com", "Finance"], ["ciara@example.com", "Manager"]] : [])];
const now = Date.now();
const sql = [
  `INSERT OR IGNORE INTO dealers (id, name, binding, demo, status, created_at) VALUES (${q(id)}, ${q(name.trim())}, ${q(binding)}, ${demo ? 1 : 0}, 'active', ${now});`,
  ...people.map(([e, role], i) => `INSERT OR IGNORE INTO members (dealer_id, email, role, added_at) VALUES (${q(id)}, ${q(e)}, ${q(role)}, ${now + i});`),
].join("\n");
// From a file: on Windows npx runs through a shell, which would split a --command at its spaces.
const dir = mkdtempSync(join(tmpdir(), "add-dealer-"));
try {
  writeFileSync(join(dir, "directory.sql"), sql);
  wrangler("d1", "execute", "DIRECTORY", where, "--file", join(dir, "directory.sql"));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${name.trim()} (${id}) is in the directory, on ${binding}, with its owner.`);
