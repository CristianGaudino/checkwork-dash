import type { Lead } from "./collections";
import { HOUR } from "@/lib/time";
import { isUrgent } from "@/lib/leads/contact-topics";

// A follow-up is due on its day and after, while the lead is still open. Won and lost leads have none. Type imports only, so the overview
// and its tests can use it without the record store.
export const isOpenLead = (l: Pick<Lead, "status">) => l.status !== "won" && l.status !== "lost";
// A new lead nobody has answered within the dealer's reply target (settings.leadSlaHours).
export const pastReplyTarget = (l: Pick<Lead, "status" | "createdAt">, now: number, slaHours: number) => l.status === "new" && now - l.createdAt > slaHours * HOUR;
export const followUpDue = (l: Pick<Lead, "status" | "followUpOn">, today: string) => Boolean(l.followUpOn && isOpenLead(l) && l.followUpOn <= today);
// New leads that need an answer first: "this week" ("can't be driven" is a car bought here, filed in Aftersales).
export const isHotLead = (l: Lead) => l.status === "new" && Boolean(l.topic) && isUrgent(l.answers ?? {});

// The one rule for the leads waiting on you (#38). The Overview's headline, To do and Reply to leads button, Leads' To answer now and the
// salesperson's report all count from it, so they agree. Each lead once: a follow-up due ("follow", exactly followUpDue, so the report and
// the Follow-ups due filter match), else a new lead ("reply"). Now (red): a follow-up overdue, or a new lead past the reply target or in a
// hurry; else soon. Now first, then the longest waiting: a new lead since it came in, a follow-up since its day.
export type LeadTask = { lead: Lead; kind: "reply" | "follow"; urgency: "now" | "soon"; late: boolean };
export function leadsToAnswer(leads: Lead[], now: number, today: string, slaHours: number): LeadTask[] {
  const since = (t: LeadTask) => (t.kind === "follow" ? Date.parse(`${t.lead.followUpOn}T00:00:00Z`) : t.lead.createdAt);
  return leads
    .flatMap((lead): LeadTask[] => {
      const follow = followUpDue(lead, today);
      if (!follow && lead.status !== "new") return [];
      const late = pastReplyTarget(lead, now, slaHours);
      const urgent = late || isHotLead(lead) || (follow && lead.followUpOn! < today);
      return [{ lead, kind: follow ? "follow" : "reply", urgency: urgent ? "now" : "soon", late }];
    })
    .sort((a, b) => (a.urgency === b.urgency ? since(a) - since(b) : a.urgency === "now" ? -1 : 1));
}
