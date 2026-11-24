import "server-only";
import { sendTo } from "@/lib/leads/mail";
import { hasModule } from "@/lib/modules";
import { gets } from "@/lib/notify-rules";
import { people } from "@/lib/people";
import { appUrl } from "@/lib/site";
import { currentDealer } from "@/lib/tenancy/current";
import { getSettings, leaderEmails, leadsStore, LEAD_TYPE_LABELS, type Lead, type TeamMember } from "./collections";
import { followUpDue } from "./follow-ups";
import { dublinDay, fmtDate } from "./format";

// The morning email (each person's Notifications, "Your follow-ups due"): each salesperson gets the follow-ups due on their leads, today and
// overdue. Leads with nobody on them go to the owners and managers. Only to those who keep it on (`wants`, by email). Run once a day by the
// Worker (worker.mjs, /api/follow-ups/digest). Staff email to staff about the dealer's own leads, like the new-lead email: a name, the kind
// of lead and a link, never the message.
export function digestGroups(leads: Lead[], team: TeamMember[], today: string, wants: (email: string) => boolean = () => true): Map<string, Lead[]> {
  const byName = new Map(team.map((t) => [t.name, t.email]));
  const leaders = leaderEmails(team);
  const out = new Map<string, Lead[]>();
  for (const l of leads.filter((x) => followUpDue(x, today))) {
    const to = l.assignedTo && byName.has(l.assignedTo) ? [byName.get(l.assignedTo)!] : leaders;
    for (const email of to.filter(wants)) out.set(email, [...(out.get(email) ?? []), l]);
  }
  return out;
}

export async function sendFollowUpDigest(now = Date.now()): Promise<{ sent: number }> {
  // The leads are a dashboard page: a dealer without the dashboard (#173) gets no email pointing at it, as with the monthly report.
  if (!(await hasModule("dashboard"))) return { sent: 0 };
  const { team } = await getSettings();
  const on = new Set((await people()).filter((p) => gets(p.prefs, p.role, "email", "follow-ups")).map((p) => p.email.toLowerCase()));
  if (!on.size) return { sent: 0 };
  const today = dublinDay(now);
  const { name } = await currentDealer();
  let sent = 0;
  for (const [email, leads] of digestGroups(await leadsStore.list(), team, today, (e) => on.has(e.toLowerCase()))) {
    const lines = leads
      .sort((a, b) => a.followUpOn!.localeCompare(b.followUpOn!))
      .map((l) => `- ${l.name}, ${LEAD_TYPE_LABELS[l.type]}${l.carTitle ? `, ${l.carTitle}` : ""}${l.followUpOn! < today ? ` (due ${fmtDate(`${l.followUpOn}T12:00:00Z`)})` : ""}\n  ${appUrl()}/leads/${l.id}`);
    try {
      await sendTo([email], { subject: `${name}: ${leads.length === 1 ? "1 follow-up" : `${leads.length} follow-ups`} today`, text: `Due today or overdue:\n\n${lines.join("\n")}\n` });
      sent++;
    } catch {
      console.error(JSON.stringify({ job: "follow-up-digest", error: "an email did not go" }));
    }
  }
  return { sent };
}
