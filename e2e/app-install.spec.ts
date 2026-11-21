import { generateKeyPairSync } from "node:crypto";
import { expect, test } from "@playwright/test";

// The app on the home screen and its notifications (#11). The main server has no VAPID keys; the second one (playwright.config.ts) has a
// pair made for the run. Real delivery to a phone is not tested: the browser's push subscription is stubbed.
const PUSH_URL = `http://localhost:${Number(process.env.PORT ?? 3000) + 1}`;

test("the manifest, its icons, the service worker and the offline screen are served, and every page links them", async ({ page, request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const m = await manifest.json();
  expect(m).toMatchObject({ name: "Checkwork", start_url: "/", display: "standalone" });
  for (const icon of m.icons) expect((await request.get(icon.src)).status()).toBe(200);
  expect(m.icons.some((i: { purpose: string; sizes: string }) => i.purpose === "maskable" && i.sizes === "512x512")).toBe(true);
  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toContain("javascript");
  expect(await sw.text()).toContain('addEventListener("push"');
  expect((await request.get("/offline.html")).status()).toBe(200);
  expect((await request.get("/brand/apple-touch-icon.png")).status()).toBe(200);

  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("crossorigin", "use-credentials");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Checkwork");
  await expect.poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration("/")))).toBe(true);
});

test("Settings says notifications are not set up yet when there are no keys", async ({ page }) => {
  await page.goto("/settings?section=emails");
  const panel = page.getByRole("region", { name: "Notifications on this phone" });
  await expect(panel.getByText("Notifications are not set up yet.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Turn on" })).toHaveCount(0);
});

test("with keys, a person turns notifications on and off on this phone", async ({ page }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "needs the run's own server with keys");
  const jwk = generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ format: "jwk" });
  const p256dh = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url");
  // The browser's push service, stubbed: a subscription that names Google's push service, as Chrome's does.
  await page.addInitScript((p256dh) => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${Math.random().toString(36).slice(2)}`;
    let current: unknown = null;
    const sub = { endpoint, toJSON: () => ({ endpoint, keys: { p256dh, auth: "AAAAAAAAAAAAAAAAAAAAAA" } }), unsubscribe: async () => ((current = null), true) };
    PushManager.prototype.getSubscription = async () => current as PushSubscription | null;
    PushManager.prototype.subscribe = async () => (current = sub) as unknown as PushSubscription;
    Notification.requestPermission = async () => "granted";
  }, p256dh);
  await page.goto(`${PUSH_URL}/settings?section=emails`);
  const panel = page.getByRole("region", { name: "Notifications on this phone" });
  await panel.getByRole("button", { name: "Turn on" }).click();
  await expect(panel.getByText("Android phone (this one)")).toBeVisible();
  await expect(panel.getByText(/^On\./)).toBeVisible();
  await panel.getByRole("button", { name: "Turn off" }).first().click();
  await expect(panel.getByRole("button", { name: "Turn on" })).toBeVisible();
  await expect(panel.getByText("(this one)")).toHaveCount(0);
  await page.goto(`${PUSH_URL}/activity`);
  await expect(page.getByText("Turned off notifications on a device (Android phone)").first()).toBeVisible();
});
