import "server-only";
import { cache } from "react";
import { getSettings } from "@/lib/admin/collections";
import { hasModule } from "@/lib/modules";
import { cookies } from "next/headers";
import { inDealerScope } from "@/lib/tenancy/current";
import { dealerAccess } from "@/lib/tenancy/membership";
import { ROLE_COOKIE, parseRole, roleCan, type Permission, type Role } from "./permission-rules";

// Who is making this request, as the team knows them. Checked on the server, in every page and action that shows or changes something
// sensitive, so a hidden link is never the only protection.
// - A demo dealer (the directory's demo flag): the demo bar's role cookie says (the owner when none is picked), and the person is the first
//   team member with that role. The demo has one login, so this is how a viewer tries each role.
// - Any other dealer: the role the directory gives the signed-in email at the current dealer
//   (src/lib/tenancy/membership.ts), and the name the dealer's team has for it. A cookie never grants anything there. A job (runAsDealer)
//   is nobody: no role.
export type Member = { name: string; email: string; role: Role | null };

export const currentMember = cache(async (): Promise<Member> => {
  const a = inDealerScope() ? null : await dealerAccess();
  if (a?.state !== "ok") return { name: "", email: "", role: null };
  if (a.dealer.demo) {
    const { team } = await getSettings();
    const role = parseRole((await cookies()).get(ROLE_COOKIE)?.value);
    const m = team.find((t) => t.role === role);
    return { name: m?.name ?? role, email: m?.email ?? "", role };
  }
  const { team } = await getSettings();
  const m = team.find((t) => t.email.toLowerCase() === a.email);
  return { name: m?.name ?? a.email, email: a.email, role: a.role };
});

// Margins are also a module (#173): without it nobody has the permission, so every cost, margin and profit figure goes in one place.
export async function can(permission: Permission): Promise<boolean> {
  if (permission === "margins" && !(await hasModule("margins"))) return false;
  return roleCan((await currentMember()).role, permission);
}

// For effects that reach past the dashboard's own records: the directory's team, website keys, email sent from our domain, and real
// personal data (exports, data requests). These also need the role the directory gives the signed-in person, which the demo bar's cookie
// cannot raise, so a demo viewer trying the Owner role sees every screen but changes or takes nothing real. The screen's role still has to
// allow it too, so the demo shows each role's refusals as before. On any other dealer the two roles are one and this is can().
export async function realCan(permission: Permission): Promise<boolean> {
  return (await can(permission)) && roleCan(await realRole(), permission);
}
export async function realRole(): Promise<Role | null> {
  const a = inDealerScope() ? null : await dealerAccess();
  return a?.state === "ok" ? a.role : null;
}
// What a refused real effect says: plainly that the demo bar's role does not count, when it was the cookie that showed the screen.
export const refusal = async (permission: Permission, otherwise: string) => ((await can(permission)) ? DEMO_ROLE_REFUSED : otherwise);
export const DEMO_ROLE_REFUSED = "Your own role cannot do this. The role in the demo bar only shows the screens.";
