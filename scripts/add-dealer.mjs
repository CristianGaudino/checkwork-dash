// Adds a dealer to the directory with its first owner, after applying the dealer migrations to its database (docs/new-dealer.md has the
// steps before this: create the database, bind it in wrangler.jsonc). The owner then adds the rest of the team in Settings, Team.
// Dev unless --env production (scripts/dealers.mjs, target): a dealer is added in each environment on its own.
// Usage: node scripts/add-dealer.mjs <dealer-id> "<Dealer name>" <owner email> --remote|--local [--env production] [--demo] [--profile=<file.json>]
//   --demo: a demo dealer (made-up records, the morning reset), with the made-up team (example.com) so the demo bar's roles have people.
//   --profile: the dealer's facts, plan, stock source and rules (src/lib/tenancy/profile.ts). Without it: the plain defaults (the
//   dashboard plan, stock kept here), or the demo business for --demo. Change it later with scripts/dealer-profile.mjs.
// Prints nothing personal beyond what you typed. Safe to run again: an existing dealer or member is left as it is.
import { DEALER_ID, announce, bindingOf, readProfile, runDirectorySql, sqlText as q, target, wrangler } from "./dealers.mjs";

const t = target(process.argv.slice(2), { demo: { type: "boolean" }, profile: { type: "string" } });
const [id, name, email] = t.positionals;
const demo = Boolean(t.values.demo);
const profile = t.values.profile ? readProfile(t.values.profile) : "{}"; // read first: a bad file stops before anything is written
if (!id || !DEALER_ID.test(id) || id.length > 64) throw new Error("The dealer id is a slug: lower case letters, digits and single dashes, e.g. example-motors");
if (!name?.trim()) throw new Error('Give the dealer\'s name, in quotes: "Example Motors"');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? "")) throw new Error("Give the owner's email");
const binding = bindingOf(id);

announce(t, binding); // throws when the binding is not in this environment: bind it in wrangler.jsonc first (docs/new-dealer.md)
wrangler("d1", "migrations", "apply", binding, ...t.args);

const people = [[email.trim().toLowerCase(), "Owner"], ...(demo ? [["aoife@example.com", "Owner"], ["conor@example.com", "Sales"], ["niamh@example.com", "Finance"], ["ciara@example.com", "Manager"]] : [])];
const now = Date.now();
const sql = [
  `INSERT OR IGNORE INTO dealers (id, name, binding, demo, status, created_at, profile) VALUES (${q(id)}, ${q(name.trim())}, ${q(binding)}, ${demo ? 1 : 0}, 'active', ${now}, ${q(profile)});`,
  ...people.map(([e, role], i) => `INSERT OR IGNORE INTO members (dealer_id, email, role, added_at) VALUES (${q(id)}, ${q(e)}, ${q(role)}, ${now + i});`),
].join("\n");
announce(t, "DIRECTORY");
runDirectorySql(sql, t.args);
console.log(`\n${name.trim()} (${id}) is in the ${t.env} directory, on ${binding}, with its owner.`);
