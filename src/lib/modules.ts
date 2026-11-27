import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { dealerProfile } from "@/lib/tenancy/current";
import { MODULE_IDS, parseModules, type ModuleId } from "./modules-rules";

// One system (#212): every dealer has every part of the dashboard, whatever their stored profile says. These helpers go with the module code.
export const enabledModules = cache(async (): Promise<Set<ModuleId>> => new Set(MODULE_IDS));
// What the dealer is billed for until there is one plan (#212, piece 4): the plan in their profile, so no price changes before the owner sets it.
export const billedModules = cache(async (): Promise<Set<ModuleId>> => parseModules((await dealerProfile()).modules));
export const hasModule = async (id: ModuleId) => (await enabledModules()).has(id);
// A page or action of a module that is off answers as if it were not there.
export async function requireModule(id: ModuleId) {
  if (!(await hasModule(id))) notFound();
}
