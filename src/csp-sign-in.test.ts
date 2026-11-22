import { describe, expect, it } from "vitest";
import config from "../next.config";

// docs/sign-in.md, section 3: no analytics beacon can run on our sign-in pages. In headers(), the last rule that sets a key on a path wins, so the
// sign-in rule must come after the general one and carry the whole policy.
const rules = await config.headers!();
const effective = (path: string) => {
  const h = new Map<string, string>();
  for (const r of rules) if (r.source === "/:path*" || (r.source === "/sign-in/:path*" && /^\/sign-in(\/|$)/.test(path))) for (const { key, value } of r.headers) h.set(key, value);
  return h;
};

describe("the content policy", () => {
  it("on every sign-in page keeps frame-ancestors none and form-action self, and has no analytics origin", () => {
    for (const path of ["/sign-in", "/sign-in/link", "/sign-in/code"]) {
      const csp = effective(path).get("Content-Security-Policy")!;
      expect(csp, path).toContain("frame-ancestors 'none'");
      expect(csp, path).toContain("form-action 'self'");
      expect(csp, path).toContain("default-src 'self'");
      expect(csp, path).not.toContain("cloudflareinsights");
      for (const d of ["script-src", "connect-src", "frame-src"]) expect(csp.split("; ").find((x) => x.startsWith(d)), `${path} ${d}`).toContain("https://challenges.cloudflare.com");
      expect(effective(path).get("Referrer-Policy"), path).toBe("no-referrer");
    }
  });
  it("elsewhere still allows the analytics origins, and the referrer as before", () => {
    expect(effective("/leads").get("Content-Security-Policy")).toContain("static.cloudflareinsights.com");
    expect(effective("/leads").get("Content-Security-Policy")).not.toContain("challenges.cloudflare.com");
    expect(effective("/leads").get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(effective("/sign-inx").get("Content-Security-Policy")).toContain("cloudflareinsights");
  });
});
