import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertDemo, dealerBindings, deployPhases, readWrangler, target } from "../../scripts/dealers.mjs";
import { assertLive } from "../../scripts/live-version.mjs";

// The two environments (wrangler.jsonc): dev is the top level and the default, production only with --env production.
const cfg = readWrangler();
const prod = cfg.env.production;
const at = (argv: string[], environ: Record<string, string | undefined> = {}) => target(argv, {}, cfg, environ as NodeJS.ProcessEnv);
const dbName = (c: typeof cfg, binding: string) => c.d1_databases.find((d: { binding: string }) => d.binding === binding).database_name;

describe("the scripts' environment", () => {
  it("refuses a CLOUDFLARE_ENV line in .env or .env.local, which wrangler would read", () => {
    const dir = mkdtempSync(join(tmpdir(), "cw-env-"));
    const file = join(dir, ".env.local");
    writeFileSync(file, "FOO=1\nexport CLOUDFLARE_ENV=production\n");
    expect(() => target(["--remote"], {}, cfg, {} as NodeJS.ProcessEnv, [file])).toThrow(/CLOUDFLARE_ENV/);
    writeFileSync(file, "FOO=1\n# CLOUDFLARE_ENV is never set here\n");
    expect(target(["--remote"], {}, cfg, {} as NodeJS.ProcessEnv, [file]).env).toBe("dev");
    rmSync(dir, { recursive: true });
  });

  it("is dev with no flag, and says so to wrangler", () => {
    const t = at(["--remote"]);
    expect(t.env).toBe("dev");
    expect(t.args).toEqual(["--remote", "--env="]);
    expect(dbName(t.config, "DIRECTORY")).toBe("checkwork-dev-directory");
  });

  it("is production only with --env production, in either spelling", () => {
    for (const argv of [["--remote", "--env", "production"], ["--env=production", "--remote"]]) {
      const t = at(argv);
      expect(t.env).toBe("production");
      expect(t.args).toEqual(["--remote", "--env=production"]);
      expect(dbName(t.config, "DIRECTORY")).toBe("checkwork-directory");
    }
  });

  it("refuses anything else that could mean another environment", () => {
    expect(() => at(["--remote", "--env", "prod"])).toThrow(/production only/);
    expect(() => at(["--remote", "--env=dev"])).toThrow(/production only/);
    expect(() => at(["--remote", "--env"])).toThrow();
    expect(() => at(["--remote", "--prod"])).toThrow(); // an unknown flag stops the script
    expect(() => at(["--remote"], { CLOUDFLARE_ENV: "production" })).toThrow(/CLOUDFLARE_ENV/);
    expect(() => at(["--remote"], { CLOUDFLARE_ENV: "" })).toThrow(/CLOUDFLARE_ENV/);
  });

  it("needs --remote or --local, one of them", () => {
    expect(() => at([])).toThrow(/--remote/);
    expect(() => at(["--remote", "--local"])).toThrow(/--remote/);
    expect(at(["--local"]).args).toEqual(["--local", "--env="]);
  });

  it("keeps the positionals apart from --env's value", () => {
    const t = target(["--env", "production", "example-motors", "Example Motors", "--remote", "--demo"], { demo: { type: "boolean" } }, cfg, {} as NodeJS.ProcessEnv);
    expect(t.positionals).toEqual(["example-motors", "Example Motors"]);
    expect((t.values as { demo?: boolean }).demo).toBe(true);
  });
});

describe("the stock seed", () => {
  it("is for a demo dealer only", () => {
    expect(() => assertDemo("example-motors", [{ demo: 0 }])).toThrow(/not a demo dealer/);
    expect(() => assertDemo("example-motors", [])).toThrow(/No dealer/);
    expect(() => assertDemo("checkwork-motors", [{ demo: 1 }])).not.toThrow();
  });
});

describe("wrangler.jsonc keeps dev and production apart", () => {
  const list = (c: typeof cfg, key: string, field: string) => (c[key] ?? []).map((x: Record<string, string>) => x[field]);

  it("binds the same names in both, to different resources", () => {
    expect(list(prod, "d1_databases", "binding")).toEqual(list(cfg, "d1_databases", "binding"));
    expect(list(prod, "r2_buckets", "binding")).toEqual(list(cfg, "r2_buckets", "binding"));
    expect(list(prod, "ratelimits", "name")).toEqual(list(cfg, "ratelimits", "name"));
    expect(Object.keys(prod.vars)).toEqual(Object.keys(cfg.vars));
    expect(list(prod, "send_email", "name")).toEqual(list(cfg, "send_email", "name"));
    // Dev never emails real people: no list and no fixed address, so Cloudflare sends only to the verified Email Routing destinations (our team).
    expect(cfg.send_email[0]).toEqual({ name: "EMAIL" });
    expect(prod.send_email[0].allowed_destination_addresses).toBeUndefined();
    expect(prod.triggers).toEqual(cfg.triggers);
    for (const [key, field] of [["d1_databases", "database_id"], ["d1_databases", "database_name"], ["r2_buckets", "bucket_name"], ["ratelimits", "namespace_id"], ["routes", "pattern"]]) {
      const dev = list(cfg, key, field);
      expect(list(prod, key, field).filter((v: string) => dev.includes(v)), `${key}.${field}`).toEqual([]);
    }
  });

  it("names each environment's own resources", () => {
    expect(cfg.name).toBe("checkwork-dash-dev");
    expect(prod.name).toBe("checkwork-dash");
    for (const c of [cfg, prod]) expect(c.services).toEqual([{ binding: "WORKER_SELF_REFERENCE", service: c.name }]);
    expect(list(cfg, "d1_databases", "database_name").every((n: string) => n.startsWith("checkwork-dev-"))).toBe(true);
    expect(list(prod, "d1_databases", "database_name").some((n: string) => n.includes("dev"))).toBe(false);
    expect(dealerBindings(cfg).map((b: string) => `checkwork-dev-dealer-${b.slice(3).toLowerCase().replaceAll("_", "-")}`)).toEqual(dealerBindings(cfg).map((b: string) => dbName(cfg, b)));
    expect(dealerBindings(prod).map((b: string) => `checkwork-dealer-${b.slice(3).toLowerCase().replaceAll("_", "-")}`)).toEqual(dealerBindings(prod).map((b: string) => dbName(prod, b)));
    expect(list(cfg, "r2_buckets", "bucket_name")).toEqual(["checkwork-dash-dev-files"]);
    expect(list(prod, "r2_buckets", "bucket_name")).toEqual(["checkwork-dash-files"]);
  });

  it("reaches production from npm only through a :prod script", () => {
    const scripts: Record<string, string> = JSON.parse(readFileSync("package.json", "utf8")).scripts;
    for (const [name, cmd] of Object.entries(scripts)) {
      expect(cmd.includes("production"), name).toBe(name.endsWith(":prod"));
      expect(/\bwrangler\b.*--remote/.test(cmd), `${name} runs wrangler on a real database without the scripts' guard`).toBe(false);
    }
  });
});

describe("a deploy's phases", () => {
  it("builds and ships by default, and splits with --build-only and --built", () => {
    const phases = (argv: string[]) => deployPhases(target(["--remote", ...argv], { "build-only": { type: "boolean" }, built: { type: "boolean" } }, cfg, {} as NodeJS.ProcessEnv, []).values);
    expect(phases([])).toEqual({ build: true, ship: true });
    expect(phases(["--build-only"])).toEqual({ build: true, ship: false });
    expect(phases(["--built", "--env", "production"])).toEqual({ build: false, ship: true });
    expect(() => phases(["--build-only", "--built"])).toThrow(/cannot go together/);
    expect(() => target(["--remote", "--built"], {}, cfg, {} as NodeJS.ProcessEnv, [])).toThrow(); // other scripts refuse it
  });
});

describe("the live version check", () => {
  const view = (tag?: string) => () => ({ annotations: tag === undefined ? undefined : { "workers/tag": tag } });
  const one = { versions: [{ version_id: "v1", percentage: 100 }] };
  it("passes for one version at 100% tagged with the commit", () => {
    expect(assertLive(one, view("abc"), "abc")).toBe("v1");
  });
  it("fails loudly on a split, another tag, a missing tag or an unknown shape", () => {
    expect(() => assertLive({ versions: [{ version_id: "v1", percentage: 50 }, { version_id: "v2", percentage: 50 }] }, view("abc"), "abc")).toThrow(/100%/);
    expect(() => assertLive(one, view("old"), "abc")).toThrow(/not abc/);
    expect(() => assertLive(one, view(), "abc")).toThrow(/no workers\/tag/);
    expect(() => assertLive({}, view("abc"), "abc")).toThrow(/no versions/);
  });
});
