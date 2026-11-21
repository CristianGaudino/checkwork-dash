import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getSettings } from "@/lib/admin/collections";
import { demoCookiesCount } from "@/lib/demo";
import { hasModule } from "@/lib/modules";
import { inDealerScope } from "@/lib/tenancy/current";
import { dealerAccess } from "@/lib/tenancy/membership";
import { ROLE_COOKIE, parseRole, roleCan, type Permission, type Role } from "./permission-rules";

// Who is making this request, as the team knows them. Checked on the server, in every page and action that shows or changes something
// sensitive, so a hidden link is never the only protection.
// - The demo (demoCookiesCount: the demo bar is on, and this is the demo deploy, next dev, or the admin is open for the tests): the bar's
//   role cookie says, and the person is the first team member with that role. The demo has one login, so this is how a viewer tries each role.
// - Any other site (APP_ENV=production, no APP_ENV at all, or the demo bar off): the role the directory gives the signed-in email at the
//   current dealer (src/lib/tenancy/membership.ts), and the name the dealer's team has for it. A cookie never grants anything, even if the
//   demo bar was left on by mistake. A job (runAsDealer) is nobody: no role.
export type Member = { name: string; email: string; role: Role | null };

export const currentMember = cache(async (): Promise<Member> => {
  if (demoCookiesCount()) {
    const { team } = await getSettings();
    const role = parseRole((await cookies()).get(ROLE_COOKIE)?.value);
    const m = team.find((t) => t.role === role);
    return { name: m?.name ?? role, email: m?.email ?? "", role };
  }
  const a = inDealerScope() ? null : await dealerAccess();
  if (a?.state !== "ok") return { name: "", email: "", role: null };
  const { team } = await getSettings();
  const m = team.find((t) => t.email.toLowerCase() === a.email);
  return { name: m?.name ?? a.email, email: a.email, role: a.role };
});

// Margins are also a module (#173): without it nobody has the permission, so every cost, margin and profit figure goes in one place.
export async function can(permission: Permission): Promise<boolean> {
  if (permission === "margins" && !(await hasModule("margins"))) return false;
  return roleCan((await currentMember()).role, permission);
}
