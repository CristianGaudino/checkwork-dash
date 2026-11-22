// The Worker entry (wrangler.jsonc "main"): OpenNext's worker, plus the daily purge of old leads and activity. OpenNext's own worker has no scheduled
// handler, so this wraps it. Plain JS on purpose: it imports .open-next/worker.js, which exists only after `opennextjs-cloudflare build`,
// so a typecheck of it would fail on a clean checkout.
// The app jobs run once for each active dealer in the directory (DIRECTORY), the nightly retention purges for every dealer (a paused
// dealer's personal data still has to go on time), each inside that dealer's own database and photo prefix.
import { drizzle } from "drizzle-orm/d1";
import handler from "./.open-next/worker.js";
import { dealers as dealersTable } from "./src/lib/db/directory-schema.ts";
import { prefixedBucket } from "./src/lib/tenancy/bucket.ts";
import { runForDealers } from "./src/lib/tenancy/run-jobs.ts";
import { purgeOldActivity } from "./src/lib/admin/activity-purge.ts";
import { purgeOldCounts } from "./src/lib/owner-api/counts-purge.ts";
import { anonymiseOldSales } from "./src/lib/admin/sales-purge.ts";
import { purgeOldLeads } from "./src/lib/leads/purge.ts";
import { purgeSignIn } from "./src/lib/auth/purge.ts";
import { apexRedirect } from "./src/lib/redirect.ts";
import { APP_URL } from "./src/lib/site.ts";

// OpenNext's worker exports these classes for features this site does not use; kept so the wrapper stays a drop-in.
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";

// This deploy's own address: the APP_URL var of its environment (wrangler.jsonc), production's when unset.
const appUrl = (env) => env.APP_URL || APP_URL;
// The jobs that live in the app, by cron (wrangler.jsonc triggers): the Worker calls their route through the app's own handler with the
// CRON_KEY secret and the dealer's id, once per dealer. Without the key nothing runs. A 404 means the job does not apply to that dealer.
// Logs the job, the dealer's id and counts only. A list runs in order.
const APP_JOBS = {
  "*/15 * * * *": { job: "donedeal-sync", path: "/api/donedeal/sync" }, // src/lib/donedeal/sync.ts
  "0 7 * * *": [
    { job: "follow-up-digest", path: "/api/follow-ups/digest" }, // src/lib/admin/follow-up-digest.ts, 7am or 8am Irish time
    { job: "whatsapp-daily", path: "/api/whatsapp/daily" }, // src/lib/whatsapp/alerts.ts: slow stock, new reviews, the Monday summary
  ],
  "0 7 1 * *": { job: "monthly-report", path: "/api/reports/monthly" }, // src/lib/reports/send.ts, the 1st, 7am or 8am Irish time
  "30 6 * * *": { job: "demo-reset", path: "/api/demo/reset", demoOnly: true }, // demo dealers only, the demo only, each morning: the seed dated from today (so its new leads are not all late), and on a Monday after the 06:00 deploy moves the sold dates (deploy.yml)
};

// One app job for one dealer: its counts, or null when it does not apply (404). A failure throws, so runForDealers counts it.
async function runAppJob({ path }, dealer, env, ctx) {
  const url = `${appUrl(env)}${path}?dealer=${encodeURIComponent(dealer.id)}`;
  const res = await handler.fetch(new Request(url, { method: "POST", headers: { authorization: `Bearer ${env.CRON_KEY}` } }), env, ctx);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("failed");
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}

// Every dealer in the directory. If it cannot be read nothing runs, and the run fails.
const allDealers = (env) => drizzle(env.DIRECTORY).select().from(dealersTable);

const worker = {
  // The bare domain is a second custom domain on this Worker (wrangler.jsonc routes); it only redirects.
  fetch(request, env, ctx) {
    const to = apexRedirect(request.url, new URL(appUrl(env)).hostname);
    return to ? Response.redirect(to, 308) : handler.fetch(request, env, ctx);
  },
  // wrangler.jsonc "triggers". A failure throws, so Cloudflare marks the run failed and Workers Logs shows it.
  // The nightly jobs each run whatever the others do (photo storage being down must not stop the sales being anonymised), then the run
  // fails if any did, so it shows as failed and the next night tries again.
  async scheduled(controller, env, ctx) {
    const dealers = await allDealers(env);
    if (APP_JOBS[controller.cron]) {
      if (!env.CRON_KEY) return;
      // Each runs for each dealer whatever the others do (mail down must not stop the WhatsApp alerts, one dealer must not stop the next);
      // then the run fails if any did.
      let failed = 0;
      for (const job of [APP_JOBS[controller.cron]].flat()) failed += await runForDealers(dealers.filter((d) => d.status === "active" && (!job.demoOnly || d.demo)), job.job, (d) => runAppJob(job, d, env, ctx));
      if (failed) throw new Error(`${failed} app job run(s) failed`);
      return;
    }
    // Every dealer, paused ones too: retention is the law, not a feature of the plan. Each dealer's own database and photo prefix. A dealer
    // whose binding is missing fails its jobs; it never falls back to another's.
    const dbOf = (d) => {
      if (!env[d.binding]) throw new Error("missing binding");
      return drizzle(env[d.binding]);
    };
    const jobs = [
      ["purge-leads", "deleted", (d) => purgeOldLeads(dbOf(d), env.LEAD_PHOTOS && prefixedBucket(env.LEAD_PHOTOS, d.id))], // a count only, never a lead (D-08)
      ["purge-activity", "deleted", (d) => purgeOldActivity(dbOf(d))],
      ["purge-counts", "deleted", (d) => purgeOldCounts(dbOf(d))],
      ["anonymise-sales", "done", (d) => anonymiseOldSales(dbOf(d))],
    ];
    let failed = 0;
    for (const [job, key, run] of jobs) failed += await runForDealers(dealers, job, async (d) => ({ [key]: await run(d) }));
    // The directory's own step, once, not per dealer: our sign-in's old attempts, ended sessions, and people at no dealer (docs/sign-in.md).
    failed += await runForDealers([{ id: "directory" }], "purge-sign-in", () => purgeSignIn(drizzle(env.DIRECTORY)));
    if (failed) throw new Error(`${failed} nightly job run(s) failed`);
  },
};
export default worker;
