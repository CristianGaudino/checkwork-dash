import { enabledModules, hasModule } from "@/lib/modules";
import { conditionShown } from "@/lib/modules-rules";
import { onPublicSite } from "@/lib/stock/types";
import { sourceText } from "@/lib/visit-rules";
import { NEW_TAB } from "@/components/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActButton, ChoiceAct } from "@/components/admin/ActButton";
import { stopWhatsAppAction } from "@/app/whatsapp/actions";
import { LeadStatusBadge } from "@/components/admin/badges";
import { RegLookup } from "@/components/leads/RegLookup";
import { AITextarea } from "@/components/admin/AIWriter";
import { IfModule } from "@/components/IfModule";
import { lookupRegStaffAction } from "@/app/reg-action";
import { Avatar, Badge, Field, PageHeader, Panel, adminButton, adminButtonQuiet, adminInput, rowButton, rowDanger } from "@/components/admin/kit";
import { LOST_REASONS, drivesStore, getSettings, leadStatusLabel, leadStatusSteps, leadsStore, statusBack } from "@/lib/admin/collections";
import { isOpenDrive } from "@/lib/admin/drives";
import { matchesAny, parsePersonQuery, type PersonQuery } from "@/lib/admin/person-match";

import { adminCars } from "@/lib/admin/stock-admin";
import { isSold } from "@/lib/stock/types";
import { CalendarIcon, CarIcon, CheckIcon, CloseIcon, PhoneIcon } from "@/components/stock/icons";
import type { LeadStatus } from "@/lib/admin/collections";
import { addNoteAction, assignLeadAction, setFollowUpAction, setLostReasonAction, setStatusAction } from "../actions";
import { dublinDay, fmtDate, fmtDateTime, fmtDay, fmtTime } from "@/lib/admin/format";
import { followUpDue, isOpenLead, leadMain, possibleSpam, replyVia } from "@/lib/admin/leads";
import { siteCarUrl } from "@/lib/stock/format";
import { dealerProfile } from "@/lib/tenancy/current";
import { stockSource } from "@/lib/stock-source";
import { NotesPanel } from "@/components/admin/NotesPanel";
import { VisitPanel } from "@/components/admin/VisitPanel";
import { askedCar } from "@/lib/leads/journey";
import { ContactButtons } from "@/components/admin/ContactButtons";
import { LeadKind, LeadTags, leadChips } from "@/components/admin/LeadKind";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { LeadMenu, SpamButton } from "@/components/admin/LeadActions";
import { readLead } from "@/lib/leads/lead-text";

// The quick actions on a lead: the steps it moves through (leadStatusSteps), each with its icon.
const STATUS_ICONS: Record<LeadStatus, typeof PhoneIcon> = { new: PhoneIcon, contacted: PhoneIcon, appointment: CalendarIcon, won: CheckIcon, lost: CloseIcon, closed: CloseIcon, spam: CloseIcon };

// One lead, worked from here. At the top: what they asked, the ways to reach them and the next step. Below: when to get back to them, who
// has it, the reply draft and the notes. Shown at its own address under Leads, or, for a warranty request, under Aftersales (where it is
// listed), so the menu marks the right place. The pages around it choose which.
export async function LeadView({ id }: { id: string }) {
  const [lead, settings, drives, { siteUrl, rules }] = await Promise.all([leadsStore.get(id), getSettings(), drivesStore.list(), dealerProfile()]);
  if (!lead) notFound();
  // The car the lead asked about has sold since (here, or on DoneDeal): the salesperson offers something like it.
  const stock = lead.carSlug || lead.journey ? await adminCars() : [];
  const car = askedCar(stock, lead.carSlug); // by its id: an edit to the make, model or year gives the car a new slug
  const carSold = car !== undefined && isSold(car);
  const today = dublinDay();
  // Their next test drive, today or later, found by their email or phone: shown in place of Book a test drive.
  const qs = [lead.email, lead.phone].map((v) => (v ? parsePersonQuery(v) : null)).filter((q): q is PersonQuery => q !== null);
  const drive = qs.length ? drives.filter((d) => isOpenDrive(d) && dublinDay(d.startsAt) >= today && matchesAny(d, qs)).sort((a, b) => a.startsAt - b.startsAt)[0] : undefined;
  // What puts the follow-up back as it was, for Undo: none, or its day (a day that has passed cannot be set again).
  // And the status as it was, with the follow-up day and the lost or closed reason a move clears.
  const reason = lead.lostReason ?? lead.closedReason;
  // `before`: where Reopen went, so Undo of a step on a closed lead keeps it.
  const undoStatus = { status: lead.status, ...(lead.followUpOn && { on: lead.followUpOn }), ...(reason && { reason }), ...(lead.statusBefore && { before: lead.statusBefore }) };
  // The one filled button: the request's own job when it can be done here, else answering them the way they got in touch.
  const modules = await enabledModules();
  const main = leadMain(lead.type, { drive: !drive && isOpenLead(lead) && modules.has("testDrives"), order: modules.has("newCars") && (await stockSource()) !== "donedeal", claim: modules.has("service") });
  const { text, facts } = readLead(lead);
  const followUpBack: Record<string, string> | undefined = !lead.followUpOn ? { clear: "1" } : lead.followUpOn >= today ? { on: lead.followUpOn } : undefined;

  return (
    <>
      <PageHeader
        title={lead.name}
        text={
          <span className="flex flex-wrap items-center gap-x-2">
            <LeadKind type={lead.type} topic={lead.topic} />
            <span>·</span>
            <span>
              {sourceText(lead)} · {fmtDateTime(lead.createdAt)}
            </span>
          </span>
        }
        // A warranty request is aftersales work: it is listed there, so the way back is there.
        back={lead.type === "warranty" && (await hasModule("service")) ? { href: "/aftersales?view=requests", label: "Aftersales" } : { href: "/leads", label: "Leads" }}
      />
      {/* The top answers what a call starts with: what they asked, how to reach them, and what happens next. */}
      <Panel>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <section aria-labelledby="asked" className="flex min-w-0 flex-col gap-3">
            <h2 id="asked" className="text-section font-semibold">What they asked</h2>
            {lead.carTitle && (
              <p className="flex items-center gap-2 text-heading font-semibold">
              <CarIcon className="size-5 shrink-0 text-accent-text" />
                {/* A link only while the car has a page on the site: not hidden, a draft or sold long ago, and its kind on the plan. */}
                {lead.carSlug && car && siteUrl && onPublicSite(car, rules.soldVisibleDays) && conditionShown(await enabledModules(), car.condition) ? (
                  <a href={siteCarUrl(siteUrl, car.slug)} {...NEW_TAB} className="underline-offset-4 hover:underline">
                    {lead.carTitle}
                  </a>
                ) : (
                  lead.carTitle
                )}
              </p>
            )}
            {/* A guided contact form's taps say what they want, often with no words typed: the same tags as the list. */}
            <LeadTags tags={leadChips(lead.type, lead.topic, lead.answers)} />
            {/* Their own words, set apart as a quote so they read as the customer's, not the dashboard's. */}
            {text && <blockquote className="max-w-measure whitespace-pre-line rounded-control border-l-4 border-accent bg-row-alt px-4 py-3 text-body">{text}</blockquote>}
            {/* The form's other answers, one to a line (#59): never run together into the message. */}
            {Object.keys(facts).length > 0 && (
              <dl aria-label="Their answers" className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-body">
                {Object.entries(facts).map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-text-2">{label}</dt>
                    <dd className="[overflow-wrap:anywhere]">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {carSold && (
              <p className="rounded-control bg-warn-soft px-4 py-3 text-body text-warn">
                This car has sold. Offer them something similar
                {siteUrl ? (
                  <>
                    :{" "}
                    <a href={`${siteUrl}/makes/${car.makeSlug}`} {...NEW_TAB} className="font-medium underline">
                      other {car.make} cars
                    </a>
                  </>
                ) : null}
                .
              </p>
            )}
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-meta">
              {lead.email && (<><dt className="text-text-2">Email</dt><dd className="break-all">{lead.email}</dd></>)}
              {lead.phone && (<><dt className="text-text-2">Phone</dt><dd className="tabular-nums">{lead.phone}</dd></>)}
            </dl>
          </section>
          <section aria-labelledby="next" className="flex min-w-0 flex-col gap-4 max-lg:order-first max-lg:border-b max-lg:border-hairline max-lg:pb-5 lg:border-l lg:border-hairline lg:pl-6">
            <h2 id="next" className="text-section font-semibold">Next step</h2>
            <ContactButtons phone={lead.phone} email={lead.email} main={main === "reply" ? replyVia(lead) : undefined} />
            {/* Booking a drive from the lead carries their car, name and number into the form. */}
            {lead.type !== "warranty" && isOpenLead(lead) && (
              <IfModule id="testDrives">
                {drive ? (
                  <Link href={`/test-drives/${drive.id}`} className={adminButtonQuiet}>
                    <CalendarIcon className="shrink-0 size-4" />
                    Test drive {fmtDay(dublinDay(drive.startsAt), "weekday")} {fmtDay(dublinDay(drive.startsAt), "day")} {fmtDay(dublinDay(drive.startsAt), "month")}, {fmtTime(drive.startsAt)}
                  </Link>
                ) : (
                  // Filled only on a test drive request: elsewhere the reply (or the order) is the main job.
                  <Link href={`/test-drives/new?lead=${lead.id}`} className={main === "drive" ? adminButton : adminButtonQuiet}>
                    <CalendarIcon className="shrink-0 size-4" />
                    Book a test drive
                  </Link>
                )}
              </IfModule>
            )}
            {/* A factory order request from the website: place it, copying from what they asked for. Orders are for stock kept here. */}
            {main === "order" && <Link href={`/orders/new?lead=${lead.id}`} className={adminButton}>Place the order</Link>}
            {/* A warranty claim from the website: open it on the sale, with the buyer found from their details. */}
            {main === "claim" && <Link href={`/aftersales/new?lead=${lead.id}`} className={adminButton}>Open a claim</Link>}
            <div role="group" aria-label="Status" className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-meta text-text-2">
                Where it stands <LeadStatusBadge status={lead.status} type={lead.type} />
              </p>
              {/* A spam lead has no steps: Not spam, below, is the way back. */}
              {lead.status !== "spam" && (
                <div className="flex flex-wrap gap-2">
                  {leadStatusSteps(lead.type).map((status) => {
                    const Icon = STATUS_ICONS[status];
                    return (
                      <ChoiceAct key={status} action={setStatusAction.bind(null, lead.id)} set={{ status }} back={undoStatus} active={lead.status === status} done={`${lead.name}: ${leadStatusLabel(lead.type, status)}`}>
                        <Icon className="size-4" />
                        Mark {leadStatusLabel(lead.type, status).toLowerCase()}
                      </ChoiceAct>
                    );
                  })}
                  {/* Close and Spam: quiet, under More, so neither is a slip away from the steps (#55, #56). */}
                  <LeadMenu lead={lead} spam={!possibleSpam(lead)} />
                </div>
              )}
            </div>
            {/* A closed lead says why, and Reopen puts back the status it had. */}
            {lead.status === "closed" && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-meta text-text-2">Closed{lead.closedReason && `: ${lead.closedReason}`}. Not counted as a lost sale.</p>
                <ChoiceAct action={setStatusAction.bind(null, lead.id)} set={{ status: statusBack(lead), from: "closed" }} back={undoStatus} active={false} done={`${lead.name}: Reopened`} className={rowButton}>
                  Reopen
                </ChoiceAct>
              </div>
            )}
            {/* Spam is out of every list and figure until someone says it is not (#56). */}
            {lead.status === "spam" && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-meta text-text-2">Marked as spam. Left out of every list and report.</p>
                <SpamButton lead={lead} to="no" />
              </div>
            )}
            {possibleSpam(lead) && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-meta text-text-2">
                  <Badge tone="warn">Possible spam</Badge> Is this a real enquiry?
                </p>
                <span className="flex flex-wrap gap-2">
                  <SpamButton lead={lead} to="yes" />
                  <SpamButton lead={lead} to="no" />
                </span>
              </div>
            )}
            {/* Why it was lost, for the reports. Only on a lost lead, and not on a closed warranty request, which was no sale. */}
            {lead.status === "lost" && lead.type !== "warranty" && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-meta font-medium">Why was it lost?</legend>
                <div className="flex flex-wrap gap-2">
                  {LOST_REASONS.map((r) => (
                    <ChoiceAct key={r} action={setLostReasonAction.bind(null, lead.id)} set={{ reason: r }} back={lead.lostReason && { reason: lead.lostReason }} active={lead.lostReason === r} done={`Lost: ${r}`}>
                      {r}
                    </ChoiceAct>
                  ))}
                </div>
              </fieldset>
            )}
            {/* They ticked the WhatsApp box on the form: the site's messages reach them there until someone stops it. */}
            {lead.whatsappOptIn && (
              <IfModule id="whatsapp">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-meta text-text-2">WhatsApp updates: on</p>
                  <ActButton act={stopWhatsAppAction.bind(null, lead.id)} done="WhatsApp updates stopped" confirm={{ title: "Stop WhatsApp?", text: "Nothing more goes to them on WhatsApp. They get email instead, if they gave an address.", yes: "Stop WhatsApp" }} className={rowButton}>
                    Stop WhatsApp
                  </ActButton>
                </div>
              </IfModule>
            )}
          </section>
        </div>
      </Panel>

      {/* Below: the reply and the history on the left; when to get back to them and who has it on the right (first on a phone). */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* What they did on the website before they got in touch, when they sent it: first, as it is read before the call. Nothing without it. */}
          {lead.journey && <VisitPanel lead={{ ...lead, journey: lead.journey }} stock={stock} />}
          {/* A reply to copy into email or WhatsApp: written from their message and the car, never from their phone or email. Only the
              button until it is used, so a phone is not handed a big empty box. */}
          <IfModule id="ai">
            <Panel title="Draft a reply">
              <AITextarea label="Reply draft" task="leadReply" rows={6} copy folded request={{ task: "leadReply", leadId: lead.id }} />
            </Panel>
          </IfModule>
          {/* Selling or trading in: the car's plate, and a lookup so the dealer sees what it is before calling back. */}
          {lead.reg && (
            <Panel title="Their car">
              <p className="text-body">
                Registration <span className="font-medium tabular-nums">{lead.reg}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <RegLookup reg={lead.reg} lookup={lookupRegStaffAction} place="dashboard" className="h-11 text-meta sm:w-44" />
              </div>
            </Panel>
          )}
          <NotesPanel notes={lead.notes} action={addNoteAction.bind(null, lead.id)} />
        </div>

        <div className="flex min-w-0 flex-col gap-6 max-lg:order-first">
          {/* The day to get back to them. Only while the lead is open: won and lost need none. */}
          {isOpenLead(lead) && (
            <Panel title="Follow up" action={lead.followUpOn && <Badge tone={followUpDue(lead, today) ? "warn" : "neutral"}>{lead.followUpOn === today ? "Today" : fmtDate(`${lead.followUpOn}T12:00:00Z`)}</Badge>}>
              <div className="flex flex-wrap gap-2">
                {([[1, "Tomorrow"], [3, "In 3 days"], [7, "Next week"]] as const).map(([n, label]) => (
                  <ChoiceAct key={n} action={setFollowUpAction.bind(null, lead.id)} set={{ in: String(n) }} back={followUpBack} active={false} done={`Follow up ${label.toLowerCase()}`}>
                    {label}
                  </ChoiceAct>
                ))}
              </div>
              <form action={setFollowUpAction.bind(null, lead.id)} className="flex flex-wrap items-end gap-2">
                <Field label="Or a day" className="w-44">
                  <input type="date" name="on" min={today} defaultValue={lead.followUpOn ?? ""} required className={adminInput} />
                </Field>
                <SubmitButton className={adminButtonQuiet}>
                  Set
                </SubmitButton>
              </form>
              {lead.followUpOn && (
                <ChoiceAct action={setFollowUpAction.bind(null, lead.id)} set={{ clear: "1" }} back={followUpBack} active={false} done="Follow-up cleared" className={`${rowDanger} w-fit`}>
                  Clear the follow-up
                </ChoiceAct>
              )}
            </Panel>
          )}
          <Panel title="Who has it" quiet>
            <div className="flex flex-wrap gap-2">
              <ChoiceAct action={assignLeadAction.bind(null, lead.id)} set={{ assignedTo: "" }} back={{ assignedTo: lead.assignedTo ?? "" }} active={!lead.assignedTo} done="Given to nobody">
                Nobody
              </ChoiceAct>
              {settings.team.map((t) => (
                <ChoiceAct key={t.id} action={assignLeadAction.bind(null, lead.id)} set={{ assignedTo: t.name }} back={{ assignedTo: lead.assignedTo ?? "" }} active={lead.assignedTo === t.name} done={`Given to ${t.name}`}>
                  <Avatar name={t.name} className="-ml-2 size-7 bg-card!" />
                  {t.name}
                </ChoiceAct>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
