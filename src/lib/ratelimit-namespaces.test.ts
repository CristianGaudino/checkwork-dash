import { describe, expect, it } from "vitest";
import { readWrangler } from "../../scripts/dealers.mjs";

// Rate limit namespace ids are account-wide: Workers sharing one id share a counter (#65).
// Ids used by other Workers in the account: checkwork-demo/wrangler.jsonc (1001, 1002, 1003), cartwright (1001), checkwork (2001).
const OTHER_WORKERS = ["1001", "1002", "1003", "2001"];

type Limit = { name: string; namespace_id: string };
const cfg = readWrangler();
const ids = [...cfg.ratelimits, ...cfg.env.production.ratelimits].map((l: Limit) => l.namespace_id);

describe("rate limit namespaces", () => {
  it("are unique across dev and production", () => {
    expect(ids.filter((id: string, i: number) => ids.indexOf(id) !== i)).toEqual([]);
  });
  it("are not used by another Worker in the account", () => {
    expect(ids.filter((id: string) => OTHER_WORKERS.includes(id))).toEqual([]);
  });
});
