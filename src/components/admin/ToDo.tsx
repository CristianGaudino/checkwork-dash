import Link from "next/link";
import { Task, WhoseSwitch, rowButton, rowButtonStrong, type TaskUrgency } from "@/components/admin/kit";
import { AlertIcon, CalendarIcon, CarIcon, InboxIcon, PercentIcon, PhoneIcon, ReceiptIcon, StarIcon, SyncIcon, WrenchIcon } from "@/components/stock/icons";
import { CallButton, ReachButton } from "@/components/admin/LeadActions";
import { firstReplies } from "@/lib/leads/first-replies";
import { RowMenu } from "@/components/admin/RowMenu";
import { DriveSteps } from "@/components/admin/DriveSteps";
import { carCosts } from "@/lib/admin/costs";
import { claimsStore, drivesStore, getSettings, leadsStore, reservationsStore, reviewsStore, salesStore, type Lead } from "@/lib/admin/collections";
import { can, currentMember } from "@/lib/permissions";
import { dublinDay, fmtAgo, fmtDateTime, fmtDay, plural } from "@/lib/admin/format";
import { overview } from "@/lib/admin/overview";
import { adminCars } from "@/lib/admin/stock-admin";
import { syncStatus } from "@/lib/donedeal/sync";
import { listing, stockSource } from "@/lib/stock-source";
import { dealerProfile } from "@/lib/tenancy/current";
import { isSalesLead, openWarrantyRequests } from "@/lib/admin/leads";
import { enabledModules } from "@/lib/modules";
import { readLead } from "@/lib/leads/lead-text";
import type { ModuleId } from "@/lib/modules-rules";

// To do, for the Overview (its top rows) and the To do page (every row): the records loaded once, and each to-do as a row with the button
// that does it.

// How many of one kind of to-do are listed one by one; the rest are one row that opens the whole list.
const EACH = 3;
const MODULE_OF: Record<string, ModuleId> = { drives: "testDrives", "sold-drives": "testDrives", reviews: "reviews", deposits: "sales", costs: "margins", warranty: "service" };
// The to-dos that stay one row each: what they count (`noun`), the button's word and the icon.
const GROUPED: Record<string, { noun: string; verb: string; icon: React.ReactNode }> = {
  warranty: { noun: "request", verb: "Open", icon: <WrenchIcon /> },
  reviews: { noun: "review", verb: "Reply", icon: <StarIcon /> },
  sync: { noun: "problem", verb: "Check", icon: <SyncIcon /> },
  "sold-drives": { noun: "booking", verb: "Open", icon: <CalendarIcon /> },
  deposits: { noun: "reservation", verb: "Open", icon: <ReceiptIcon /> },
  "taken-down": { noun: "car", verb: "Check", icon: <CarIcon /> },
  old: { noun: "car", verb: "Open", icon: <CarIcon /> },
  costs: { noun: "car", verb: "Add costs", icon: <PercentIcon /> },
};

// A lead in a line: the car, else the first line of the message.
const about = (l: Lead) => l.carTitle ?? (readLead(l).text.split("\n")[0] || undefined);
// A lead's row (#95): the way to reach them, and Open in the row's menu.
const LeadMenu = ({ id, name }: { id: string; name: string }) => (
  <RowMenu label={`More for ${name}`}>
    <Link href={`/leads/${id}`} aria-label={`Open ${name}'s lead`} className={rowButton}>
      Open
    </Link>
  </RowMenu>
);

// Everyone | For me, the same words as on Leads. For me: given to me, plus new leads nobody has taken (forPerson).
export const WhoseToggle = ({ path, mine }: { path: string; mine: boolean }) => (
  <WhoseSwitch label="Whose to-dos" everyone={`${path}?mine=0`} forMe={`${path}?mine=1`} mine={mine} />
);

// `mine`: the page's ?mine; For me is on by default for Sales (their report counts their own follow-ups).
export async function loadToDo(mineParam: string | undefined) {
  const [leads, drives, reviews, all, settings, source, sales, reservations, claims, mods, me, { site: listingSite }, { rules }] = await Promise.all([leadsStore.list(), drivesStore.list(), reviewsStore.list(), adminCars(), getSettings(), stockSource(), salesStore.list(), reservationsStore.list(), claimsStore.list(), enabledModules(), currentMember(), listing(), dealerProfile()]);
  const reply = await firstReplies(all);
  const mine = Boolean(me.name) && (mineParam ? mineParam === "1" : me.role === "Sales");
  const synced = source === "donedeal";
  const sync = synced ? await syncStatus() : null;
  // Only for staff with the margins permission: the costs are not read without it.
  const costs = (await can("margins")) ? new Set((await carCosts()).keys()) : undefined;
  const o = overview({ leads: leads.filter(isSalesLead), drives, reviews, rules, listingSite, cars: all, costs, sales: new Set(sales.map((s) => s.id)), reservations, warrantyRequests: openWarrantyRequests(leads, claims).length, syncProblem: Boolean(sync?.problem), slaHours: settings.leadSlaHours, mine: mine ? me.name : undefined, drops: await can("settings") });
  // What a module that is off would show goes with it (#173): its buttons, figures and to-dos.
  // Deposits are our version only: with DoneDeal stock their page is not there, so their to-dos go too.
  const attention = o.attention.filter((a) => (!MODULE_OF[a.key] || mods.has(MODULE_OF[a.key])) && !(synced && a.key === "deposits"));
  const today = dublinDay();
  // Whose it is, first in the row's detail: a name, You, or Not taken for a new lead or request nobody has yet.
  const who = (name?: string) => (!name ? "Not taken" : name === me.name ? "You" : name);

  // One kind of to-do as rows: the first few records each with their own buttons, then one row for the rest.
  const rest = (key: string, n: number, one: string, many: string, href: string, urgency: TaskUrgency) =>
    n > EACH ? [<Task key={`${key}-more`} title={`${n - EACH} more ${n - EACH === 1 ? one : many}`} urgency={urgency} action={<Link href={href} className={rowButton}>{key === "sales" ? "Record the next" : "See all"}</Link>} />] : []; // sales: Stock opens them one at a time
  const tasks = attention.flatMap((a) => {
    switch (a.key) {
      case "reply":
        return [
          ...o.reply.slice(0, EACH).map(({ lead: l, urgency, flag }) => (
            <Task key={`reply-${l.id}`} urgency={urgency} icon={<InboxIcon />} title={`Reply to ${l.name}`} detail={[who(l.assignedTo), about(l), `came in ${fmtAgo(l.createdAt)}${flag === "late" ? ", past your reply time" : ""}`].filter(Boolean).join(" · ")} action={<><ReachButton lead={l} reply={reply(l)} /><LeadMenu id={l.id} name={l.name} /></>} />
          )),
          ...rest(a.key, o.reply.length, "new lead to answer", "new leads to answer", a.href, a.urgency),
        ];
      case "follow":
        return [
          ...o.due.slice(0, EACH).map(({ lead: l, urgency }) => {
            const late = l.followUpOn! < today; // the words by the date, as on Leads; the colour is the rule's (urgency), which is also red for a late new lead
            return (
              <Task key={`follow-${l.id}`} urgency={urgency} icon={<PhoneIcon />} title={`Follow up with ${l.name}`} detail={[who(l.assignedTo), late ? `was due ${fmtDay(l.followUpOn!, "dayMonth")}` : "due today", about(l)].filter(Boolean).join(" · ")} action={<><CallButton phone={l.phone} name={l.name} /><LeadMenu id={l.id} name={l.name} /></>} />
            );
          }),
          ...rest(a.key, o.due.length, "follow-up due", "follow-ups due", a.href, a.urgency),
        ];
      case "drives":
        return [
          ...o.toConfirm.slice(0, EACH).map((d) => (
            <Task key={`drive-${d.id}`} urgency="soon" icon={<CalendarIcon />} title={`${d.name} asked for a test drive`} detail={`${who(d.assignedTo)} · ${d.carTitle} · ${fmtDateTime(d.startsAt)}`} href={`/test-drives/${d.id}`} action={<DriveSteps drive={d} />} />
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
        return [<Task key={a.key} urgency={a.urgency} icon={g?.icon ?? <AlertIcon />} title={a.label} detail={a.key === "sync" ? undefined : [plural(a.count, g?.noun ?? "item"), a.detail].filter(Boolean).join(" · ")} action={<Link href={a.href} aria-label={`${g?.verb ?? "Open"}: ${a.label}`} className={rowButtonStrong}>{g?.verb ?? "Open"}</Link>} />];
      }
    }
  });
  // One count for To do, its See all and the To do page: everything listed in it.
  const count = attention.reduce((n, a) => n + a.count, 0);
  // The red ones: late or due today. A kind of lead is red when any one is, so its leads are counted one by one.
  const red = (ts: { urgency: string }[]) => ts.filter((t) => t.urgency === "now").length;
  const late = attention.reduce((n, a) => n + (a.key === "reply" ? red(o.reply) : a.key === "follow" ? red(o.due) : a.urgency === "now" ? a.count : 0), 0);
  return { o, tasks, count, late, mine, me, mods, synced, all, leads, rules };
}
