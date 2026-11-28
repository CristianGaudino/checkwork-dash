// Changes a dealer's profile in the directory: the fields in the file are merged into what is stored (JSON merge patch: a field given
// replaces that field, a group such as "rules" is merged one level down, null removes a field), the rest stays. The dealer's own facts
// are theirs to change in Settings too; the plan billed ("plan"), stock source ("stock") and rules ("rules") are ours, here only.
// Dev unless --env production (scripts/dealers.mjs, target).
// Usage: node scripts/dealer-profile.mjs <dealer-id> <file.json> --remote|--local [--env production]
// Example file, to bill a dealer for the website and the dashboard, with stock synced from CarsIreland:
//   { "plan": "both", "stock": { "source": "donedeal", "listingSite": "CarsIreland", "listingUrl": "https://www.carsireland.ie/dealer/..." } }
import { DEALER_ID, announce, directoryRows, readProfile, sqlText as q, target } from "./dealers.mjs";

const t = target(process.argv.slice(2));
const [id, file] = t.positionals;
if (!id || !DEALER_ID.test(id)) throw new Error("Give the dealer id, a slug like example-motors");
if (!file) throw new Error("Give the JSON file with the profile fields to change");
const patch = readProfile(file);
announce(t, "DIRECTORY");
// RETURNING says whether the dealer was there: an id the directory does not have changes nothing, and says so.
const changed = directoryRows(`UPDATE dealers SET profile = json_patch(profile, ${q(patch)}) WHERE id = ${q(id)} RETURNING id;`, t.args);
if (!changed.length) {
  console.error(`\nNo dealer ${id} in the ${t.env} directory. Nothing changed.`);
  process.exit(1);
}
console.log(`\nThe profile of ${id} is changed in ${t.env}. Each page and job reads it on its next request.`);
