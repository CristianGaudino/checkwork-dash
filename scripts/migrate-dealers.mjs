// Applies the dealer migrations (drizzle/) to every dealer database bound in wrangler.jsonc (DB_<DEALER>), one after the other. A dealer
// whose migrations fail is reported and the rest still run; the script then exits 1. The directory's own: npm run directory:migrate.
// Usage: node scripts/migrate-dealers.mjs --remote | --local   (npm run db:migrate is --remote)
import { dealerBindings, target, wrangler } from "./dealers.mjs";

const where = target(process.argv.slice(2));
const bindings = dealerBindings();
if (!bindings.length) throw new Error("No dealer database (DB_...) in wrangler.jsonc");
const failed = [];
for (const b of bindings) {
  console.log(`\n${b}`);
  try {
    wrangler("d1", "migrations", "apply", b, where);
  } catch {
    failed.push(b);
  }
}
if (failed.length) {
  console.error(`\nMigrations failed for: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`\nMigrated ${bindings.length} dealer database(s).`);
