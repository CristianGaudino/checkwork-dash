import "server-only";
import { defineCollection } from "@/lib/admin/docs";
import { dublinDay } from "@/lib/admin/format";
import { SETTINGS_DEFAULT, getSettings, settingsStore, type DealerSettings } from "@/lib/admin/collections";
import { notify } from "@/lib/admin/notifications";
import { alertsCrossed, allowanceFor, inAllowance, usageCosts, usageId, withinCaps, type BillingSettings, type Kind, type Service, type UsageCount, withBillingDefaults } from "./rules";
import { billedModules } from "@/lib/modules";
import { roleCan } from "@/lib/permission-rules";
import { currentDealer } from "@/lib/tenancy/current";

// The meters for what is billed per use (#181): registration lookups, AI actions and WhatsApp messages. Every paid use is counted here,
// once, by the code that makes it; the Billing page, the owner API (#174) and the bill all read these counts, so they never disagree.
// A month's line is one record (usageId), so the store grows by a few records a month, not one per use.
export const usageStore = defineCollection<UsageCount>("usage", seedUsage);
// The limit notices already sent, by key (a month, a service and the limit), so each goes once.
export const sentAlertsStore = defineCollection<{ id: string }>("usage-alerts", () => []);

export const monthOf = (t: number = Date.now()) => dublinDay(t).slice(0, 7);

// A record saved before the AI assistant was dropped may still carry `aiPlan`: nothing reads it.
export const billingSettings = async (): Promise<BillingSettings> => withBillingDefaults((await getSettings()).billing);
// What the plan includes this month before usage is billed.
export const monthAllowance = async (b: BillingSettings) => allowanceFor(await billedModules(), b);
export async function monthCounts(month = monthOf()): Promise<UsageCount[]> {
  return (await usageStore.list()).filter((c) => c.month === month);
}
export async function monthUsage(month = monthOf()) {
  return usageCosts(await monthCounts(month), await monthAllowance(await billingSettings()));
}

// Whether one more use is allowed: false once the month's spend reaches a limit (the dealer's or ours), unless the plan still includes it
// (a use inside the allowance costs nothing, so even a EUR 0 limit lets it through), and for AI writing once it reaches our fair use.
// The caller falls back without it.
export async function usageAllowed(service: Service, kind?: string): Promise<boolean> {
  try {
    const b = await billingSettings();
    const allowance = await monthAllowance(b);
    const usage = usageCosts(await monthCounts(), allowance);
    return withinCaps(usage, b, service) || inAllowance(usage, allowance, service, kind);
  } catch {
    return true; // a meter that cannot be read never stops the dealer's work; the cap is checked again on the next use
  }
}

// Counts one use, then tells the owners and managers in the bell if it reached a limit. Best effort: a use is never undone because its count could not be written.
// shortcut: read then write, so two uses at the same moment can count once. Fine for a dealer's volume; a Durable Object counter if exact.
export async function recordUsage<S extends Service>(service: S, kind: Kind<S>, n = 1): Promise<void> {
  try {
    const month = monthOf();
    const b = await billingSettings();
    const before = await monthCounts(month);
    // A demo dealer's AI is real Claude and costs real money: its count is a "real-" record, which the demo reset keeps, so the month's cap holds
    // across the morning reseed and Reset demo data (the seeded lines above it still reset).
    const id = service === "ai" && (await currentDealer()).demo ? `real-${usageId(month, service, kind)}` : usageId(month, service, kind);
    const prev = before.find((c) => c.id === id);
    const next: UsageCount = { id, month, service, kind, count: (prev?.count ?? 0) + n };
    await usageStore.put(next);
    const after = [...before.filter((c) => c.id !== id), next];
    const allowance = await monthAllowance(b);
    const alerts = alertsCrossed(usageCosts(before, allowance), usageCosts(after, allowance), b, month);
    if (!alerts.length) return;
    const { team } = await getSettings();
    // Each owner and manager, by the name the bell knows them by (src/lib/permissions.ts): the team's, from the directory (an owner added
    // there with no name yet goes by their email). Only them, so Sales and Finance never see what the dealer pays; with nobody, no notice.
    const leaders = team.filter((t) => roleCan(t.role, "billing")).map((t) => t.name);
    for (const a of alerts) {
      if (await sentAlertsStore.get(a.key)) continue;
      await sentAlertsStore.put({ id: a.key });
      for (const name of leaders) await notify({ kind: "usage", text: a.text, detail: a.detail, href: "/billing", for: name });
    }
  } catch {
    // shortcut: a lost count is a few cents unbilled; the use itself went through
  }
}

// Saves the dealer's limits (the Billing page), or the term and the free month (the owner API, #177). Ours, the ceilings, are never set here.
// `change` may be worked out from the billing as it is when written, so two saves at once both land.
type BillingChange = Partial<Pick<BillingSettings, "caps" | "term" | "freeMonth">>;
export async function saveBilling(change: BillingChange | ((now: BillingSettings) => BillingChange)) {
  // On the settings as they are now, so a team change saved at the same moment is never undone.
  const apply = (s: Partial<DealerSettings>) => {
    const b = withBillingDefaults(s.billing);
    return { ...SETTINGS_DEFAULT, ...s, billing: { ...b, ...(typeof change === "function" ? change(b) : change) }, updatedAt: Date.now() };
  };
  if (!(await settingsStore.update("dealer", apply))) await settingsStore.put(apply({}));
}

// The demo's month so far: steady daily use, so the Billing page shows a lived-in month on any day, well under the demo's limits.
function seedUsage(): UsageCount[] {
  const month = monthOf();
  const day = Number(dublinDay().slice(8, 10));
  const lines: [Service, string, number][] = [
    ["lookup", "dashboard", 3 * day],
    ["ai", "opus", 4 * day],
    ["ai", "sonnet", 3 * day],
    ["whatsapp", "alert", 6 * day],
    ["whatsapp", "reply", 4 * day],
    ["whatsapp", "marketing", day > 7 ? 40 : 0],
  ];
  return lines.map(([service, kind, count]) => ({ id: usageId(month, service, kind), month, service, kind, count }));
}
