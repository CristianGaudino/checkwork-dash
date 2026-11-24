import { Badge, EmptyState, Meter, Notice, PageHeader, Panel, SummaryTabs, TableFooter, pageOf } from "@/components/admin/kit";
import { Stars } from "@/components/admin/Stars";
import { reviewsStore, type AdminReview } from "@/lib/admin/collections";
import { fmtDate, plural } from "@/lib/admin/format";
import { currentDealer } from "@/lib/tenancy/current";
import { REVIEW_FILTERS, filterReviews, parseReviewFilter, ratingSummary, type ReviewFilter } from "@/lib/admin/reviews";
import { replyAction } from "./actions";
import { ReplyForm } from "./ReplyForm";

// What a reply came back as (replyAction). Only these codes are ever shown.
const NOTICES: Record<string, { tone: "good" | "warn"; text: string }> = {
  "reply-posted": { tone: "good", text: "Reply posted on Google." },
  "reply-removed": { tone: "good", text: "Reply removed from Google." },
  "not-connected": { tone: "warn", text: "Google review replies are not connected, so nothing was posted. Connect them under Settings." },
  "not-installed": { tone: "warn", text: "The Google keys are set, but posting replies is not switched on yet. Nothing was posted." },
};

export const metadata = { title: "Reviews" };

export default async function Page({ searchParams }: { searchParams: Promise<{ filter?: string; notice?: string; page?: string; per?: string }> }) {
  const sp = await searchParams;
  const notice = sp.notice ? NOTICES[sp.notice] : undefined;
  const [all, { name }] = await Promise.all([reviewsStore.list(), currentDealer()]);
  const filter = parseReviewFilter(sp.filter, all);
  const s = ratingSummary(all);
  // The ones waiting for a reply first, a low rating first among them, newest first within each: the work is at the top of every view.
  const rank = (r: AdminReview) => (r.reply ? 2 : r.rating <= 3 ? 0 : 1);
  const sorted = filterReviews(all, filter).sort((a, b) => rank(a) - rank(b));
  const paged = pageOf(sorted, sp);
  const waiting = paged.rows.filter((r) => !r.reply);
  const replied = paged.rows.filter((r) => r.reply);

  return (
    <>
      <PageHeader title="Reviews" text={`Replies are posted on Google as ${name}`} />
      {notice && (
        <Notice tone={notice.tone}>{notice.text}</Notice>
      )}
      {/* The rating in one line a phone shows whole; how the stars split sits beside it from 640px. */}
      {s.count > 0 && (
        <section aria-label="Rating" className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <p className="flex items-center gap-3">
            <span className="font-display text-[2rem] font-semibold leading-none tabular-nums">{s.average.toFixed(1)}</span>
            <span className="flex flex-col">
              <span aria-hidden="true"><Stars rating={Math.round(s.average)} /></span>
              <span className="text-meta text-text-2">out of 5, from {plural(s.count, "review")}</span>
            </span>
          </p>
          <ul aria-label="Reviews by stars" className="grid min-w-56 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-meta max-sm:hidden sm:max-w-sm">
            {s.distribution.map((d) => (
              <li key={d.stars} className="contents">
                <span className="text-text-2">{plural(d.stars, "star")}</span>
                <Meter value={d.count} max={s.count} />
                <span className="text-right tabular-nums">{d.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <SummaryTabs label="Reviews" items={REVIEW_FILTERS.map(([k, label]) => ({ label, href: `/reviews?filter=${k}`, active: filter === k, count: filterReviews(all, k).length }))} />
      {paged.total === 0 ? (
        <Panel>
          <EmptyState title={filter === "unreplied" ? "Every review has a reply" : "No reviews here"} />
        </Panel>
      ) : (
        <>
          {/* The chosen tile already says it on the unreplied filter. */}
          {waiting.length > 0 && (
            <Panel title={filter === "unreplied" ? undefined : "Needs a reply"} count={filter === "unreplied" ? undefined : sorted.filter((r) => !r.reply).length}>
              <ReviewList rows={waiting} label="Needs a reply" filter={filter} />
            </Panel>
          )}
          {replied.length > 0 && (
            <Panel title="Replied" quiet>
              <ReviewList rows={replied} label="Replied" filter={filter} />
            </Panel>
          )}
        </>
      )}
      <TableFooter page={paged.page} pageCount={paged.pageCount} total={paged.total} per={paged.per} />
    </>
  );
}

// Each review with its Reply under it, on the right: pressing it opens the reply in the house dialog, with Write with AI, and Post reply
// sends it to Google.
// A review of 3 stars or fewer with no reply is marked: it is the one to answer first.
function ReviewList({ rows, label, filter }: { rows: AdminReview[]; label: string; filter: ReviewFilter }) {
  return (
    <ul aria-label={label} className="-mx-5 flex flex-col divide-y divide-hairline">
      {rows.map((r) => (
        <li key={r.id} data-review className="flex flex-col gap-2 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span data-author className="font-medium">{r.author}</span>
            <Stars rating={r.rating} />
            <span className="text-meta text-text-2">{fmtDate(r.createdAt)}</span>
            {!r.reply && r.rating <= 3 && <Badge tone="warn">Low rating</Badge>}
          </div>
          <p className="max-w-measure whitespace-pre-line text-body">{r.text}</p>
          {r.reply && (
            <p className="max-w-measure whitespace-pre-line border-l-2 border-hairline pl-3 text-meta text-text-2">
              <span className="font-medium text-text">Your reply: </span>
              {r.reply}
            </p>
          )}
          <ReplyForm action={replyAction.bind(null, r.id)} id={r.id} author={r.author} review={r.text} reply={r.reply} filter={filter} />
        </li>
      ))}
    </ul>
  );
}
