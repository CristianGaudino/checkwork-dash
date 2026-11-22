import { ChoiceAct } from "@/components/admin/ActButton";
import { rowButton, rowButtonStrong } from "@/components/admin/kit";
import { RowMenu } from "@/components/admin/RowMenu";
import { CalendarIcon, CheckIcon, MailIcon, PhoneIcon, WhatsAppIcon } from "@/components/stock/icons";
import { NEW_TAB } from "@/components/ui";
import { CLOSE_REASONS, canClose, leadStatusLabel, type Lead, type LeadStatus } from "@/lib/admin/collections";
import { telHref, waHref } from "@/lib/phone";
import { isOpenLead, replyVia } from "@/lib/admin/leads";
import { setStatusAction } from "@/app/leads/actions";

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

// Close an enquiry that needs no more work (spam, a duplicate) without calling it a lost sale (#55): a quiet choice under More, never a
// step, with Undo putting back its status and follow-up day. Only while it is open, and never on a warranty request.
export function CloseLeadMenu({ lead }: { lead: Pick<Lead, "id" | "name" | "status" | "type" | "followUpOn"> }) {
  if (!isOpenLead(lead) || !canClose(lead)) return null;
  return (
    <RowMenu label={`More for ${lead.name}`}>
      {CLOSE_REASONS.map((r) => (
        <ChoiceAct key={r} action={setStatusAction.bind(null, lead.id)} set={{ status: "closed", reason: r, from: lead.status }} back={{ status: lead.status, from: "closed", ...(lead.followUpOn && { on: lead.followUpOn }) }} active={false} done={`${lead.name}: Closed, ${r.toLowerCase()}`} label={`Close: ${r}, ${lead.name}`} className={rowButton}>
          Close: {r}
        </ChoiceAct>
      ))}
    </RowMenu>
  );
}
