import "server-only";
import { getSettings, leaderEmails } from "@/lib/admin/collections";
import { dublinDay, fmtNum } from "@/lib/admin/format";
import { monthLabel } from "@/lib/admin/reports";
import { sendTo } from "@/lib/leads/mail";
import { APP_URL } from "@/lib/site";
import { currentDealer } from "@/lib/tenancy/current";
import { loadReportData } from "./load";
import { hasModule } from "@/lib/modules";
import { advice, compare, fmtWait, monthBefore, monthRange, summarise } from "./monthly";

// The email on the 1st (worker.mjs, /api/reports/monthly): last month's figures to the owners and managers. Counts only, never a customer.
export async function sendMonthlyReport(now = Date.now()): Promise<{ month: string; sent: number }> {
  const month = monthBefore(dublinDay(now).slice(0, 7));
  // The report is a dashboard page: a dealer without the dashboard (#173) gets no email pointing at it.
  if (!(await hasModule("dashboard"))) return { month, sent: 0 };
  const reviews = await hasModule("reviews"); // as the page: reviews only with the module
  const { team } = await getSettings();
  const to = leaderEmails(team);
  if (!to.length) return { month, sent: 0 };
  const [data, { name, profile }] = await Promise.all([loadReportData(), currentDealer()]);
  const at = (m: string) => summarise(data, monthRange(m).from, monthRange(m).to, now, profile);
  const oldDays = profile.rules.oldStockDays;
  const s = at(month);
  const p = at(monthBefore(month));
  const text = [
    `${monthLabel(month)} on ${name}`,
    "",
    `Leads: ${fmtNum(s.leads.total)} (${compare(s.leads.total, p.leads.total)}), ${fmtNum(s.leads.outOfHours)} out of hours`,
    `First reply, median: ${fmtWait(s.replies.medianInHoursMin)} in hours, ${fmtWait(s.replies.medianOutOfHoursMin)} out of hours; ${fmtNum(s.replies.none)} with no reply in 24 hours`,
    `Cars: ${fmtNum(s.stock.added)} added, ${fmtNum(s.stock.sold)} sold, ${fmtNum(s.stock.oldStock)} for sale ${oldDays} days or more`,
    ...(reviews ? [`Reviews: ${fmtNum(s.reviews.count)} new`] : []),
    "",
    advice(s, oldDays),
    "",
    `The full report: ${APP_URL}/monthly-report?month=${month}`,
  ].join("\n");
  try {
    await sendTo(to, { subject: `${name}: your report for ${monthLabel(month)}`, text });
    return { month, sent: to.length };
  } catch {
    console.error(JSON.stringify({ job: "monthly-report", error: "the email did not go" }));
    return { month, sent: 0 };
  }
}
