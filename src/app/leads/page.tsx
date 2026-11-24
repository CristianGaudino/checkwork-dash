import { sourceText } from "@/lib/visit-rules";
import Link from "next/link";
import { LeadStatusBadge } from "@/components/admin/badges";
import { Avatar, Badge, DataTable, EmptyState, PageHeader, Panel, SummaryTabs, TableFooter, TableToolbar, Task, WhoseSwitch, pageOf, sortRows, type Column, type FilterGroup } from "@/components/admin/kit";
import { Suspense } from "react";
import { Skeleton, TableBones } from "@/components/admin/Skeleton";
import { CloseChoices, NextStatusButton, ReachButton, SpamButton } from "@/components/admin/LeadActions";
import { firstReplies } from "@/lib/leads/first-replies";
import { RowMenu } from "@/components/admin/RowMenu";
import { HeldTasks, RowActions } from "@/components/admin/HeldTasks";
import { CalendarIcon, InboxIcon } from "@/components/stock/icons";
import { can, currentMember } from "@/lib/permissions";
import { LEAD_SOURCES, LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_TYPE_LABELS, getSettings, leadsStore, type Lead } from "@/lib/admin/collections";
import { dublinDay, fmtAgo, fmtDate } from "@/lib/admin/format";
import { SALES_LEAD_TYPES, filterLeads, followUpDue, forPerson, isOpenLead, onLeadsList, leadFlag, leadsToAnswer, parseLeadFilter, possibleSpam, statusCounts, urgentFirst, type LeadTask } from "@/lib/admin/leads";
import { TOPICS, leadTags } from "@/lib/leads/contact-topics";
import { LeadKind, LeadTags, leadChips } from "@/components/admin/LeadKind";
import { enabledModules } from "@/lib/modules";
import { readLead } from "@/lib/leads/lead-text";
import { BrandIcon } from "@/components/admin/BrandIcon";

export const metadata = { title: "Leads" };

// The time, read once a request (a plain Date.now() in the render trips the purity lint), as on Reports.
const now = () => Date.now();

// What kind of request it is (a word and an icon) and where it came from, in one line.
function KindSource({ l, className = "" }: { l: Lead; className?: string }) {
  return (
    <span className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta ${className}`}>
      <LeadKind type={l.type} topic={l.topic} />
      <span className="inline-flex min-w-0 items-center gap-1 text-text-2">
        <BrandIcon name={sourceText(l)} className="size-3.5 shrink-0" /> {sourceText(l)}
      </span>
    </span>
  );
}

// What each status means, in a few words under it.
const STATUS_HINTS = { new: "Not answered yet", contacted: "Answered", appointment: "Coming in", won: "Bought", lost: "Did not buy", closed: "No longer active", spam: "Not a real enquiry" } as const;

type Params = { mine?: string; status?: string; type?: string; topic?: string; q?: string; due?: string; late?: string; need?: string; with?: string; source?: string; sort?: string; dir?: string; page?: string; per?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const f = parseLeadFilter(sp);
  const [everyLead, { leadSlaHours, team }, modules] = await Promise.all([leadsStore.list(), getSettings(), enabledModules()]);
  const all = everyLead.filter(onLeadsList);
  const today = dublinDay();
  const at = now(); // one clock for the badges, the pinning and To answer now, so they agree
  const counts = statusCounts(all, f, today, leadSlaHours, at);
  const due = all.filter((l) => followUpDue(l, today)).length;
  // New leads waiting past the reply target, counted for the filter.
  const late = filterLeads(all, { q: "", late: true }, today, leadSlaHours, at).length;
  const me = await currentMember();
  const reply = await firstReplies();
  // Whose it is, as To do says it: You, a name, or Not taken.
  const who = (name?: string) => (!name ? "Not taken" : name === me.name ? "You" : name);
  // Every filter in one panel: what kind of lead, whether it needs a reply, who has it, where it came from.
  const filters: FilterGroup[] = [
    { name: "type", label: "What they want", any: "Anything", options: SALES_LEAD_TYPES.map((t) => [t, LEAD_TYPE_LABELS[t]] as const) },
    { name: "topic", label: "Topic", any: "Any topic", options: TOPICS.filter((t) => t.id !== "bought" && (!("module" in t) || modules.has(t.module))).map((t) => [t.id, t.label] as const) }, // "bought" is filed in Aftersales
    { name: "need", label: "Needs a reply", any: "Any", options: [["due", `Follow-up due (${due})`], ["late", `Waiting too long (${late})`]] },
    { name: "with", label: "Who has it", any: "Anyone", options: [["none", "Not taken"], ...team.map((t) => [t.name, t.name] as const)] },
    { name: "source", label: "Where it came from", any: "Any source", options: LEAD_SOURCES.map((s) => [s, s] as const) },
  ];
  // A status tile keeps everything else in the URL (search, filters, sort), so picking a status does not forget the rest.
  const href = ({ status }: { status?: string }) => {
    const p = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && e[0] !== "page"));
    if (status) p.set("status", status);
    else p.delete("status");
    const qs = p.toString();
    return `/leads${qs ? `?${qs}` : ""}`;
  };

  // What to answer now, worked down from the top, by the same rule as the Overview's To do (leadsToAnswer). On the plain list, or one
  // person's: For me (forPerson, as the Overview's, whose Reply to leads opens it so) or Who has it. Any other filter is
  // looking for something else. A search keeps it, so the search box does not jump up under the cursor while typing (#85).
  const filtered = Boolean(f.status || f.type || f.topic || f.due || f.late || f.source || (sp.page && sp.page !== "1"));
  const mine = sp.mine === "1" && Boolean(me.name) && !f.with; // Who has it wins: its pill hides Everyone | For me
  const why = ({ lead: l, kind, flag }: LeadTask) =>
    kind === "follow" ? (l.followUpOn! < today ? `Follow-up was due ${fmtDate(`${l.followUpOn}T12:00:00Z`)}` : "Follow up today") : flag === "late" ? `Came in ${fmtAgo(l.createdAt)}, past your reply time` : flag === "urgent" ? `In a hurry: ${leadTags(l.topic!, l.answers ?? {}).join(", ")}` : `New, came in ${fmtAgo(l.createdAt)}`;
  const every = leadsToAnswer(f.with ? filterLeads(all, { q: "", with: f.with }) : all, at, today, leadSlaHours);
  const todo = (mine ? forPerson(every, me.name) : every).map((t) => ({ ...t, why: why(t) }));
  const SHOWN = 8;
  // The footer's links keep whose leads these are: new ones by Who has it, follow-ups by Who has it or For me (only their own).
  const withWho = f.with ? `&with=${encodeURIComponent(f.with)}` : "";
  const replies = todo.filter((t) => t.kind === "reply").length;
  const follows = todo.length - replies;
  // Everyone | For me: the same URL minus the page, with or without mine=1.
  const mineHref = (on: boolean) => {
    const p = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && e[0] !== "page" && e[0] !== "mine"));
    if (on) p.set("mine", "1");
    return `/leads${p.size ? `?${p}` : ""}`;
  };

  const whose = me.name && !f.with && (
    <WhoseSwitch label="Whose leads" everyone={mineHref(false)} forMe={mineHref(true)} mine={mine} />
  );
  // Closed and Spam only when they hold a lead (or are open), as Stock does with Hidden and Drafts: an empty one is noise.
  const statusTabs = (
    <SummaryTabs
      label="Lead status"
      items={[{ label: "All", href: href({ status: undefined }), active: !f.status, count: Object.values(counts).reduce((a, b) => a + b, 0) - counts.spam }, ...LEAD_STATUSES.filter((s) => !["closed", "spam"].includes(s) || counts[s] > 0 || f.status === s).map((s) => ({ label: LEAD_STATUS_LABELS[s], hint: STATUS_HINTS[s], href: href({ status: s }), active: f.status === s, count: counts[s] }))]}
    />
  );

  return (
    <>
      <PageHeader title="Leads" text="Every enquiry, the urgent ones first" />
      {/* The status tiles first, so picking one (which hides To answer now) leaves them where they were. */}
      {statusTabs}
      {!filtered && (
        <Panel
          title="To answer now"
          count={todo.length}
          action={whose}
        >
          {/* A row a press takes off the list stays, faded, saying what it became, until the page is left (#94). The count is the live ones. */}
          <HeldTasks
            key={mine ? "mine" : (f.with ?? "")}
            label="Leads to answer now"
            empty={<p className="text-body text-text-2">All caught up. No new leads and no follow-ups due.</p>}
            rows={todo.slice(0, SHOWN).map(({ lead: l, why, urgency, kind }) => ({
              id: l.id,
              node: (
                <Task
                  href={`/leads/${l.id}`}
                  urgency={urgency}
                  icon={kind === "follow" ? <CalendarIcon /> : <InboxIcon />}
                  title={l.name}
                  detail={
                    <span className="flex flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-x-2">
                        <LeadKind type={l.type} topic={l.topic} />
                        {l.carTitle && <span className="text-text">{l.carTitle}</span>}
                      </span>
                      <span>{[who(l.assignedTo), why].join(" · ")}</span>
                      {possibleSpam(l) && <span className="flex"><Badge tone="warn">Possible spam</Badge></span>}
                    </span>
                  }
                  // The row rule: the next action (reach them the way they asked) and the menu with the rest.
                  action={
                    <RowActions>
                      <ReachButton lead={l} reply={reply(l)} />
                      <LeadRowMenu lead={l} />
                    </RowActions>
                  }
                />
              ),
            }))}
          />
          {todo.length > SHOWN && (
            <p className="flex flex-wrap gap-x-4 text-meta text-text-2">
              {todo.length - SHOWN} more waiting.
              {replies > 0 && <Link href={`/leads?status=new${withWho}`} className="font-medium text-text underline">New leads ({replies})</Link>}
              {follows > 0 && <Link href={`/leads?need=due${withWho || (mine ? `&with=${encodeURIComponent(me.name)}` : "")}`} className="font-medium text-text underline">Follow-ups due ({follows})</Link>}
            </p>
          )}
        </Panel>
      )}
      <TableToolbar search={{ placeholder: "Search", label: "Search leads" }} filters={filters} />
      {/* The rows stream in under the tiles, To answer now and the search, so a tap on a tile works from the first paint (#109), as on Stock.
          Keyed by the status only: a new status shows the bones, a search, sort or page keeps the old rows until the new ones come. */}
      <Suspense key={f.status ?? ""} fallback={<Skeleton><TableBones /></Skeleton>}>
        <LeadsTable sp={sp} all={all} f={f} today={today} leadSlaHours={leadSlaHours} at={at} me={me.name} />
      </Suspense>
    </>
  );
}

// The table: its columns, sort and page, and the export link. Rendering a page of leads with their buttons is the slow part.
async function LeadsTable({ sp, all, f, today, leadSlaHours, at, me }: { sp: Params; all: Lead[]; f: ReturnType<typeof parseLeadFilter>; today: string; leadSlaHours: number; at: number; me: string }) {
  const reply = await firstReplies();
  const STATUS_ORDER = Object.fromEntries(LEAD_STATUSES.map((s, i) => [s, i]));
  const columns: Column<Lead>[] = [
    {
      key: "who",
      header: "Who",
      sort: (l) => l.name,
      // The name is the row's title. On a phone, where the About column is hidden, what it is about is here too: the kind, where it came
      // from and the car. The form's tags stay on the lead's page, so a row is a few lines, not a stack of chips.
      cell: (l) => (
        <span className="flex min-w-0 flex-col gap-1">
          <Link href={`/leads/${l.id}`} className="font-bold text-text [overflow-wrap:anywhere] after:absolute after:inset-0">
            {l.name}
          </Link>
          <KindSource l={l} className="sm:hidden" />
          {l.carTitle && <span className="truncate text-meta font-medium text-text sm:hidden">{l.carTitle}</span>}
        </span>
      ),
      className: "max-sm:w-full sm:max-w-[14rem]",
    },
    // What kind of request and where it came from, the form's answers as tags in full, then the car, else the first words of their
    // message, quoted and muted so the two never read alike.
    {
      key: "about",
      header: "About",
      sort: (l) => l.carTitle,
      cell: (l) => {
        const { text } = readLead(l); // their words only, never the form's answers run together (#59)
        return (
          <span className="flex min-w-0 flex-col gap-1">
            <KindSource l={l} />
            <LeadTags tags={leadChips(l.type, l.topic, l.answers)} />
            <span title={l.carTitle ?? text} className="line-clamp-2">{l.carTitle ? <span className="font-medium">{l.carTitle}</span> : text ? <span className="text-text-2">&ldquo;{text.split("\n")[0]}&rdquo;</span> : null}</span>
          </span>
        );
      },
      className: "max-w-[20rem]",
      hide: "sm",
    },
    {
      key: "status",
      header: "Status",
      sort: (l) => STATUS_ORDER[l.status],
      // A new lead waiting past the reply target says so, filled: it is the one to answer now. The badges may wrap, each whole, so the
      // row's Next step fits a laptop card and a phone has no sideways scroll.
      cell: (l) => {
        const flag = leadFlag(l, leadSlaHours, at);
        return (
        <span className="flex flex-col items-start gap-1">
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <LeadStatusBadge status={l.status} type={l.type} />
            {/* One badge for a lead that cannot wait (leadFlag). These and overdue follow-ups sit at the top of the list: urgentFirst pins them. */}
            {flag === "late" ? <Badge tone="bad" strong>Late</Badge> : flag === "urgent" && <Badge tone="warn">Urgent</Badge>}
            {possibleSpam(l) && <Badge tone="warn">Possible spam</Badge>}
          </span>
          {/* The follow-up, when there is one, under the status: one place to look for what to do next. Muted: the words say overdue or
              today, and the row is already pinned and badged. */}
          {l.followUpOn && isOpenLead(l) && (
            <span className="text-meta text-text-2">
              Follow up {l.followUpOn === today ? "today" : l.followUpOn < today ? "overdue" : fmtDate(`${l.followUpOn}T12:00:00Z`)}
            </span>
          )}
          {l.status === "closed" && l.closedReason && <span className="text-meta text-text-2">{l.closedReason}</span>}
          {/* Below 2xl the Received column is hidden, so About has room; when it came in sits here, under its status. */}
          <span className={`text-meta 2xl:hidden ${l.status === "new" ? "font-medium text-text" : "text-text-2"}`}>{fmtAgo(l.createdAt)}</span>
        </span>
        );
      },
    },
    { key: "owner", header: "Who has it", hide: "2xl", nowrap: true, sort: (l) => l.assignedTo, cell: (l) => (l.assignedTo ? <span className="inline-flex items-center gap-2"><Avatar name={l.assignedTo} />{l.assignedTo === me ? "You" : l.assignedTo.split(" ")[0]}</span> : <span className="text-text-2">Not taken</span>) },
    { key: "when", header: "Received", sort: (l) => l.createdAt, cell: (l) => <span className={l.status === "new" ? "font-medium" : "text-text-2"}>{fmtAgo(l.createdAt)}</span>, align: "right", nowrap: true, hide: "2xl" }, // below 2xl it is in the Status column
    // The row rule: the next action (reach them the way they asked, on an open lead) and the menu with the rest, right-aligned, above the
    // row's link. The menu is always last, so it lines up from row to row.
    { key: "act", header: "Next step", quietHeader: true, hide: "lg", nowrap: true, align: "right", cell: (l) => <span className="relative z-10 flex justify-end gap-2">{isOpenLead(l) && <ReachButton lead={l} reply={reply(l)} />}<LeadRowMenu lead={l} /></span> },
  ];
  const ordered = sortRows(filterLeads(all, f, today, leadSlaHours, at), columns, sp, { key: "when", dir: "desc" });
  // Unless a column was chosen, the ones To answer now shows red come first, by its rule (answerNow).
  const sorted = sp.sort ? ordered.rows : urgentFirst(ordered.rows, at, today, leadSlaHours);
  const sort = ordered.sort;
  const paged = pageOf(sorted, sp);
  const rows = paged.rows;
  const canExport = await can("data");
  return (
    <>
      <DataTable label="Leads" linkRows rows={rows} rowKey={(l) => l.id} columns={columns} sort={sp.sort ? sort : { key: "", dir: "desc" }} empty={<EmptyState title="No leads match" text="Try another filter or search." />} />
      {/* The list as it is filtered now, as a CSV: owners and managers only. */}
      <TableFooter page={paged.page} pageCount={paged.pageCount} total={paged.total} per={paged.per} exportHref={canExport ? "/leads/export" : undefined} />
    </>
  );
}

// A lead row's menu (the row rule: the row shows its next action, the rest are here): the next step, Spam and Not spam (#56), and Close
// with a reason (#55), each with Undo. A spam lead has Not spam only; a won, lost or closed one has none, so no menu.
function LeadRowMenu({ lead: l }: { lead: Lead }) {
  if (l.status !== "spam" && !isOpenLead(l)) return null;
  return (
    <RowMenu label={`More for ${l.name}`}>
      {l.status === "spam" ? (
        <SpamButton lead={l} to="no" />
      ) : (
        <>
          <NextStatusButton lead={l} />
          <SpamButton lead={l} to="yes" />
          {possibleSpam(l) && <SpamButton lead={l} to="no" />}
          <CloseChoices lead={l} />
        </>
      )}
    </RowMenu>
  );
}
