import { cache } from "react";
import { cookies } from "next/headers";
import { staffIdentity, toSignIn } from "@/lib/staff";
import type { Role } from "@/lib/permission-rules";
import { DEMO_DEALER, DEV_EMAIL, membershipsOf, type Dealer } from "./directory";

// Which dealer this request works on, and as what. From the signed-in person (src/lib/staff.ts, the one place that says who it is) and
// their memberships in the directory, never from a dealer id a form, query or header sends. Someone at several dealers picks one; the pick
// is a cookie that is only a preference: it counts only for a dealer they are a member of, checked here on every request and action.
// __Host-, so no other checkwork.ie host can set it (docs/sign-in.md, section 8). The old name is still read, so nobody who picked a dealer
// before the rename loses their pick; the next pick writes the new one and ends the old.
export const DEALER_COOKIE = "__Host-cw_dealer";
export const OLD_DEALER_COOKIE = "checkwork-dealer";
const DEALER_COOKIE_OPTIONS = { path: "/", maxAge: 31_536_000, sameSite: "lax", httpOnly: true, secure: true } as const;
export type Choice = { id: string; name: string };
export type DealerAccess =
  | { state: "signed-out" } // not signed in (src/lib/staff.ts): the proxy already answered, a page load went to sign in, or an action 404s
  | { state: "no-access" } // signed in, but at no dealer (or only at a paused one)
  | { state: "choose"; choices: Choice[] } // at several, none picked yet
  | { state: "ok"; dealer: Dealer; role: Role; email: string; choices: Choice[] };

// Once a request (React cache), server side only.
export const dealerAccess = cache(async (): Promise<DealerAccess> => {
  const who = await staffIdentity();
  if (!who.ok) {
    await toSignIn(); // under our sign-in, a page load goes to sign in here, whichever page, layout or store asked first
    return { state: "signed-out" };
  }
  const mine = await membershipsOf(who.email);
  if (!mine.length) return { state: "no-access" };
  const choices = mine.map((m) => ({ id: m.dealer.id, name: m.dealer.name }));
  const jar = await cookies();
  // shortcut: old dealer cookie name read until 2027-11-22, then delete OLD_DEALER_COOKIE
  const picked = jar.get(DEALER_COOKIE)?.value ?? jar.get(OLD_DEALER_COOKIE)?.value;
  // With no pick: their one dealer, or the chooser. The open app's person (next dev, the E2E run) starts at the demo dealer, as before.
  const m = mine.find((x) => x.dealer.id === picked) ?? (mine.length === 1 ? mine[0] : who.email === DEV_EMAIL ? mine.find((x) => x.dealer.id === DEMO_DEALER) : undefined);
  if (!m) return { state: "choose", choices };
  return { state: "ok", dealer: m.dealer, role: m.role, email: who.email, choices };
});

// Keeps someone's pick (the chooser, a notification's link): only call it with a dealer from their own choices. Secure: browsers still keep
// it on http://localhost (next dev, the E2E run), which counts as a secure origin.
export async function pickDealer(id: string): Promise<void> {
  const jar = await cookies();
  jar.set(DEALER_COOKIE, id, DEALER_COOKIE_OPTIONS);
  if (jar.get(OLD_DEALER_COOKIE)) jar.set(OLD_DEALER_COOKIE, "", { ...DEALER_COOKIE_OPTIONS, maxAge: 0 });
}
