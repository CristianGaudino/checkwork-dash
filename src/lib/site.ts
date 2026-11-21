// The app's own settings. What differs between dealers (their name, website, phone, address, hours, logo, plan, stock source and rules)
// is in each dealer's profile in the directory (src/lib/tenancy/profile.ts), never here.

// This app, the dashboard (wrangler.jsonc routes): links back into it from its emails, and the Worker's calls to its own jobs.
export const APP_URL = "https://www.dash.checkwork.ie"; // production's
// This deploy's own address (the APP_URL var per environment in wrangler.jsonc), so dev's emails link to dev, never to production.
export const appUrl = () => process.env.APP_URL || APP_URL;
// Prefix for this app's keys in the browser's storage (the theme).
export const SITE_SLUG = "checkwork-demo";
// Every day and time in the dashboard is said in Irish time, for every dealer, whatever zone the server runs in.
export const TIME_ZONE = "Europe/Dublin";
// Placeholder until 03-02 onboards the sending domain and records the address; must be on that domain. Swap at handover.
export const LEAD_FROM_EMAIL = "leads@checkwork.ie";
// The only reader of APP_ENV: the deploy job's test run fails while the finance figures are placeholders (finance.config.test.ts). What a
// dealer sees (simulated services, made-up records, the demo reset) follows the dealer's demo flag in the directory, never the deploy.
export const isProduction = () => process.env.APP_ENV === "production";
