// Builds, migrates and deploys one environment: dev (wrangler.jsonc's top level, the default) or production (--env production only).
// The migrations run before the new code is live, so they may only add things (scripts/check-migrations.sh). A step that fails stops
// the rest. OpenNext's deploy is the documented way: it runs `wrangler deploy` with the same --env.
// Usage: node scripts/deploy.mjs [--env production]   (npm run deploy / deploy:prod)
import { execFileSync } from "node:child_process";
import { target } from "./dealers.mjs";

const t = target(["--remote", ...process.argv.slice(2)]);
const env = t.env === "production" ? ["--env=production"] : []; // OpenNext drops an empty --env; CLOUDFLARE_ENV is unset (target)
const run = (cmd, ...args) => execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
// Production runs merged code only: committed, and on main. A branch's migration applied to live dealer data cannot be undone.
if (t.env === "production") {
  run("git", "fetch", "-q", "origin", "main");
  let ok = false;
  try {
    // --porcelain lists untracked files too: a new migration never committed would otherwise be applied (git diff misses it).
    const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
    execFileSync("git", ["merge-base", "--is-ancestor", "HEAD", "FETCH_HEAD"]);
    ok = !dirty;
  } catch {
    ok = false;
  }
  if (!ok) throw new Error("Production deploys only committed code that is on main: commit and merge it first, then deploy from main.");
}
console.log(`\nDeploying ${t.env}: Worker ${t.config.name}`);
run("npx", "opennextjs-cloudflare", "build", ...env);
// The migration scripts take this script's own flags, not wrangler's (t.args holds --env= for wrangler, which they refuse).
const flags = ["--remote", ...(t.env === "production" ? ["--env", "production"] : [])];
run("node", "scripts/migrate-dealers.mjs", "--directory", ...flags);
run("node", "scripts/migrate-dealers.mjs", ...flags);
run("npx", "opennextjs-cloudflare", "deploy", ...env);
console.log(`\nDeployed ${t.env}: Worker ${t.config.name}`);
