// After a deploy: proves the Worker now serves 100% of one version tagged with this commit (deploy.mjs tags it). Needs the Cloudflare
// credentials. Usage: node scripts/live-version.mjs [--env production]
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { target } from "./dealers.mjs";

// `wrangler deployments status --json` is { versions: [{ version_id, percentage }] }; `wrangler versions view <id> --json` has the tag
// at annotations["workers/tag"]. Throws, naming what is missing, rather than passing on a shape it does not know.
export function assertLive(deployment, versionOf, commit) {
  const versions = deployment?.versions;
  if (!Array.isArray(versions) || versions.length === 0) throw new Error("The deployment lists no versions (unexpected wrangler output)");
  if (versions.length !== 1 || Number(versions[0].percentage) !== 100) throw new Error(`Traffic is not 100% on one version: ${JSON.stringify(versions)}`);
  const id = versions[0].version_id;
  if (!id) throw new Error("The deployment's version has no version_id (unexpected wrangler output)");
  const tag = versionOf(id)?.annotations?.["workers/tag"];
  if (tag === undefined) throw new Error(`Version ${id} has no workers/tag annotation (unexpected wrangler output)`);
  if (tag !== commit) throw new Error(`Version ${id} is tagged ${tag}, not ${commit}`);
  return id;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t = target(["--remote", ...process.argv.slice(2)]);
  const wrangler = (...args) => JSON.parse(execFileSync("npx", ["wrangler", ...args, t.args[1], "--json"], { encoding: "utf8", shell: process.platform === "win32" }));
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const id = assertLive(wrangler("deployments", "status"), (v) => wrangler("versions", "view", v), commit);
  console.log(`${t.env} serves version ${id}, tagged ${commit}`);
}
