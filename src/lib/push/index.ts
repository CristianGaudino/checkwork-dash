import "server-only";
import { getSettings } from "@/lib/admin/collections";
import { defineCollection } from "@/lib/admin/docs";
import { sendPush, type PushKeys, type Vapid } from "./webpush";
export { pushId } from "./webpush";

// Notifications on a team member's own phone or computer (#11): standard Web Push, sent by us, so free and simulated nowhere. One record per
// device in the dealer's own store, by its endpoint, for the signed-in person's email. The endpoint is a device's address with the push service:
// never logged, never in the activity history.
export type PushSub = { id: string; email: string; endpoint: string; keys: PushKeys; label: string; addedAt: number };
export const pushStore = defineCollection<PushSub>("push-subscriptions", () => []);

// The key pair is per environment: VAPID_PUBLIC_KEY a var, VAPID_PRIVATE_KEY a Worker secret (scripts/vapid-keys.mjs). Read on use.
export const PUSH_SUBJECT = "mailto:contact@checkwork.ie";
export function vapid(): Vapid | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  return publicKey && privateKey ? { publicKey, privateKey, subject: PUSH_SUBJECT } : null;
}

// Only the push services browsers use: the server posts to whatever endpoint it is given, so never to anywhere else.
const PUSH_HOSTS = ["fcm.googleapis.com", "push.apple.com", "push.services.mozilla.com", "notify.windows.com"];
const B64U = /^[A-Za-z0-9_-]+$/;
export function validSub(s: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }): s is { endpoint: string; keys: PushKeys } {
  const { endpoint, keys } = s;
  if (typeof endpoint !== "string" || endpoint.length > 1000 || typeof keys?.p256dh !== "string" || typeof keys.auth !== "string") return false;
  if (keys.p256dh.length !== 87 || keys.auth.length !== 22 || !B64U.test(keys.p256dh) || !B64U.test(keys.auth)) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

// A short name for the device, from its browser's user agent, so a person can tell their phone from their laptop.
export function deviceLabel(ua: string): string {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows computer";
  return "Computer";
}

export type PushMessage = { title: string; body: string; url: string };

// To each device of the people who get the matching bell notification: `for` is the one team member it is for (by name, as in the bell);
// with none, everyone on the team. Only people still on the team. Best effort: a push never fails the thing that caused it, so this never
// throws. A device the push service says is gone (404, 410) is removed. Any other failure is logged with its status only.
export async function pushToTeam(msg: PushMessage, forName?: string): Promise<void> {
  try {
    const v = vapid();
    if (!v) return;
    const subs = await pushStore.list();
    if (!subs.length) return;
    const emails = new Set((await getSettings()).team.filter((t) => !forName || t.name === forName).map((t) => t.email.toLowerCase()));
    const payload = JSON.stringify(msg);
    await Promise.all(
      subs
        .filter((s) => emails.has(s.email))
        .map(async (s) => {
          try {
            const status = await sendPush(s, payload, v);
            if (status === 404 || status === 410) await pushStore.remove(s.id);
            else if (status >= 300) console.warn(JSON.stringify({ push: "failed", status }));
          } catch {
            console.warn(JSON.stringify({ push: "failed" })); // never the error: it can carry the endpoint
          }
        }),
    );
  } catch {
    console.warn(JSON.stringify({ push: "failed" }));
  }
}

// Every device of one person goes when they leave the team.
export async function removePushOf(email: string): Promise<void> {
  const e = email.toLowerCase();
  for (const s of await pushStore.list()) if (s.email === e) await pushStore.remove(s.id);
}
