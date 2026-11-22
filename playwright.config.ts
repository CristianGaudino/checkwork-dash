import { generateKeyPairSync } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

// Runs against E2E_BASE_URL, or a local production build (npm run build && npm start) on PORT (default 3000).
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

// SITE_PHOTO_SECRET empty: the run has none, whatever a local .env sets (the Settings warning is tested), and an empty value counts as unset.
// SIGN_IN empty, whatever the shell has: Access alone, as production today, except on the closed server below.
const SERVER_ENV = { E2E_FAKE_BACKENDS: "1", SIGN_IN: "", UNSUBSCRIBE_SECRET: "e2e-unsubscribe-secret", OWNER_API_TOKEN: "e2e-owner-token", SITE_PHOTO_SECRET: "", DEALER_SECRETS_KEY: Buffer.alloc(32, 7).toString("base64"), ANTHROPIC_API_KEY: "" }; // no key: AI writing is the mock in every run, never paid Claude
const PUSH_PORT = Number(process.env.PORT ?? 3000) + 1;
const PUSH_URL = `http://localhost:${PUSH_PORT}`;
// A third server of the same build, closed (docs/sign-in.md, section 9): E2E_SIGN_IN=1 turns the open shortcut off (it can only close the
// app, never open it) and SIGN_IN=own puts our sign-in in front (its mail is the in-memory outbox, src/lib/auth/mail.ts), for e2e/sign-in.spec.ts. Its APP_URL is its own, for the Origin checks.
const SIGN_IN_PORT = Number(process.env.PORT ?? 3000) + 2;
const SIGN_IN_URL = `http://localhost:${SIGN_IN_PORT}`;
// And a fourth, closed the same way with SIGN_IN unset (Access alone, as production today), to pin that nothing of our sign-in is reachable
// there. No Access is set up, so every page is a 404: it is ready once a static file answers.
const ACCESS_PORT = SIGN_IN_PORT + 1;
function vapidForRun() {
  const jwk = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]);
  return { VAPID_PUBLIC_KEY: raw.toString("base64url"), VAPID_PRIVATE_KEY: jwk.d! };
}

export default defineConfig({
  testDir: "e2e",
  // A CI runner is slower than a laptop: a longer wait on every check, and one retry so a stray slow test does not fail the pull request.
  retries: process.env.CI ? 1 : 0,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL, ...devices["Pixel 7"] },
  // Specs run in parallel against one server, and many assume the newest car is the first demo car. A spec that adds or edits cars
  // (admin-stock) would change what they see, so it runs alone, after everything else.
  projects: [
    { name: "main", testIgnore: /admin-stock\.spec/ },
    { name: "stock-writes", testMatch: /admin-stock\.spec/, dependencies: ["main"] },
  ],
  // E2E_FAKE_BACKENDS lets a production build answer from memory with no D1 (the directory, src/lib/tenancy/directory.ts, and stock,
  // src/lib/stock/index.ts). Only ever set here.
  // A second server of the same build with push notifications set up (#11, e2e/app-install.spec.ts), on the next port: the first has no keys,
  // as dev and the demo have none yet. Its key pair is made here for the run, never kept.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        { command: "npm start", url: baseURL, reuseExistingServer: false, env: { ...SERVER_ENV } },
        { command: "npm start", url: PUSH_URL, reuseExistingServer: false, env: { ...SERVER_ENV, PORT: String(PUSH_PORT), ...vapidForRun() } },
        { command: "npm start", url: `${SIGN_IN_URL}/sign-in`, reuseExistingServer: false, env: { ...SERVER_ENV, PORT: String(SIGN_IN_PORT), E2E_SIGN_IN: "1", SIGN_IN: "own", APP_URL: SIGN_IN_URL, SIGN_IN_SECRET: "e2e-sign-in-secret-not-a-real-one-0123456789" } },
        { command: "npm start", url: `http://localhost:${ACCESS_PORT}/icon.svg`, reuseExistingServer: false, env: { ...SERVER_ENV, PORT: String(ACCESS_PORT), E2E_SIGN_IN: "1" } },
      ],
});
