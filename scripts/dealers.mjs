// Shared by the dealer scripts: the D1 bindings in wrangler.jsonc, and running wrangler. No dependencies.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

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
