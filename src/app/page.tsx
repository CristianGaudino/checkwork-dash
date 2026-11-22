import Link from "next/link";
import { ActButton } from "@/components/admin/ActButton";
import { ActionTile, ActionTiles, Columns, EmptyState, PageHeader, Panel, PanelLink, StatCard, StatGrid, Task, TaskList, adminButtonQuiet, choicePill, rowButton, rowButtonStrong, type TaskUrgency } from "@/components/admin/kit";
import { AlertIcon, CalendarIcon, CarIcon, CheckIcon, ExternalIcon, InboxIcon, PercentIcon, PhoneIcon, ReceiptIcon, ShareIcon, StarIcon, SyncIcon, TruckIcon } from "@/components/stock/icons";
import { carCosts } from "@/lib/admin/costs";
import { drivesStore, getSettings, leadsStore, ordersStore, reservationsStore, reviewsStore, salesStore, type Lead } from "@/lib/admin/collections";
import { marginOf } from "@/lib/admin/margins";
import { can, currentMember } from "@/lib/permissions";
import { dublinDay, fmtAgo, fmtDateTime, fmtDay, fmtEur, fmtNum, fmtTime, plural } from "@/lib/admin/format";
import { overview } from "@/lib/admin/overview";
import { SyncPanel } from "@/components/admin/SyncPanel";
import { adminCars } from "@/lib/admin/stock-admin";
import { syncStatus } from "@/lib/donedeal/sync";
import { stockSource } from "@/lib/stock-source";
import { listing } from "@/lib/stock-source";
import { dealerProfile } from "@/lib/tenancy/current";
import { forSale, isSold, onRequest } from "@/lib/stock/types";
import { isSalesLead } from "@/lib/admin/leads";
import { enabledModules } from "@/lib/modules";
import { readLead } from "@/lib/leads/lead-text";
import type { ModuleId } from "@/lib/modules-rules";
import { setDriveStatusAction } from "@/app/test-drives/actions";
import { DRIVE_STATUS_LABELS } from "@/lib/admin/drives";
import { CallButton, ReachButton } from "@/components/admin/LeadActions";
import { VisitSources } from "@/components/admin/VisitSources";
import { visitSources } from "@/lib/admin/visit-sources-load";

// The layout's "%s | Dealer dashboard" template reaches only the pages under it, not this one beside it.
export const metadata = { title: { absolute: "Overview | Dealer dashboard" } };

// How many of one kind of to-do are listed one by one; the rest are one row that opens the whole list.
const EACH = 3;
// How many rows To do shows before See all: about one phone screen.
const TOP = 8;
const MODULE_OF: Record<string, ModuleId> = { drives: "testDrives", "sold-drives": "testDrives", reviews: "reviews", deposits: "sales", orders: "newCars", costs: "margins" };
// The to-dos that stay one row each: what they count (`noun`), the button's word and the icon.
const GROUPED: Record<string, { noun: string; verb: string; icon: React.ReactNode }> = {
  reviews: { noun: "review", verb: "Reply", icon: <StarIcon /> },
  sync: { noun: "problem", verb: "Check", icon: <SyncIcon /> },
  "sold-drives": { noun: "booking", verb: "Open", icon: <CalendarIcon /> },
  deposits: { noun: "reservation", verb: "Open", icon: <ReceiptIcon /> },
  orders: { noun: "car", verb: "Open", icon: <TruckIcon /> },
  "taken-down": { noun: "car", verb: "Check", icon: <CarIcon /> },
  old: { noun: "car", verb: "Open", icon: <CarIcon /> },
  costs: { noun: "car", verb: "Add costs", icon: <PercentIcon /> },
};

// A lead in a line: the car, else the first line of the message.
const about = (l: Lead) => l.carTitle ?? (readLead(l).text.split("\n")[0] || undefined);
const OpenLeadButton = ({ id, name }: { id: string; name: string }) => (
  <Link href={`/leads/${id}`} aria-label={`Open ${name}'s lead`} className={rowButton}>
    Open
  </Link>
);
const ConfirmDrive = ({ id, name, status }: { id: string; name: string; status: string }) => (
  <ActButton act={setDriveStatusAction.bind(null, id, "confirmed", status)} undo={setDriveStatusAction.bind(null, id, status, "confirmed")} done={`${name}: ${DRIVE_STATUS_LABELS.confirmed}`} label={`Confirm ${name}'s test drive`} className={rowButtonStrong}>
    <CheckIcon className="shrink-0 size-4" />
    Confirm
  </ActButton>
);
const row = "relative flex min-h-16 items-center gap-3 px-1 py-3 transition-colors has-[>a:hover]:bg-surface";

// Where the day starts: the main jobs as big buttons, then what needs doing (each with the button that does it; new leads are in it with
// Call and Reply), today's test drives, and a few numbers last. No chart (docs/dashboard-polish.md #72): Analytics has them.
// `mine`: To do's Only mine, on by default for Sales (their report counts their own follow-ups); `todo=all`: every row, not the top few.
export default async function Page({ searchParams }: { searchParams: Promise<{ mine?: string; todo?: string }> }) {
  const sp = await searchParams;
  const [leads, drives, reviews, all, settings, source, sales, reservations, orders, mods, me] = await Promise.all([leadsStore.list(), drivesStore.list(), reviewsStore.list(), adminCars(), getSettings(), stockSource(), salesStore.list(), reservationsStore.list(), ordersStore.list(), enabledModules(), currentMember()]);
  const mine = Boolean(me.name) && (sp.mine ? sp.mine === "1" : me.role === "Sales");
  const [{ site: listingSite, url: listingUrl }, { rules }] = await Promise.all([listing(), dealerProfile()]);
  const synced = source === "donedeal";
  const sync = synced ? await syncStatus() : null;
  const cars = all.filter((c) => !isSold(c));
  // Only for staff with the margins permission: the costs are not read without it.
  const costs = (await can("margins")) ? new Map([...(await carCosts())].map(([id, c]) => [id, c.total])) : null;
  const o = overview({ leads: leads.filter(isSalesLead), drives, reviews, rules, listingSite, cars: all, costs: costs ? new Set(costs.keys()) : undefined, sales: new Set(sales.map((s) => s.id)), reservations, orders, syncProblem: Boolean(sync?.problem), slaHours: settings.leadSlaHours, mine: mine ? me.name : undefined });
  // What a module that is off would show goes with it (#173): its buttons, figures and to-dos.
  // Orders and deposits are our version only: with DoneDeal stock their pages are not there, so their to-dos go too.
  const attention = o.attention.filter((a) => (!MODULE_OF[a.key] || mods.has(MODULE_OF[a.key])) && !(synced && (a.key === "orders" || a.key === "deposits")));
  const margin = costs ? cars.filter((c) => costs.has(c.id) && !onRequest(c)).reduce((s, c) => s + marginOf(c.priceEur, costs.get(c.id)!).eur, 0) : 0;
  const drivesOn = mods.has("testDrives");
  const today = dublinDay();
  // One count for the headline and To do: everything listed in it.
  const toDo = attention.reduce((n, a) => n + a.count, 0);
  const thisWeek = o.weeks[o.weeks.length - 1];
  const visits = mods.has("analytics") ? await visitSources(30, leads) : null;

  // One kind of to-do as rows: the first few records each with their own buttons, then one row for the rest.
  const rest = (key: string, n: number, one: string, many: string, href: string, urgency: TaskUrgency) =>
    n > EACH ? [<Task key={`${key}-more`} title={`${n - EACH} more ${n - EACH === 1 ? one : many}`} urgency={urgency} action={<Link href={href} className={rowButton}>{key === "sales" ? "Record the next" : "See all"}</Link>} />] : []; // sales: Stock opens them one at a time
  const tasks = attention.flatMap((a) => {
    switch (a.key) {
      case "reply":
        return [
          ...o.reply.slice(0, EACH).map(({ lead: l, urgency, flag }) => (
            <Task key={`reply-${l.id}`} urgency={urgency} icon={<InboxIcon />} title={`Reply to ${l.name}`} detail={[about(l), `came in ${fmtAgo(l.createdAt)}${flag === "late" ? ", past your reply time" : ""}`].filter(Boolean).join(" · ")} action={<><ReachButton lead={l} /><OpenLeadButton id={l.id} name={l.name} /></>} />
          )),
          ...rest(a.key, o.reply.length, "new lead to answer", "new leads to answer", a.href, a.urgency),
        ];
      case "follow":
        return [
          ...o.due.slice(0, EACH).map(({ lead: l, urgency }) => {
            const late = l.followUpOn! < today; // the words by the date, as on Leads; the colour is the rule's (urgency), which is also red for a late new lead
            return (
              <Task key={`follow-${l.id}`} urgency={urgency} icon={<PhoneIcon />} title={`Follow up with ${l.name}`} detail={[late ? `Was due ${fmtDay(l.followUpOn!, "dayMonth")}` : "Due today", about(l)].filter(Boolean).join(" · ")} action={<><CallButton phone={l.phone} name={l.name} /><OpenLeadButton id={l.id} name={l.name} /></>} />
            );
          }),
          ...rest(a.key, o.due.length, "follow-up due", "follow-ups due", a.href, a.urgency),
        ];
      case "drives":
        return [
          ...o.toConfirm.slice(0, EACH).map((d) => (
            <Task key={`drive-${d.id}`} urgency="soon" icon={<CalendarIcon />} title={`${d.name} asked for a test drive`} detail={`${d.carTitle} · ${fmtDateTime(d.startsAt)}`} href={`/test-drives/${d.id}`} action={<ConfirmDrive id={d.id} name={d.name} status={d.status} />} />
          )),
          ...rest(a.key, o.toConfirm.length, "test drive to confirm", "test drives to confirm", a.href, "soon"),
        ];
      case "sales":
        return [
          ...o.unrecorded.slice(0, EACH).map((c) => (
            <Task key={`sale-${c.id}`} urgency="soon" icon={<ReceiptIcon />} title={`Record the sale of the ${c.year} ${c.make} ${c.model}`} detail={`Sold ${fmtDay(c.soldAt!, "dayMonth")}, no buyer or price yet`} action={<Link href={`/stock/${c.id}/sale`} aria-label={`Record sale: ${c.year} ${c.make} ${c.model}`} className={rowButtonStrong}>Record sale</Link>} />
          )),
          ...rest(a.key, o.unrecorded.length, "sold car with no sale recorded", "sold cars with no sale recorded", a.href, "soon"),
        ];
      default: {
        const g = GROUPED[a.key];
        return [<Task key={a.key} urgency={a.urgency} icon={g?.icon ?? <AlertIcon />} title={a.label} detail={a.key === "sync" ? undefined : plural(a.count, g?.noun ?? "item")} action={<Link href={a.href} aria-label={`${g?.verb ?? "Open"}: ${a.label}`} className={rowButtonStrong}>{g?.verb ?? "Open"}</Link>} />];
      }
    }
  });

  const shown = sp.todo === "all" ? tasks : tasks.slice(0, TOP);
  const link = (q: { mine?: boolean; todo?: string }) => `/?${new URLSearchParams({ mine: (q.mine ?? mine) ? "1" : "0", ...(q.todo && { todo: q.todo }) })}`;
  // A request shown in To do keeps its Confirm there; here it gets Call, so one drive never shows two Confirm buttons.
  const confirmInToDo = new Set(shown.map((t) => t.key));
  return (
    <>
      <PageHeader title="Overview" text={`${fmtDay(today)}. ${toDo ? `${plural(toDo, "thing")} need${toDo === 1 ? "s" : ""} you.` : "Nothing urgent."}`} />

      <ActionTiles>
        {/* Stock from DoneDeal is added there, never here. */}
        {synced ? (
          <ActionTile external primary href={listingUrl} icon={<ExternalIcon />} label={`Open ${listingSite}`} text="Add or change a car" />
        ) : (
          <ActionTile primary href="/stock/new" icon={<CarIcon />} label="Add a car" text="Photos, price and details" />
        )}
        {drivesOn && <ActionTile href="/test-drives/new" icon={<CalendarIcon />} label="Book a test drive" text="Pick a car and a time" />}
        {mods.has("social") && <ActionTile href="/marketing/new" icon={<ShareIcon />} label="New post" text="Facebook, Instagram or TikTok" />}
        {/* The same leads as To do and Leads' To answer now (leadsToAnswer). */}
        <ActionTile href={mine ? "/leads?mine=1" : "/leads"} icon={<InboxIcon />} label="Reply to leads" text={o.answer.length ? `${plural(o.answer.length, "lead")} to answer` : "All answered"} />
      </ActionTiles>

      <Columns
        aside={
          <>
            {sync && <SyncPanel status={sync} canForce={await can("settings")} />}
            {drivesOn && (
              <Panel title="Test drives today" count={o.todayDrives.length || undefined} action={<PanelLink href="/test-drives">All test drives</PanelLink>}>
                {o.todayDrives.length === 0 ? (
                  <EmptyState
                    compact
                    title="None today"
                    text={o.upcomingDrives[0] ? `Next: ${o.upcomingDrives[0].name}, ${fmtDateTime(o.upcomingDrives[0].startsAt)}.` : "Nothing booked this week."}
                    action={<Link href="/test-drives/new" className={adminButtonQuiet}>Book a test drive</Link>}
                  />
                ) : (
                  <ul className="-mx-1 flex flex-col divide-y divide-hairline">
                    {o.todayDrives.map((d) => (
                      <li key={d.id} className={row}>
                        <span className="w-12 shrink-0 font-display font-semibold tabular-nums">{fmtTime(d.startsAt)}</span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">{d.name}</span>
                          <span className="truncate text-meta text-text-2">{d.carTitle}</span>
                        </span>
                        <Link href={`/test-drives/${d.id}`} aria-label={`${d.name}, ${fmtTime(d.startsAt)}`} className="absolute inset-0" />
                        <span className="relative z-10 flex shrink-0 gap-2">{d.status === "requested" && !confirmInToDo.has(`drive-${d.id}`) && d.startsAt > o.now ? <ConfirmDrive id={d.id} name={d.name} status={d.status} /> : <CallButton phone={d.phone} name={d.name} />}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
            <Panel plain title="Your numbers">
              <StatGrid>
                <StatCard label="Leads this week" value={fmtNum(thisWeek)} hint={`${fmtNum(o.usualWeek)} in a usual week`} tone={thisWeek > o.usualWeek ? "good" : undefined} />
                <StatCard href="/stock" label="Cars for sale" value={fmtNum(cars.filter(forSale).length)} hint={o.oldStock ? `${o.oldStock} for sale ${rules.oldStockDays} days or more` : undefined} tone={o.oldStock ? "warn" : undefined} />
                {costs && <StatCard href="/margins" label="Expected margin" value={fmtEur(margin)} className={mods.has("reviews") ? "" : "xl:col-span-full"} />}
                {/* Of three tiles, the third takes the whole row in the two-column side panel, not alone beside a gap. */}
                {mods.has("reviews") && <StatCard className={costs ? "" : "xl:col-span-full"} href="/reviews" label="Review rating" value={o.reviewCount ? o.averageRating.toFixed(1) : "None"} hint={plural(o.reviewCount, "review")} />}
              </StatGrid>
            </Panel>
            {/* The busiest channels by name and mark: quicker to read at a glance than Search or Social. Analytics has the groups. */}
            {visits && (
              <Panel plain title="Where visits come from" text="Last 30 days, compared with the 30 before" action={<PanelLink href="/analytics">Analytics</PanelLink>}>
                <VisitSources now={visits.now} before={visits.before} top={4} />
              </Panel>
            )}
          </>
        }
      >
        <Panel
          title="To do"
          count={toDo || undefined}
          text={toDo ? "The most urgent first. Each button does the job." : undefined}
          action={
            me.name && (
              <Link href={link({ mine: !mine })} aria-current={mine ? "true" : undefined} className={choicePill(mine)}>
                {mine && <CheckIcon className="shrink-0 size-4" />}
                Only mine
              </Link>
            )
          }
        >
          {tasks.length === 0 ? <EmptyState compact icon={<CheckIcon />} title="All done" text="Nothing is waiting on you. New leads and bookings show here as they come in." /> : <TaskList label="To do">{shown}</TaskList>}
          {shown.length < tasks.length && (
            <Link href={link({ todo: "all" })} className="w-fit text-meta font-medium underline">
              See all {toDo}
            </Link>
          )}
        </Panel>
      </Columns>
    </>
  );
}
