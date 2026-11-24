import "server-only";
import { postsStore } from "./collections";
import { simulatedPost } from "./marketing";
import { publishPost } from "./publishers";
import { MINUTE } from "@/lib/time";
import { logActivity } from "./activity";
import { PUBLISH_MODE } from "./networks";

// Sends the scheduled posts whose time has come. Anything can call it: today the marketing page does when it opens, and a cron trigger on the
// Worker can call it on a timer (wrangler.jsonc "triggers") when a real publisher is connected. A post that fails to send stays scheduled.
// A post is marked claimed before it is sent, and one claimed in the last CLAIM_MS is skipped: that stops a second page load from sending it
// again, and gives a failing post a pause before the next try.
// shortcut: the claim is read then written, not atomic, so two calls in the same instant can still both send. Use a D1 conditional update
// when a live publisher is connected.
export const CLAIM_MS = 5 * MINUTE;
export async function sendDuePosts(now = Date.now()): Promise<number> {
  let sent = 0;
  for (const p of await postsStore.list()) {
    if (p.status !== "scheduled" || p.scheduledFor === undefined || p.scheduledFor > now || (p.claimedAt && now - p.claimedAt < CLAIM_MS)) continue;
    await postsStore.put({ ...p, claimedAt: now });
    const held = PUBLISH_MODE[p.network][p.format ?? "post"] === "prepare";
    const r = held ? { ok: true as const } : await publishPost(p); // a held post never reaches a network
    if (!r.ok) continue;
    await postsStore.put({ ...p, status: "posted", postedAt: p.scheduledFor, claimedAt: undefined, ...(r.simulated && { simulated: true, ...simulatedPost(p.id) }) });
    // In the history like a post sent by hand; a TikTok post is held until TikTok approves us, and says so.
    await logActivity("marketing", held ? `Saved a scheduled ${p.network} post to go out once ${p.network} approves us` : `Published a scheduled ${p.network} post`, { kind: "post", id: p.id }, "Scheduler");
    sent++;
  }
  return sent;
}
