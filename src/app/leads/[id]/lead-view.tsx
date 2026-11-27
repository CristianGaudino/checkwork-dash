import { enabledModules, hasModule } from "@/lib/modules";
import { wantsWhatsApp } from "@/lib/phone";
import { conditionShown } from "@/lib/modules-rules";
import { onPublicSite } from "@/lib/stock/types";
import { sourceText } from "@/lib/visit-rules";
import { NEW_TAB } from "@/components/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActButton, ChoiceAct } from "@/components/admin/ActButton";
import { stopWhatsAppAction } from "@/app/whatsapp/actions";
import { LeadStatusBadge } from "@/components/admin/badges";
import { AITextarea } from "@/components/admin/AIWriter";
import { IfModule } from "@/components/IfModule";
import { Badge, PageHeader, Panel, adminButton, adminButtonQuiet, rowButton } from "@/components/admin/kit";
import { LOST_REASONS, drivesStore, getSettings, leadStatusLabel, leadStatusSteps, leadsStore, statusBack } from "@/lib/admin/collections";
import { isOpenDrive } from "@/lib/admin/drives";
import { matchesAny, parsePersonQuery, type PersonQuery } from "@/lib/admin/person-match";

import { adminCars } from "@/lib/admin/stock-admin";
import { isSold } from "@/lib/stock/types";
import { CalendarIcon, CarIcon } from "@/components/stock/icons";
import type { LeadStatus } from "@/lib/admin/collections";
import { currentMember } from "@/lib/permissions";
import { addNoteAction, assignLeadAction, setFollowUpAction, setLostReasonAction, setStatusAction } from "../actions";
import { dublinDay, fmtDateTime, fmtDay, fmtTime } from "@/lib/admin/format";
import { followUpDue, isOpenLead, leadMain, possibleSpam, replyVia } from "@/lib/admin/leads";
import { siteCarUrl } from "@/lib/stock/format";
import { currentDealer } from "@/lib/tenancy/current";
import { Notes } from "@/components/admin/Notes";
import { ActSelect } from "@/components/admin/ActSelect";
import { PersonPicker } from "@/components/admin/PersonPicker";
import { FollowUp } from "./FollowUp";
import { TheirCar } from "./TheirCar";
import { HistoryPanel } from "@/components/admin/HistoryPanel";
import { checkHistoryAction } from "@/app/history-action";
import { saveTheirCarAction } from "./car-actions";
import { isCarLabel, theirCar } from "./car";
import { VisitPanel } from "@/components/admin/VisitPanel";
import { askedCar } from "@/lib/leads/journey";
import { ContactButtons } from "@/components/admin/ContactButtons";
import { firstReply, replyFrom } from "@/lib/leads/first-reply";
import { LeadKind, LeadTags, leadChips } from "@/components/admin/LeadKind";
import { LeadMenu, SpamButton } from "@/components/admin/LeadActions";
import { readLead } from "@/lib/leads/lead-text";

// One lead, worked from here. At the top: what they asked, and the next step: the ways to reach them, where it stands, who has it, when to
// get back to them and the reply draft. Below: their visit, their car and the notes. Shown at its own address under Leads, or, for a warranty request, under Aftersales (where it is
// listed), so the menu marks the right place. The pages around it choose which.
export async function LeadView({ id }: { id: string }) {
  const [lead, settings, drives, { name: dealer, profile: { siteUrl, rules } }, me] = await Promise.all([leadsStore.get(id), getSettings(), drivesStore.list(), currentDealer(), currentMember()]);
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
  const main = leadMain(lead.type, { drive: !drive && isOpenLead(lead) && modules.has("testDrives"), claim: modules.has("service") });
  const read = readLead(lead);
  const text = read.text;
  // A car to sell or trade in has its own panel with its facts, so the answers here leave them out.
  const hasCar = lead.reg !== undefined || lead.type === "sell" || lead.type === "trade-in";
  const facts = hasCar ? Object.fromEntries(Object.entries(read.facts).filter(([label]) => !isCarLabel(label))) : read.facts;
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
        back={lead.type === "warranty" && (await hasModule("service")) ? { href: "/aftersales?view=requests", label: "Warranty claims" } : { href: "/leads", label: "Leads" }}
      />
      {/* The top answers what a call starts with: what they asked, how to reach them, and what happens next. */}
      <Panel>
        <div className="grid grid-cols-1 gap-6 wide:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
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
            {text && <blockquote className="max-w-measure whitespace-pre-line [overflow-wrap:anywhere] rounded-control border-l-4 border-accent bg-row-alt px-4 py-3 text-body">{text}</blockquote>}
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
              {lead.email && (<><dt className="text-text-2">Email</dt><dd className="[overflow-wrap:anywhere]">{lead.email}</dd></>)}
              {lead.phone && (<><dt className="text-text-2">Phone</dt><dd className="tabular-nums">{lead.phone}</dd></>)}
            </dl>
          </section>
          <section aria-labelledby="next" className="flex min-w-0 flex-col gap-4 narrow:order-first narrow:border-b narrow:border-hairline narrow:pb-5 wide:border-l wide:border-hairline wide:pl-6">
            <h2 id="next" className="text-section font-semibold">Next step</h2>
            <ContactButtons phone={lead.phone} email={lead.email} main={main === "reply" ? replyVia(lead) : undefined} whatsapp={lead.whatsappOptIn !== false} reply={lead.status === "new" ? firstReply({ name: lead.name, from: replyFrom(me), dealer, title: lead.carTitle, car, siteUrl, modules }) : undefined} />
            {/* Booking a drive from the lead carries their car, name and number into the form. */}
            {lead.type !== "warranty" && isOpenLead(lead) && (
              <IfModule id="testDrives">
                {drive ? (
                  <Link href={`/test-drives/${drive.id}`} className={adminButtonQuiet}>
                    <CalendarIcon className="shrink-0 size-4" />
                    Test drive {fmtDay(dublinDay(drive.startsAt), "weekday")} {fmtDay(dublinDay(drive.startsAt), "day")} {fmtDay(dublinDay(drive.startsAt), "month")}, {fmtTime(drive.startsAt)}
                  </Link>
                ) : (
                  // Filled only on a test drive request: elsewhere the reply is the main job.
                  <Link href={`/test-drives/new?lead=${lead.id}`} className={main === "drive" ? adminButton : adminButtonQuiet}>
                    <CalendarIcon className="shrink-0 size-4" />
                    Book a test drive
                  </Link>
                )}
              </IfModule>
            )}
            {/* A warranty claim from the website: open it on the sale, with the buyer found from their details. */}
            {main === "claim" && <Link href={`/aftersales/new?lead=${lead.id}`} className={adminButton}>Open a claim</Link>}
            {/* Where it stands (#136): one stage drop-down, as HubSpot's record and its phone app set a deal stage, never a block of chips.
                Close and Spam are under More beside it (#55, #56), so neither is a slip away from a stage. New is in the list, so a stage moved
                by mistake can be put back after the Undo toast has gone. Spam and closed have none: Not spam and Reopen, below, are the way back. */}
            <div role="group" aria-label="Status" className="flex flex-col gap-1">
              <label htmlFor="lead-stage" className="flex items-center gap-2 text-meta font-semibold">
                Where it stands
                {(lead.status === "spam" || lead.status === "closed") && <LeadStatusBadge status={lead.status} type={lead.type} />}
              </label>
              {lead.status !== "spam" && lead.status !== "closed" && (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <ActSelect
                      id="lead-stage"
                      value={lead.status}
                      options={(["new", ...leadStatusSteps(lead.type)] as LeadStatus[]).map((st) => [st, leadStatusLabel(lead.type, st)] as const)}
                      action={setStatusAction.bind(null, lead.id)}
                      field="status"
                      extra={{ from: lead.status }}
                      back={undoStatus}
                      done={`${lead.name}: `}
                    />
                  </div>
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
              <div className="flex flex-col gap-1">
                <label htmlFor="lost-reason" className="text-meta font-semibold">
                  Why was it lost?
                </label>
                <ActSelect
                  id="lost-reason"
                  value={lead.lostReason ?? ""}
                  options={[...(lead.lostReason ? [] : [["", "Choose a reason"] as const]), ...LOST_REASONS.map((r) => [r, r] as const)]}
                  action={setLostReasonAction.bind(null, lead.id)}
                  field="reason"
                  back={lead.lostReason && { reason: lead.lostReason }}
                  done="Lost: "
                />
              </div>
            )}
            {/* Who has it, and the day to get back to them (only while the lead is open: won and lost need none). */}
            <div className="flex flex-col gap-1">
              <label htmlFor="lead-owner" className="text-meta font-semibold">
                Who has it
              </label>
              <PersonPicker id="lead-owner" team={settings.team.map((t) => t.name)} value={lead.assignedTo} me={me.name} action={assignLeadAction.bind(null, lead.id)} />
            </div>
            {isOpenLead(lead) && <FollowUp action={setFollowUpAction.bind(null, lead.id)} on={lead.followUpOn} today={today} due={followUpDue(lead, today)} back={followUpBack} />}
            {/* They ticked the WhatsApp box on the form: the site's messages reach them there until someone stops it. */}
            {lead.whatsappOptIn === false && (
              <IfModule id="whatsapp">
                <p className="text-meta text-text-2">WhatsApp updates: off</p>
              </IfModule>
            )}
            {lead.whatsappOptIn && !wantsWhatsApp(lead) && (
              <IfModule id="whatsapp">
                <p className="text-meta text-text-2">WhatsApp updates: off, the number is a landline</p>
              </IfModule>
            )}
            {wantsWhatsApp(lead) && (
              <IfModule id="whatsapp">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-meta text-text-2">WhatsApp updates: on</p>
                  <ActButton act={stopWhatsAppAction.bind(null, lead.id)} done="WhatsApp updates stopped" confirm={{ title: "Stop WhatsApp?", text: "Nothing more goes to them on WhatsApp. They get email instead, if they gave an address.", yes: "Stop WhatsApp" }} className={`${rowButton} -mx-3`}>
                    Stop WhatsApp
                  </ActButton>
                </div>
              </IfModule>
            )}
            {/* A reply to copy into email or WhatsApp: written from their message and the car, never from their phone or email. Only the
                button until it is used, so a phone is not handed a big empty box. */}
            <IfModule id="ai">
              <div className="flex flex-col gap-1">
                <h3 className="text-meta font-semibold">Draft a reply</h3>
                <AITextarea label="Reply draft" task="leadReply" rows={6} copy folded request={{ task: "leadReply", leadId: lead.id }} />
              </div>
            </IfModule>
          </section>
        </div>
      </Panel>

      {/* Below: what they did on the website and their car on the left, the notes on the right. With neither, the notes alone. */}
      <div className={`grid grid-cols-1 gap-6 ${lead.journey || hasCar ? "wide:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : ""}`}>
        {(lead.journey || hasCar) && (
          <div className="flex min-w-0 flex-col gap-6">
            {/* What they did on the website before they got in touch, when they sent it: first, as it is read before the call. */}
            {lead.journey && <VisitPanel lead={{ ...lead, journey: lead.journey }} stock={stock} />}
            {/* Selling or trading in: the car read first, with Edit and the plate's Look up, so the dealer knows what it is before calling back. */}
            {hasCar && <TheirCar car={theirCar({ reg: lead.reg, details: read.facts })} selling={lead.type === "sell" || lead.type === "trade-in"} action={saveTheirCarAction.bind(null, lead.id)} />}
            {/* Their car's history check (#170), once it has a plate: finance owed or a write-off changes the offer. */}
            {(lead.type === "sell" || lead.type === "trade-in") && lead.reg && (await hasModule("history")) && <HistoryPanel reg={lead.reg} history={lead.history} act={checkHistoryAction.bind(null, "lead", lead.id)} />}
          </div>
        )}
        <div className="min-w-0">
          <Notes notes={lead.notes} action={addNoteAction.bind(null, lead.id)} me={me.name} />
        </div>
      </div>
    </>
  );
}
