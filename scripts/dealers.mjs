// Shared by the dealer scripts: the D1 bindings in wrangler.jsonc, and running wrangler. No dependencies.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

// Every dealer's database binding (DB_<DEALER>); the directory is DIRECTORY.
export const dealerBindings = (cfg = readWrangler()) => (cfg.d1_databases ?? []).map((d) => d.binding).filter((b) => /^DB_[A-Z0-9_]+$/.test(b));

// A dealer id (a slug) and its binding name: checkwork-motors is DB_CHECKWORK_MOTORS.
export const DEALER_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const bindingOf = (id) => `DB_${id.toUpperCase().replaceAll("-", "_")}`;

// --remote (the real databases) or --local (wrangler dev's copies). One of them, said out loud: never a default that writes to production.
export function target(args) {
  const t = args.find((a) => a === "--remote" || a === "--local");
  if (!t) throw new Error("Say --remote (the real databases) or --local (wrangler dev's)");
  return t;
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
export function directoryRows(sql, where) {
  const bin = join(dirname(fileURLToPath(import.meta.resolve("wrangler/package.json"))), "bin", "wrangler.js");
  const out = execFileSync(process.execPath, [bin, "d1", "execute", "DIRECTORY", where, "--command", sql, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(out).flatMap((r) => r.results ?? []);
}
// Runs SQL on the directory from a file: on Windows npx runs through a shell, which would split a --command at its spaces.
export function runDirectorySql(sql, where) {
  const dir = mkdtempSync(join(tmpdir(), "dealer-"));
  try {
    writeFileSync(join(dir, "directory.sql"), sql);
    wrangler("d1", "execute", "DIRECTORY", where, "--file", join(dir, "directory.sql"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
