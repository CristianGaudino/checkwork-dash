import { ChoiceAct } from "@/components/admin/ActButton";
import { rowButton, rowButtonStrong } from "@/components/admin/kit";
import { RowMenu } from "@/components/admin/RowMenu";
import { CalendarIcon, CheckIcon, MailIcon, PhoneIcon, WhatsAppIcon } from "@/components/stock/icons";
import { NEW_TAB } from "@/components/ui";
import { CLOSE_REASONS, canClose, leadStatusLabel, statusBack, type Lead, type LeadStatus } from "@/lib/admin/collections";
import { telHref, waHref } from "@/lib/phone";
import { isOpenLead, replyVia } from "@/lib/admin/leads";
import { setSpamAction, setStatusAction } from "@/app/leads/actions";

// A call to them, the row's strong action (tonal), named for a screen reader ("Call Mary Byrne"). Nothing when there is no number to call.
// `quiet`: another action is the row's strong one (Confirm on a test drive request), so Call is tertiary.
export function CallButton({ phone, name, quiet = false }: { phone: string; name: string; quiet?: boolean }) {
  const tel = phone ? telHref(phone) : undefined;
  return tel ? (
    <a href={tel} aria-label={`Call ${name}`} className={quiet ? rowButton : rowButtonStrong}>
      <PhoneIcon className="shrink-0 size-4" />
      Call
    </a>
  ) : null;
}

// The way to answer them (replyVia: how they got in touch), one button.
export function ReachButton({ lead }: { lead: Pick<Lead, "name" | "phone" | "email" | "answers" | "source"> }) {
  const via = replyVia(lead);
  if (via === "whatsapp")
    return (
      <a href={waHref(lead.phone)!} {...NEW_TAB} aria-label={`WhatsApp ${lead.name} (opens in a new tab)`} className={rowButtonStrong}>
        <WhatsAppIcon className="shrink-0 size-4 text-whatsapp" />
        WhatsApp
      </a>
    );
  if (via === "email")
    return (
      <a href={`mailto:${lead.email}`} aria-label={`Email ${lead.name}`} className={rowButtonStrong}>
        <MailIcon className="shrink-0 size-4" />
        Email
      </a>
    );
  return <CallButton phone={lead.phone} name={lead.name} />;
}

// The step after this one, as one press with Undo: a new lead is answered, an answered one gets an appointment, an appointment is won.
const NEXT: Partial<Record<LeadStatus, LeadStatus>> = { new: "contacted", contacted: "appointment", appointment: "won" };
const ICON = { contacted: PhoneIcon, appointment: CalendarIcon, won: CheckIcon } as const;
export function NextStatusButton({ lead }: { lead: Pick<Lead, "id" | "name" | "status" | "type" | "followUpOn"> }) {
  const to = NEXT[lead.status];
  if (!to || lead.type === "warranty") return null;
  const Icon = ICON[to as keyof typeof ICON];
  const label = leadStatusLabel(lead.type, to);
  return (
    <ChoiceAct action={setStatusAction.bind(null, lead.id)} set={{ status: to, from: lead.status }} back={{ status: lead.status, from: to, ...(lead.followUpOn && { on: lead.followUpOn }) }} active={false} done={`${lead.name}: ${label}`} label={`Mark ${label.toLowerCase()}: ${lead.name}`} className={rowButton}>
      <Icon className="size-4" />
      Mark {label.toLowerCase()}
    </ChoiceAct>
  );
}

// A lead's less used actions under More (#55, #56): Close, for an enquiry no longer active, with a reason, and Spam. Quiet, never a step,
// each with Undo (Close puts back the status and follow-up day). Only while it is open; never Close on a warranty request. `spam`: false
// where Spam is already a button of its own (a possible spam lead).
export function LeadMenu({ lead, spam = true }: { lead: Pick<Lead, "id" | "name" | "status" | "type" | "followUpOn" | "maybeSpam">; spam?: boolean }) {
  if (!isOpenLead(lead) || (!spam && !canClose(lead))) return null;
  return (
    <RowMenu label={`More for ${lead.name}`}>
      {canClose(lead) &&
        CLOSE_REASONS.map((r) => (
          <ChoiceAct key={r} action={setStatusAction.bind(null, lead.id)} set={{ status: "closed", reason: r, from: lead.status }} back={{ status: lead.status, from: "closed", ...(lead.followUpOn && { on: lead.followUpOn }) }} active={false} done={`${lead.name}: Closed, ${r.toLowerCase()}`} label={`Close: ${r}, ${lead.name}`} className={rowButton}>
            Close: {r}
          </ChoiceAct>
        ))}
      {spam && <SpamButton lead={lead} to="yes" />}
    </RowMenu>
  );
}

// Spam and Not spam (#56), one press each with Undo. "yes" marks it spam; "no" puts a spam lead back or clears Possible spam.
export function SpamButton({ lead, to }: { lead: Pick<Lead, "id" | "name" | "status" | "maybeSpam"> & Partial<Pick<Lead, "statusBefore">>; to: "yes" | "no" }) {
  const word = to === "yes" ? "Spam" : "Not spam";
  // Undo: back to Possible spam or to what it was; `from` is the status this press leaves it in.
  const back = to === "yes" ? { spam: lead.maybeSpam ? "maybe" : "no", from: "spam" } : lead.status === "spam" ? { spam: "yes", from: statusBack(lead) } : { spam: "maybe", from: lead.status };
  return (
    <ChoiceAct action={setSpamAction.bind(null, lead.id)} set={{ spam: to, from: lead.status }} back={back} active={false} done={`${lead.name}: ${word}`} label={`${word}: ${lead.name}`} className={rowButton}>
      {word}
    </ChoiceAct>
  );
}
