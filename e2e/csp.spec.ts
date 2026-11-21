import { expect, test } from "@playwright/test";

// The content policy (next.config.ts) must never block something the site needs, and must keep the dangerous things off.
const PAGES = ["/", "/leads", "/stock", "/test-drives", "/customers", "/marketing", "/reports", "/settings", "/billing", "/help"];

test("every page sends the policy, with no eval and no wildcard", async ({ request }) => {
  for (const path of PAGES) {
    const csp = (await request.get(path)).headers()["content-security-policy"];
    expect(csp, path).toContain("script-src 'self'");
    expect(csp, path).not.toContain("unsafe-eval");
    expect(csp, path).not.toMatch(/(^|[ ;])\*|https:(;| |$)/); // no bare * and no "any https"
    expect(csp, path).toContain("frame-ancestors 'none'");
  }
});

test("no page is blocked by the policy", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (m) => /Content Security Policy|Refused to/i.test(m.text()) && blocked.push(m.text()));
  page.on("pageerror", (e) => /Content security policy/i.test(e.message) && blocked.push(e.message));
  for (const path of PAGES) {
    await page.goto(path, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
  }
  expect(blocked).toEqual([]);
});
