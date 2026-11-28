import "server-only";
import pkg from "../../../package.json";
import { addMonths } from "@/lib/admin/format";
import { currentPlan, monthAllowance, monthCounts, monthOf } from "@/lib/billing/usage";
import { PLANS, usageCosts } from "@/lib/billing/rules";
import { syncStatus } from "@/lib/donedeal/sync";
import { summarise } from "@/lib/reports/monthly";
import { loadReportData } from "@/lib/reports/load";
import { dealerProfile } from "@/lib/tenancy/current";
import { countsBetween } from "./counters";

export const API_VERSION = 1;

// Each month the range touches (at most 13), with its counts by service and kind. Costs only for the month in progress: a past month may
// have been on another plan, and its bill (from the owner's billing program) is what counts for it.
export async function usageBody(from: string, to: string) {
  const allowance = await monthAllowance();
  const months: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7) && months.length < 13; m = addMonths(`${m}-01`, 1).slice(0, 7)) months.push(m);
  return {
    version: API_VERSION,
    months: await Promise.all(
      months.map(async (month) => {
        const c = usageCosts(await monthCounts(month), allowance);
        const { totalEur, ...services } = c;
        const now = month === monthOf();
        return { month, ...(now && { totalEur }), services: Object.fromEntries(Object.entries(services).map(([s, v]) => [s, { count: v.count, ...(now && { costEur: v.costEur }), kinds: v.kinds.map(({ kind, count, costEur }) => ({ kind, count, ...(now && { costEur }) })) }])) };
      }),
    ),
  };
}

export async function summaryBody(from: string, to: string, money: boolean) {
  const [data, counts, sync, usage, plan] = await Promise.all([loadReportData(), countsBetween(from, to), syncStatus(), usageBody(from, to), currentPlan()]);
  const s = summarise(data, from, to, Date.now(), await dealerProfile(), { money });
  return {
    version: API_VERSION,
    appVersion: pkg.version,
    ...s,
    features: counts.features,
    dashboard: counts.dashboard,
    plan: { id: plan, label: PLANS[plan].label, eur: PLANS[plan].eur }, // the plan the dealer pays for (#212), a month before VAT
    listingSync: { lastRunAt: sync.lastRunAt ?? null, lastOkAt: sync.lastOkAt ?? null, result: sync.result ?? null, ok: !sync.problem },
    usage: usage.months,
  };
}
