// Adds a dealer to the directory with its first owner, after applying the dealer migrations to its database (docs/new-dealer.md has the
// steps before this: create the database, bind it in wrangler.jsonc). The owner then adds the rest of the team in Settings, Team.
// Usage: node scripts/add-dealer.mjs <dealer-id> "<Dealer name>" <owner email> --remote|--local [--demo] [--profile=<file.json>]
//   --demo: a demo dealer (made-up records, the morning reset), with the made-up team (example.com) so the demo bar's roles have people.
//   --profile: the dealer's facts, plan, stock source and rules (src/lib/tenancy/profile.ts). Without it: the plain defaults (the dashboard
//   alone, stock kept here), or the demo business for --demo. Change it later with scripts/dealer-profile.mjs.
// Prints nothing personal beyond what you typed. Safe to run again: an existing dealer or member is left as it is.
import { DEALER_ID, bindingOf, dealerBindings, readProfile, runDirectorySql, sqlText as q, target, wrangler } from "./dealers.mjs";

const args = process.argv.slice(2);
const [id, name, email] = args.filter((a) => !a.startsWith("--"));
const where = target(args);
const demo = args.includes("--demo");
const profileFile = args.find((a) => a.startsWith("--profile="))?.slice("--profile=".length);
const profile = profileFile ? readProfile(profileFile) : "{}"; // read first: a bad file stops before anything is written
if (!id || !DEALER_ID.test(id) || id.length > 64) throw new Error("The dealer id is a slug: lower case letters, digits and single dashes, e.g. example-motors");
if (!name?.trim()) throw new Error('Give the dealer\'s name, in quotes: "Example Motors"');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? "")) throw new Error("Give the owner's email");
const binding = bindingOf(id);
if (!dealerBindings().includes(binding)) throw new Error(`Bind ${binding} in wrangler.jsonc first (docs/new-dealer.md)`);

wrangler("d1", "migrations", "apply", binding, where);

const people = [[email.trim().toLowerCase(), "Owner"], ...(demo ? [["aoife@example.com", "Owner"], ["conor@example.com", "Sales"], ["niamh@example.com", "Finance"], ["ciara@example.com", "Manager"]] : [])];
const now = Date.now();
const sql = [
  `INSERT OR IGNORE INTO dealers (id, name, binding, demo, status, created_at, profile) VALUES (${q(id)}, ${q(name.trim())}, ${q(binding)}, ${demo ? 1 : 0}, 'active', ${now}, ${q(profile)});`,
  ...people.map(([e, role], i) => `INSERT OR IGNORE INTO members (dealer_id, email, role, added_at) VALUES (${q(id)}, ${q(e)}, ${q(role)}, ${now + i});`),
].join("\n");
runDirectorySql(sql, where);
console.log(`\n${name.trim()} (${id}) is in the directory, on ${binding}, with its owner.`);
