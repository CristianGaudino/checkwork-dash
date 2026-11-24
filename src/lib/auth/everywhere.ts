import "server-only";
import { getSettings } from "@/lib/admin/collections";
import { logActivity } from "@/lib/admin/activity";
import { logSignIn } from "@/lib/log";
import { removePushOf } from "@/lib/push";
import { runAsDealer } from "@/lib/tenancy/current";
import { dealerIdsOf } from "@/lib/tenancy/directory";
import { staffByEmail } from "./attempts";
import { endSessionsOf } from "./session";

// Sign out everywhere, by the person (/sign-out) or by an owner or manager ("Sign out on all devices" in Settings, Team), docs/sign-in.md
// section 1. A session is a person, not a dealer, so every session of theirs ends, at every dealer, first. Then at each dealer they are at
// (a paused one too: its devices are still theirs),
// inside that dealer's own store: their devices' notifications go, and one line goes in its activity history, from `line` (the person's name
// as that dealer knows them, and the dealer's id). One dealer's failure never stops the next; the sessions have ended by then anyway.
export async function signOutEverywhere(email: string, line: (name: string, dealerId: string) => { summary: string; actor: string }): Promise<void> {
  const e = email.trim().toLowerCase();
  const person = await staffByEmail(e);
  if (person) await endSessionsOf(person.id);
  for (const dealerId of await dealerIdsOf(e)) {
    await runAsDealer(dealerId, async () => {
      await removePushOf(e);
      const t = (await getSettings()).team.find((x) => x.email.toLowerCase() === e);
      const { summary, actor } = line(t?.name ?? e, dealerId);
      await logActivity("settings", summary, t && { kind: "team", id: t.id, label: t.name }, actor);
    }).catch(() => logSignIn({ step: "sign-out", outcome: "failed" }));
  }
}
