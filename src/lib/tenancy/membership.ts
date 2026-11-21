import { cache } from "react";
import { cookies } from "next/headers";
import { staffIdentity } from "@/lib/staff";
import type { Role } from "@/lib/permission-rules";
import { DEMO_DEALER, DEV_EMAIL, membershipsOf, type Dealer } from "./directory";

// Which dealer this request works on, and as what. From the signed-in person (src/lib/staff.ts, the one place that says who it is) and
// their memberships in the directory, never from a dealer id a form, query or header sends. Someone at several dealers picks one; the pick
// is a cookie that is only a preference: it counts only for a dealer they are a member of, checked here on every request and action.
export const DEALER_COOKIE = "checkwork-dealer";
export type Choice = { id: string; name: string };
export type DealerAccess =
  | { state: "signed-out" } // Access did not let them in: the proxy already answers 404
  | { state: "no-access" } // signed in, but at no dealer (or only at a paused one)
  | { state: "choose"; choices: Choice[] } // at several, none picked yet
  | { state: "ok"; dealer: Dealer; role: Role; email: string; choices: Choice[] };

// Once a request (React cache), server side only.
export const dealerAccess = cache(async (): Promise<DealerAccess> => {
  const who = await staffIdentity();
  if (!who.ok) return { state: "signed-out" };
  const mine = await membershipsOf(who.email);
  if (!mine.length) return { state: "no-access" };
  const choices = mine.map((m) => ({ id: m.dealer.id, name: m.dealer.name }));
  const picked = (await cookies()).get(DEALER_COOKIE)?.value;
  // With no pick: their one dealer, or the chooser. The open app's person (next dev, the E2E run) starts at the demo dealer, as before.
  const m = mine.find((x) => x.dealer.id === picked) ?? (mine.length === 1 ? mine[0] : who.email === DEV_EMAIL ? mine.find((x) => x.dealer.id === DEMO_DEALER) : undefined);
  if (!m) return { state: "choose", choices };
  return { state: "ok", dealer: m.dealer, role: m.role, email: who.email, choices };
});
