import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertDemo, dealerBindings, readWrangler, target } from "../../scripts/dealers.mjs";

// The two environments (wrangler.jsonc): dev is the top level and the default, production only with --env production.
const cfg = readWrangler();
const prod = cfg.env.production;
const at = (argv: string[], environ: Record<string, string | undefined> = {}) => target(argv, {}, cfg, environ as NodeJS.ProcessEnv);
const dbName = (c: typeof cfg, binding: string) => c.d1_databases.find((d: { binding: string }) => d.binding === binding).database_name;

describe("the scripts' environment", () => {
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
    expect(prod.send_email).toEqual(cfg.send_email);
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
