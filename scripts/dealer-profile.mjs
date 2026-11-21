// Changes a dealer's profile in the directory: the fields in the file are merged into what is stored (JSON merge patch: a field given
// replaces that field, a group such as "rules" is merged one level down, null removes a field), the rest stays. The dealer's own facts
// are theirs to change in Settings too; the plan ("modules"), stock source ("stock") and rules ("rules") are ours, here only.
// Usage: node scripts/dealer-profile.mjs <dealer-id> <file.json> --remote|--local
// Example file, to give a dealer the Dealer plan and stock synced from CarsIreland:
//   { "modules": "dashboard,testDrives,sales,reviews", "stock": { "source": "donedeal", "listingSite": "CarsIreland", "listingUrl": "https://www.carsireland.ie/dealer/..." } }
import { DEALER_ID, directoryRows, readProfile, sqlText as q, target } from "./dealers.mjs";

const args = process.argv.slice(2);
const [id, file] = args.filter((a) => !a.startsWith("--"));
const where = target(args);
if (!id || !DEALER_ID.test(id)) throw new Error("Give the dealer id, a slug like murphy-motors");
if (!file) throw new Error("Give the JSON file with the profile fields to change");
const patch = readProfile(file);
// RETURNING says whether the dealer was there: an id the directory does not have changes nothing, and says so.
const changed = directoryRows(`UPDATE dealers SET profile = json_patch(profile, ${q(patch)}) WHERE id = ${q(id)} RETURNING id;`, where);
if (!changed.length) {
  console.error(`\nNo dealer ${id} in the directory. Nothing changed.`);
  process.exit(1);
}
console.log(`\nThe profile of ${id} is changed. Each page and job reads it on its next request.`);
