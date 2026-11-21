// The app's own settings. What differs between dealers (their name, website, phone, address, hours, logo, plan, stock source and rules)
// is in each dealer's profile in the directory (src/lib/tenancy/profile.ts), never here.

// This app, the dashboard (wrangler.jsonc routes): links back into it from its emails, and the Worker's calls to its own jobs.
export const APP_URL = "https://www.dash.checkwork.ie";
// Prefix for this app's keys in the browser's storage (the theme).
export const SITE_SLUG = "checkwork-demo";
// Every day and time in the dashboard is said in Irish time, for every dealer, whatever zone the server runs in.
export const TIME_ZONE = "Europe/Dublin";
// Placeholder until 03-02 onboards the sending domain and records the address; must be on that domain. Swap at handover.
export const LEAD_FROM_EMAIL = "leads@checkwork.ie";
// The only reader of APP_ENV. A function so tests can stub the env.
export const isProduction = () => process.env.APP_ENV === "production";
// The Checkwork demo deploy (APP_ENV=demo): only there does the morning cron put a demo dealer's records back (src/app/api/demo/reset).
export const isDemoSite = () => process.env.APP_ENV === "demo";
