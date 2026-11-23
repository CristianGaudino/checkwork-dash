import type { Lead } from "./collections";
import { HOUR } from "@/lib/time";
import { isUrgent } from "@/lib/leads/contact-topics";

// A follow-up is due on its day and after, while the lead is still open. Won, lost, closed and spam leads have none. Type imports only, so the
// overview and its tests can use it without the record store.
export const isOpenLead = (l: Pick<Lead, "status">) => l.status !== "won" && l.status !== "lost" && l.status !== "closed" && l.status !== "spam";
// The spam check was unsure of it on arrival (#56): "Possible spam", with Spam and Not spam, while nobody has answered it yet.
export const possibleSpam = (l: Pick<Lead, "status" | "maybeSpam">) => Boolean(l.maybeSpam) && l.status === "new";
// A new lead nobody has answered within the dealer's reply target (settings.leadSlaHours).
export const pastReplyTarget = (l: Pick<Lead, "status" | "createdAt">, now: number, slaHours: number) => l.status === "new" && now - l.createdAt > slaHours * HOUR;
export const followUpDue = (l: Pick<Lead, "status" | "followUpOn">, today: string) => Boolean(l.followUpOn && isOpenLead(l) && l.followUpOn <= today);
// New leads that need an answer first: "this week" ("can't be driven" is a car bought here, filed in Aftersales).
export const isHotLead = (l: Lead) => l.status === "new" && Boolean(l.topic) && isUrgent(l.answers ?? {});
// One badge for a new lead that cannot wait, the same on every list and in To answer now: Late once past the reply target (it is overdue
// now), else Urgent when they said this week. Never both.
export const leadFlag = (l: Lead, slaHours: number, now = Date.now()) => (pastReplyTarget(l, now, slaHours) ? "late" : isHotLead(l) ? "urgent" : undefined);

// Answer it now (red): a new lead with a flag (leadFlag: past the reply target or in a hurry), or a follow-up overdue on an open lead.
// To answer now and the Leads table's pinning (urgentFirst) both use it, so the panel and the table agree (#55).
export const answerNow = (l: Lead, now: number, today: string, slaHours: number) => leadFlag(l, slaHours, now) !== undefined || (followUpDue(l, today) && l.followUpOn! < today);

// The one rule for the leads waiting on you (#38). The Overview's headline, To do and Reply to leads button, Leads' To answer now and the
// salesperson's report all count from it, so they agree. Each lead once: a follow-up due ("follow", exactly followUpDue, so the report and
// the Follow-ups due filter match), else a new lead ("reply"). Now (red) by answerNow, else soon. Now first, then the longest waiting: a
// new lead since it came in, a follow-up since its day.
export type LeadTask = { lead: Lead; kind: "reply" | "follow"; urgency: "now" | "soon"; flag: ReturnType<typeof leadFlag> };
export function leadsToAnswer(leads: Lead[], now: number, today: string, slaHours: number): LeadTask[] {
  const since = (t: LeadTask) => (t.kind === "follow" ? Date.parse(`${t.lead.followUpOn}T00:00:00Z`) : t.lead.createdAt);
  return leads
    .flatMap((lead): LeadTask[] => {
      const follow = followUpDue(lead, today);
      if (!follow && lead.status !== "new") return [];
      return [{ lead, kind: follow ? "follow" : "reply", urgency: answerNow(lead, now, today, slaHours) ? "now" : "soon", flag: leadFlag(lead, slaHours, now) }];
    })
    .sort((a, b) => (a.urgency === b.urgency ? since(a) - since(b) : a.urgency === "now" ? -1 : 1));
}
// For me (#38) on the Overview's To do and on Leads' To answer now: what is given to this person, and the new leads nobody has taken
// yet, so a new website lead never drops out of sight. Follow-ups only their own, so the count matches their report.
export const forPerson = (tasks: LeadTask[], name: string) => tasks.filter((t) => t.lead.assignedTo === name || (!t.lead.assignedTo && t.kind === "reply"));
