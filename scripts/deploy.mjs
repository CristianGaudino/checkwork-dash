// Builds, migrates and deploys one environment: dev (wrangler.jsonc's top level, the default) or production (--env production only).
// The migrations run before the new code is live, so they may only add things (scripts/check-migrations.sh). A step that fails stops
// the rest. OpenNext's deploy is the documented way: it runs `wrangler deploy` with the same --env.
// Usage: node scripts/deploy.mjs [--env production]   (npm run deploy / deploy:prod)
import { execFileSync } from "node:child_process";
import { target } from "./dealers.mjs";

const t = target(["--remote", ...process.argv.slice(2)]);
const env = t.env === "production" ? ["--env=production"] : []; // OpenNext drops an empty --env; CLOUDFLARE_ENV is unset (target)
const run = (cmd, ...args) => execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
console.log(`\nDeploying ${t.env}: Worker ${t.config.name}`);
run("npx", "opennextjs-cloudflare", "build", ...env);
run("node", "scripts/migrate-dealers.mjs", "--directory", ...t.args);
run("node", "scripts/migrate-dealers.mjs", ...t.args);
run("npx", "opennextjs-cloudflare", "deploy", ...env);
console.log(`\nDeployed ${t.env}: Worker ${t.config.name}`);
