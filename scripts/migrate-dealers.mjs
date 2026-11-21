// Applies the dealer migrations (drizzle/) to every dealer database bound in wrangler.jsonc (DB_<DEALER>), one after the other. A dealer
// whose migrations fail is reported and the rest still run; the script then exits 1. --directory applies the directory's own
// (drizzle-directory/) instead. Dev unless --env production (scripts/dealers.mjs, target).
// Usage: node scripts/migrate-dealers.mjs --remote|--local [--directory] [--env production]
//   npm run db:migrate / db:migrate:prod, npm run directory:migrate / directory:migrate:prod
import { announce, dealerBindings, target, wrangler } from "./dealers.mjs";

const t = target(process.argv.slice(2), { directory: { type: "boolean" } });
const bindings = t.values.directory ? ["DIRECTORY"] : dealerBindings(t.config);
if (!bindings.length) throw new Error(`No dealer database (DB_...) in ${t.env} (wrangler.jsonc)`);
const failed = [];
for (const b of bindings) {
  announce(t, b);
  try {
    wrangler("d1", "migrations", "apply", b, ...t.args);
  } catch {
    failed.push(b);
  }
}
if (failed.length) {
  console.error(`\nMigrations failed for: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`\nMigrated ${bindings.length} database(s) in ${t.env}.`);
