// Applies the stock seed (seed/stock.sql, from npm run stock:seed) to a demo dealer's database. The seed is made-up cars, so a dealer the
// directory does not mark as a demo is refused before anything is written. Dev unless --env production (scripts/dealers.mjs, target).
// Usage: node scripts/seed-dealer.mjs <dealer-id> --remote|--local [--env production]   (npm run db:seed / db:seed:prod: checkwork-motors)
import { existsSync } from "node:fs";
import { DEALER_ID, announce, assertDemo, bindingOf, directoryRows, sqlText as q, target, wrangler } from "./dealers.mjs";

const t = target(process.argv.slice(2));
const [id] = t.positionals;
if (!id || !DEALER_ID.test(id)) throw new Error("Give the dealer id, a slug like checkwork-motors");
if (!existsSync("seed/stock.sql")) throw new Error("No seed/stock.sql: npm run stock:seed first");
const binding = bindingOf(id);
announce(t, "DIRECTORY");
assertDemo(id, directoryRows(`SELECT demo FROM dealers WHERE id = ${q(id)};`, t.args));
announce(t, binding);
wrangler("d1", "execute", binding, ...t.args, "--file=seed/stock.sql");
console.log(`\nThe demo stock is in ${id}'s ${t.env} database.`);
