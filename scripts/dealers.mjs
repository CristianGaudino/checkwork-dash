// Shared by the dealer scripts: the D1 bindings in wrangler.jsonc, and running wrangler. No dependencies.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// wrangler.jsonc is JSON with comments and trailing commas. Strings are kept whole, so a // inside one (a URL) is not taken for a comment.
export function readWrangler(path = "wrangler.jsonc") {
  const src = readFileSync(path, "utf8");
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j;
    } else if (c === "/" && src[i + 1] === "/") while (i < src.length && src[i] !== "\n") i++;
    else if (c === "/" && src[i + 1] === "*") i = src.indexOf("*/", i) + 1;
    else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

// Every dealer's database binding (DB_<DEALER>) in one environment's config (target().config); the directory is DIRECTORY.
export const dealerBindings = (cfg) => (cfg.d1_databases ?? []).map((d) => d.binding).filter((b) => /^DB_[A-Z0-9_]+$/.test(b));

// A dealer id (a slug) and its binding name: checkwork-motors is DB_CHECKWORK_MOTORS.
export const DEALER_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const bindingOf = (id) => `DB_${id.toUpperCase().replaceAll("-", "_")}`;

// Where a script acts, from its arguments. --remote (the real databases) or --local (wrangler dev's copies), said out loud. The
// environment is dev (wrangler.jsonc's top level) unless the arguments say --env production: nothing else reaches production. wrangler
// would also take CLOUDFLARE_ENV from the shell, so it must be unset, and every wrangler call spells out --env= (dev) or
// --env=production. `options` are the script's own flags (node's parseArgs): an unknown flag, such as a mistyped --env, stops the script.
// Returns the positionals and flags, the wrangler arguments, the environment's name and its config.
// wrangler also reads CLOUDFLARE_ENV from .env and .env.local, which the shell check cannot see: a line there is refused too.
export const envFileSetsCloudflareEnv = (files = [".env", ".env.local"]) =>
  files.some((f) => existsSync(f) && /^\s*(export\s+)?CLOUDFLARE_ENV\s*=/m.test(readFileSync(f, "utf8")));
export function target(argv, options = {}, cfg = readWrangler(), environ = process.env, envFiles = [".env", ".env.local"]) {
  if (environ.CLOUDFLARE_ENV !== undefined) throw new Error("Unset CLOUDFLARE_ENV first: these scripts act on dev, or on production with --env production");
  if (envFileSetsCloudflareEnv(envFiles)) throw new Error("Remove CLOUDFLARE_ENV from .env / .env.local: wrangler would read it and send a dev command to production");
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { ...options, remote: { type: "boolean" }, local: { type: "boolean" }, env: { type: "string" } } });
  if (!values.remote === !values.local) throw new Error("Say --remote (the real databases) or --local (wrangler dev's)");
  if (values.env !== undefined && values.env !== "production") throw new Error("--env takes production only: with no --env it is dev");
  const env = values.env ?? "dev";
  const config = env === "production" ? cfg.env?.production : cfg;
  if (!config) throw new Error("wrangler.jsonc has no env.production");
  return { values, positionals, env, config, args: [values.remote ? "--remote" : "--local", `--env=${env === "production" ? "production" : ""}`] };
}

// Said before a script touches a database, e.g. "production: checkwork-directory". `binding` is DIRECTORY or DB_<DEALER>.
export function databaseName(t, binding) {
  const name = t.config.d1_databases?.find((d) => d.binding === binding)?.database_name;
  if (!name) throw new Error(`${binding} is not bound in ${t.env} (wrangler.jsonc)`);
  return name;
}
export const announce = (t, binding) => console.log(`\n${t.env}${t.values.local ? " (local)" : ""}: ${databaseName(t, binding)}`);

// The stock seed is made-up cars: for a dealer the directory marks as a demo only. `rows` is what the directory returned for that id.
export function assertDemo(id, rows) {
  if (!rows.length) throw new Error(`No dealer ${id} in the directory`);
  if (!rows[0].demo) throw new Error(`${id} is not a demo dealer: the stock seed is for demo dealers only`);
}

// Arguments without spaces only: on Windows npx runs through a shell, which splits them (add-dealer.mjs passes SQL as a file).
export const wrangler = (...args) => execFileSync("npx", ["wrangler", ...args], { stdio: "inherit", shell: process.platform === "win32" });

// A dealer's profile from a JSON file (src/lib/tenancy/profile.ts has every field): an object whose keys are the profile's, so a typo is
// caught here rather than ignored by the app. Returned as the JSON text the directory keeps.
export const PROFILE_KEYS = ["siteUrl", "phone", "email", "address", "hours", "social", "logo", "mark", "modules", "stock", "rules", "placeId", "leadEmail"];
export function readProfile(path) {
  const p = JSON.parse(readFileSync(path, "utf8"));
  if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error(`${path} is not a JSON object`);
  const unknown = Object.keys(p).filter((k) => !PROFILE_KEYS.includes(k));
  if (unknown.length) throw new Error(`Not profile fields: ${unknown.join(", ")} (the fields: ${PROFILE_KEYS.join(", ")})`);
  // Shown as links and images: the website and the listing page on https, the logo and mark from this app (its image policy).
  for (const [k, v] of [["siteUrl", p.siteUrl], ["stock.listingUrl", p.stock?.listingUrl]]) if (v && !/^https:\/\/[^\s"<>]+$/.test(v)) throw new Error(`${k} must be an https address`);
  for (const [k, v] of [["logo.onLight", p.logo?.onLight], ["logo.onDark", p.logo?.onDark], ["mark", p.mark]]) if (v && !/^\/[\w./-]+$/.test(v)) throw new Error(`${k} must be a path on this app, like /brand/<dealer-id>/logo.svg`);
  return JSON.stringify(p);
}
// SQL text in single quotes.
export const sqlText = (v) => `'${String(v).replaceAll("'", "''")}'`;
// The rows a statement on the directory returns. A remote --file runs through D1's import, which returns no rows, so this is a --command,
// run by node from wrangler's own bin with no shell, so the SQL stays one argument on every platform.
// `where` is target().args.
export function directoryRows(sql, where) {
  const bin = join(dirname(fileURLToPath(import.meta.resolve("wrangler/package.json"))), "bin", "wrangler.js");
  const out = execFileSync(process.execPath, [bin, "d1", "execute", "DIRECTORY", ...where, "--command", sql, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(out).flatMap((r) => r.results ?? []);
}
// Runs SQL on the directory from a file: on Windows npx runs through a shell, which would split a --command at its spaces.
export function runDirectorySql(sql, where) {
  const dir = mkdtempSync(join(tmpdir(), "dealer-"));
  try {
    writeFileSync(join(dir, "directory.sql"), sql);
    wrangler("d1", "execute", "DIRECTORY", ...where, "--file", join(dir, "directory.sql"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
