import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { dealerProfile, demoCookie } from "@/lib/tenancy/current";
import { MODULES_COOKIE, parseModules, type ModuleId } from "./modules-rules";

// What the current dealer has (#173): their plan, in their profile (src/lib/tenancy/profile.ts). On a demo dealer the demo bar's switches
// say instead (a cookie), so each version can be shown; on any other dealer a cookie never can.
export const enabledModules = cache(async (): Promise<Set<ModuleId>> => parseModules((await demoCookie(MODULES_COOKIE)) ?? (await dealerProfile()).modules));
export const hasModule = async (id: ModuleId) => (await enabledModules()).has(id);
// A page or action of a module that is off answers as if it were not there.
export async function requireModule(id: ModuleId) {
  if (!(await hasModule(id))) notFound();
}
