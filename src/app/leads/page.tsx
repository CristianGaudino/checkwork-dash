import { sourceText } from "@/lib/visit-rules";
import Link from "next/link";
import { LeadStatusBadge } from "@/components/admin/badges";
import { Avatar, Badge, DataTable, EmptyState, PageHeader, Panel, SummaryTabs, TableFooter, TableToolbar, Task, TaskList, choicePill, pageOf, sortRows, type Column, type FilterGroup } from "@/components/admin/kit";
import { NextStatusButton, ReachButton } from "@/components/admin/LeadActions";
import { AlertIcon, CalendarIcon, CheckIcon, InboxIcon } from "@/components/stock/icons";
import { can, currentMember } from "@/lib/permissions";
import { LEAD_SOURCES, LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_TYPE_LABELS, getSettings, leadsStore, type Lead } from "@/lib/admin/collections";
import { dublinDay, fmtAgo, fmtDate } from "@/lib/admin/format";
import { SALES_LEAD_TYPES, countByStatus, filterLeads, followUpDue, forPerson, isOpenLead, isSalesLead, leadFlag, leadsToAnswer, parseLeadFilter, urgentFirst, type LeadTask } from "@/lib/admin/leads";
import { TOPICS, leadTags } from "@/lib/leads/contact-topics";
import { LeadKind, LeadTags, leadChips } from "@/components/admin/LeadKind";
import { enabledModules } from "@/lib/modules";
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
const STATUS_HINTS = { new: "Not answered yet", contacted: "Answered", appointment: "Coming in", won: "Bought", lost: "Did not buy" } as const;

type Params = { mine?: string; status?: string; type?: string; topic?: string; q?: string; due?: string; late?: string; need?: string; with?: string; source?: string; sort?: string; dir?: string; page?: string; per?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const f = parseLeadFilter(sp);
  const [everyLead, { leadSlaHours, team }, modules] = await Promise.all([leadsStore.list(), getSettings(), enabledModules()]);
  const all = everyLead.filter(isSalesLead);
  const counts = countByStatus(all);
  const today = dublinDay();
  const at = now(); // one clock for the badges, the pinning and To answer now, so they agree
  const due = all.filter((l) => followUpDue(l, today)).length;
  // New leads waiting past the reply target, counted for the filter.
  const late = filterLeads(all, { q: "", late: true }, today, leadSlaHours).length;
  const STATUS_ORDER = Object.fromEntries(LEAD_STATUSES.map((s, i) => [s, i]));
  const columns: Column<Lead>[] = [
    {
      key: "who",
      header: "Who",
      sort: (l) => l.name,
      // The name is the row's title, and the form's first answer as a chip. On a phone, where the About column is hidden, what it is about
      // is here too: the kind, where it came from and the car.
      cell: (l) => (
        <span className="flex min-w-0 flex-col gap-1">
          <Link href={`/leads/${l.id}`} className="font-bold text-text [overflow-wrap:anywhere] after:absolute after:inset-0">
            {l.name}
          </Link>
          <KindSource l={l} className="sm:hidden" />
          {l.carTitle && <span className="truncate text-meta font-medium text-text sm:hidden">{l.carTitle}</span>}
          {/* No width of its own (w-0), so a long answer is cut short rather than widen the column. */}
          <span className="w-0 min-w-full">
            <LeadTags tags={leadChips(l.type, l.topic, l.answers).slice(0, 1)} />
          </span>
        </span>
      ),
      className: "max-w-[11rem] sm:max-w-[14rem]",
    },
    // What kind of request and where it came from, then the car in full, else the first words of their message, quoted and muted so the
    // two never read alike.
    {
      key: "about",
      header: "About",
      sort: (l) => l.carTitle,
      cell: (l) => (
        <span className="flex min-w-0 flex-col gap-1">
          <KindSource l={l} />
          <span title={l.carTitle ?? l.message} className="line-clamp-2">{l.carTitle ? <span className="font-medium">{l.carTitle}</span> : l.message.trim() ? <span className="text-text-2">&ldquo;{l.message.split("\n")[0]}&rdquo;</span> : null}</span>
        </span>
      ),
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
            {/* One badge for a lead that cannot wait (leadFlag). These sit at the top of the list: urgentFirst pins them. */}
            {flag === "late" ? <Badge tone="bad" strong>Late</Badge> : flag === "urgent" && <Badge tone="warn">Urgent</Badge>}
          </span>
          {/* The follow-up, when there is one, under the status: one place to look for what to do next. Overdue is red, today amber. */}
          {l.followUpOn && isOpenLead(l) && (
            <span className={`text-meta ${l.followUpOn < today ? "font-medium text-bad" : followUpDue(l, today) ? "font-medium text-warn" : "text-text-2"}`}>
              Follow up {l.followUpOn === today ? "today" : l.followUpOn < today ? "overdue" : fmtDate(`${l.followUpOn}T12:00:00Z`)}
            </span>
          )}
          {/* On a phone the Received column is hidden; when it came in sits here, under its status. */}
          <span className={`text-meta sm:hidden ${l.status === "new" ? "font-medium text-text" : "text-text-2"}`}>{fmtAgo(l.createdAt)}</span>
        </span>
        );
      },
    },
    { key: "owner", header: "Who has it", hide: "2xl", nowrap: true, sort: (l) => l.assignedTo, cell: (l) => (l.assignedTo ? <span className="inline-flex items-center gap-2"><Avatar name={l.assignedTo} />{l.assignedTo.split(" ")[0]}</span> : <span className="text-text-2">Nobody</span>) },
    { key: "when", header: "Received", sort: (l) => l.createdAt, cell: (l) => <span className={l.status === "new" ? "font-medium" : "text-text-2"}>{fmtAgo(l.createdAt)}</span>, align: "right", nowrap: true, hide: "sm" }, // on a phone it is in the Who column
    // The two things done most from the list: reach them the way they asked, and move it on a step. Above the row's link.
    // Two fixed slots, so the buttons line up from row to row whichever are there.
    { key: "act", header: "Next step", quietHeader: true, hide: "lg", nowrap: true, cell: (l) => <span className="relative z-10 grid grid-cols-[7.5rem_12.5rem] gap-2"><span>{isOpenLead(l) && <ReachButton lead={l} />}</span><span><NextStatusButton lead={l} /></span></span> },
  ];
  const ordered = sortRows(filterLeads(all, f, today, leadSlaHours), columns, sp, { key: "when", dir: "desc" });
  // Unless a column was chosen, the urgent new ones come first.
  const sorted = sp.sort ? ordered.rows : urgentFirst(ordered.rows, leadSlaHours, at);
  const sort = ordered.sort;
  const paged = pageOf(sorted, sp);
  const rows = paged.rows;
  // Every filter in one panel: what kind of lead, whether it needs a reply, who has it, where it came from.
  const filters: FilterGroup[] = [
    { name: "type", label: "What they want", any: "Anything", options: SALES_LEAD_TYPES.map((t) => [t, LEAD_TYPE_LABELS[t]] as const) },
    { name: "topic", label: "Topic", any: "Any topic", options: TOPICS.filter((t) => t.id !== "bought" && (!("module" in t) || modules.has(t.module))).map((t) => [t.id, t.label] as const) }, // "bought" is filed in Aftersales
    { name: "need", label: "Needs a reply", any: "Any", options: [["due", `Follow-up due (${due})`], ["late", `Waiting too long (${late})`]] },
    { name: "with", label: "Who has it", any: "Anyone", options: [["none", "Nobody"], ...team.map((t) => [t.name, t.name] as const)] },
    { name: "source", label: "Where it came from", any: "Any source", options: LEAD_SOURCES.map((s) => [s, s] as const) },
  ];
  const canExport = await can("data");
  // A status tile keeps everything else in the URL (search, filters, sort), so picking a status does not forget the rest.
  const href = ({ status }: { status?: string }) => {
    const p = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && e[0] !== "page"));
    if (status) p.set("status", status);
    else p.delete("status");
    const qs = p.toString();
    return `/leads${qs ? `?${qs}` : ""}`;
  };

  // What to answer now, worked down from the top, by the same rule as the Overview's To do (leadsToAnswer). On the plain list, or one
  // person's: Only mine (forPerson, as the Overview's, whose Reply to leads opens it so) or Who has it. Any other filter or a search is
  // looking for something else.
  const filtered = Boolean(f.status || f.type || f.topic || f.q || f.due || f.late || f.source || (sp.page && sp.page !== "1"));
  const me = await currentMember();
  const mine = sp.mine === "1" && Boolean(me.name) && !f.with; // Who has it wins: its pill hides Only mine
  const why = ({ lead: l, kind, flag }: LeadTask) =>
    kind === "follow" ? (l.followUpOn! < today ? `Follow-up was due ${fmtDate(`${l.followUpOn}T12:00:00Z`)}` : "Follow up today") : flag === "late" ? `Came in ${fmtAgo(l.createdAt)}, past your reply time` : flag === "urgent" ? `In a hurry: ${leadTags(l.topic!, l.answers ?? {}).join(", ")}` : `New, came in ${fmtAgo(l.createdAt)}`;
  const every = leadsToAnswer(f.with ? filterLeads(all, { q: "", with: f.with }) : all, at, today, leadSlaHours);
  const todo = (mine ? forPerson(every, me.name) : every).map((t) => ({ ...t, why: why(t) }));
  const SHOWN = 8;
  // The footer's links keep whose leads these are: new ones by Who has it, follow-ups by Who has it or Only mine (only their own).
  const withWho = f.with ? `&with=${encodeURIComponent(f.with)}` : "";
  const replies = todo.filter((t) => t.kind === "reply").length;
  const follows = todo.length - replies;
  const mineParams = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && e[0] !== "page" && e[0] !== "mine"));
  if (!mine) mineParams.set("mine", "1");
  const mineHref = `/leads${mineParams.size ? `?${mineParams}` : ""}`;

  return (
    <>
      <PageHeader title="Leads" text="Everyone who got in touch. Answer the ones at the top first." />
      {!filtered && (
        <Panel
          title="To answer now"
          count={todo.length}
          action={
            me.name && !f.with && (
              <Link href={mineHref} aria-current={mine ? "true" : undefined} className={choicePill(mine)}>
                {mine && <CheckIcon className="shrink-0 size-4" />}
                Only mine
              </Link>
            )
          }
        >
          {todo.length === 0 ? (
            <p className="text-body text-text-2">All caught up. No new leads and no follow-ups due.</p>
          ) : (
            <TaskList label="Leads to answer now">
              {todo.slice(0, SHOWN).map(({ lead: l, why, urgency, kind }) => (
                <Task
                  key={l.id}
                  href={`/leads/${l.id}`}
                  urgency={urgency}
                  icon={kind === "follow" ? <CalendarIcon /> : urgency === "now" ? <AlertIcon /> : <InboxIcon />}
                  title={l.name}
                  detail={
                    <span className="flex flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-x-2">
                        <LeadKind type={l.type} topic={l.topic} />
                        {l.carTitle && <span className="text-text">{l.carTitle}</span>}
                      </span>
                      <span className={urgency === "now" ? "font-medium text-bad" : undefined}>{why}</span>
                    </span>
                  }
                  action={
                    <>
                      <ReachButton lead={l} />
                      <span className="contents max-sm:hidden">
                        <NextStatusButton lead={l} />
                      </span>
                    </>
                  }
                />
              ))}
            </TaskList>
          )}
          {todo.length > SHOWN && (
            <p className="flex flex-wrap gap-x-4 text-meta text-text-2">
              {todo.length - SHOWN} more waiting.
              {replies > 0 && <Link href={`/leads?status=new${withWho}`} className="font-medium text-text underline">New leads ({replies})</Link>}
              {follows > 0 && <Link href={`/leads?need=due${withWho || (mine ? `&with=${encodeURIComponent(me.name)}` : "")}`} className="font-medium text-text underline">Follow-ups due ({follows})</Link>}
            </p>
          )}
        </Panel>
      )}
      <SummaryTabs
        label="Lead status"
        items={[{ label: "All", href: href({ status: undefined }), active: !f.status, count: all.length }, ...LEAD_STATUSES.map((s) => ({ label: LEAD_STATUS_LABELS[s], hint: STATUS_HINTS[s], href: href({ status: s }), active: f.status === s, count: counts[s] }))]}
      />
      <TableToolbar search={{ placeholder: "Search", label: "Search leads" }} filters={filters} />
      <DataTable label="Leads" linkRows rows={rows} rowKey={(l) => l.id} columns={columns} sort={sp.sort ? sort : { key: "", dir: "desc" }} empty={<EmptyState title="No leads match" text="Try another filter or search." />} />
      {/* The list as it is filtered now, as a CSV: owners and managers only. */}
      <TableFooter page={paged.page} pageCount={paged.pageCount} total={paged.total} per={paged.per} exportHref={canExport ? "/leads/export" : undefined} />
    </>
  );
}
