import { Badge, EmptyState, Notice, PageHeader, Panel, SummaryTabs, TableFooter, TableToolbar, Task, TaskList, pageOf, adminButton, adminButtonQuiet, rowButton, rowButtonStrong, rowDanger, type FilterGroup, type Tone } from "@/components/admin/kit";
import { PencilIcon, PlusIcon, TrashIcon } from "@/components/stock/icons";
import { Suspense } from "react";
import { Bone, LineBone, PanelBones, Skeleton, TabBones } from "@/components/admin/Skeleton";
import { Fresh } from "@/components/Tween";
import { DAY } from "@/lib/time";
import { ActButton } from "@/components/admin/ActButton";
import { RowMenu } from "@/components/admin/RowMenu";
import { sendDuePosts } from "@/lib/admin/scheduler";
import { adsStore, mediaStore, postsStore, type Ad, type SocialPost } from "@/lib/admin/collections";
import { LibraryUpload } from "@/components/admin/MediaUpload";
import { hasModule } from "@/lib/modules";
import { notFound } from "next/navigation";
import { TIME_ZONE } from "@/lib/site";
import { AD_PLATFORM_LABELS } from "@/lib/admin/networks";
import { PostNow, postLabel, postName, prepared } from "@/components/admin/PostNow";
import { addDays, dublinDay, fmtCompact, fmtDate, fmtDateTime, fmtEur, fmtNum, isIsoDay, plural, threeLetter } from "@/lib/admin/format";
import Link from "next/link";
import { calendarWeek, newestForSale, readyToPost, weekDays, worthPosting } from "@/lib/admin/marketing";
import { adminCars } from "@/lib/admin/stock-admin";
import { carName } from "@/lib/stock/format";
import { deleteAdAction, deleteMediaAction, deletePostAction, startAdAction } from "./actions";
import { BrandIcon } from "@/components/admin/BrandIcon";

export const metadata = { title: "Marketing" };

// Every tab is the Social and ads module (#173).
const TABS = ["posts", "calendar", "media"];

// Every message the page can show. The URL carries only a code from this list.
const NOTICES: Record<string, { tone: "good" | "warn"; text: string }> = {
  "post-draft": { tone: "good", text: "Draft saved." },
  "draft-ad": { tone: "good", text: "Draft and ad draft saved." },
  "post-scheduled": { tone: "good", text: "Post scheduled." },
  "post-published": { tone: "good", text: "Post published." },
  "post-held": { tone: "good", text: "Saved. It goes out once TikTok approves us." },
  "published-ad": { tone: "good", text: "Post published and ad started." },
  "published-ad-draft": { tone: "warn", text: "Post published. The ad is saved as a draft because ads are not connected." },
  "ad-started": { tone: "good", text: "Ad started." },
  deleted: { tone: "good", text: "Deleted." },
  invalid: { tone: "warn", text: "That did not go through. Check the details and try again." },
  "car-gone": { tone: "warn", text: "That car is no longer for sale, so nothing was posted." },
  "invalid-time": { tone: "warn", text: "Choose a time that has not passed." },
  "social-not-connected": { tone: "warn", text: "Facebook and Instagram are not connected, so nothing was posted. The draft is kept. Connect them under Settings." },
  "ads-not-connected": { tone: "warn", text: "Ads are not connected, so the ad was not started. Connect them under Settings." },
  "social-not-installed": { tone: "warn", text: "Posting is not switched on yet. Nothing was posted." },
  "ads-not-installed": { tone: "warn", text: "Ads are not switched on yet. Nothing was started." },
};

const PENDING = new Set(["draft", "scheduled"]);
const today = () => Date.now(); // lint: a page may not call Date.now directly

// What each tab is for: one short line each, of about the same length, so the header keeps its height when the tab changes (#115).
const TAB_TEXT: Record<string, string> = {
  posts: "What went out and what is waiting",
  calendar: "What goes out each day of the week",
  media: "Your own photos and videos for posts",
};

const STATUS: Record<string, { tone: Tone; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  scheduled: { tone: "info", label: "Scheduled" },
  posted: { tone: "good", label: "Posted" },
  running: { tone: "good", label: "Running" },
  paused: { tone: "warn", label: "Paused" },
  ended: { tone: "neutral", label: "Ended" },
};

type Params = { tab?: string; notice?: string; show?: string; status?: string; page?: string; per?: string; week?: string };

// The header and any notice first; the tabs (their counts are the records) and the tab stream in under them (#200). Not keyed: a tab change keeps the old list until the new one lands, so the tabs never turn to bones.
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  if (!(await hasModule("social"))) notFound();
  const tab = TABS.includes(sp.tab ?? "") ? sp.tab! : TABS[0];
  const notice = sp.notice ? NOTICES[sp.notice] : undefined;
  return (
    <>
      <PageHeader
        title="Marketing"
        text={TAB_TEXT[tab]}
        actions={
          // On every tab, so the header does not change shape when the tab does.
          <Link href="/marketing/new" className={adminButton}>
            <PlusIcon className="shrink-0 size-4" />
            New post
          </Link>
        }
      />
      {notice && (
        <Notice tone={notice.tone}>{notice.text}</Notice>
      )}
      <Suspense fallback={<MarketingBones tab={tab} />}>
        <Fresh className="flex flex-col gap-6">
          <Marketing sp={sp} tab={tab} />
        </Fresh>
      </Suspense>
    </>
  );
}

// The tabs, then the first panels of the tab.
function MarketingBones({ tab }: { tab: string }) {
  return (
    <Skeleton>
      <TabBones count={3} hint />
      {tab === "posts" && <PanelBones title="Waiting on you" />}
      {tab === "calendar" && (
        <div className="flex flex-col gap-4">
          <Bone className="h-11 w-72 max-w-full" />
          <div className="grid grid-cols-1 gap-3 wide:grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-card border border-hairline bg-card p-3">
                <LineBone className="h-3.5 w-20" />
                <LineBone className="h-3.5 w-24" />
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === "media" && (
        <>
          <PanelBones title="Add photos and videos">
            <div className="flex flex-col gap-3">
              <Bone className="h-[4.5rem] max-w-sm" />
              <Bone className="h-[7.75rem] sm:h-12" />
            </div>
          </PanelBones>
          <PanelBones title="Your library" />
        </>
      )}
    </Skeleton>
  );
}

async function Marketing({ sp, tab }: { sp: Params; tab: string }) {
  await sendDuePosts(); // posts whose time has come go out before the list is read
  const [posts, ads, cars, library] = await Promise.all([postsStore.list(), adsStore.list(), adminCars(), mediaStore.list()]);
  const onSale = newestForSale(cars);
  const ideas = worthPosting(onSale, posts);
  // Posts and ads in one list, newest first, filtered by what it is and where it stands.
  const feed = [...posts.map((p) => ({ kind: "post" as const, at: p.createdAt, status: p.status, p })), ...ads.map((a) => ({ kind: "ad" as const, at: a.createdAt, status: a.status, a }))]
    .filter((i) => (!sp.show || i.kind === sp.show) && (sp.status ? i.status === sp.status : !PENDING.has(i.status)))
    .sort((x, y) => y.at - x.at);
  const filters: FilterGroup[] = [
    { name: "show", label: "Show", any: "Posts and ads", options: [["post", "Posts"], ["ad", "Ads"]] },
    { name: "status", label: "Status", any: "Any status", options: Object.entries(STATUS).filter(([k]) => !PENDING.has(k)).map(([k, v]) => [k, v.label] as const) }, // drafts and scheduled are in Waiting on you
  ];

  const paged = pageOf(feed, sp);
  // Drafts and draft ads first (they need a press), then what is scheduled, soonest first.
  const waiting = [
    ...posts.filter((p) => p.status === "draft").map((p) => ({ kind: "post" as const, p })),
    ...ads.filter((a) => a.status === "draft").map((a) => ({ kind: "ad" as const, a })),
    ...posts.filter((p) => p.status === "scheduled").sort((x, y) => (x.scheduledFor ?? 0) - (y.scheduledFor ?? 0)).map((p) => ({ kind: "post" as const, p })),
  ];
  const since = today() - 30 * DAY;
  // What really went out: a post held until the network approves us (TikTok) has not gone out, so it is not counted.
  const recent = posts.filter((p) => p.status === "posted" && !prepared(p) && (p.postedAt ?? p.createdAt) >= since);
  const seen = recent.reduce((n, p) => n + (p.reach ?? 0), 0);
  const clicks = recent.reduce((n, p) => n + (p.clicks ?? 0), 0);
  const adLeads = ads.filter((a) => (a.startedAt ?? a.createdAt) >= since).reduce((n, a) => n + a.leads, 0);

  return (
    <>
      <SummaryTabs
        label="Marketing"
        items={[
          { label: "Posts and ads", count: fmtNum(posts.length + ads.length), hint: `${posts.filter((p) => p.status === "posted" && !prepared(p)).length} posted, ${plural(ads.filter((a) => a.status === "running").length, "ad")} running`, href: "/marketing?tab=posts", active: tab === "posts" },
          { label: "Calendar", count: fmtNum(posts.filter((p) => p.status === "scheduled").length), hint: "scheduled", href: "/marketing?tab=calendar", active: tab === "calendar" },
          { label: "Media", count: fmtNum(library.length), hint: "photos and videos", href: "/marketing?tab=media", active: tab === "media" },
        ]}
      />

      {tab === "posts" && (
        <>
          {(waiting.length > 0 || ideas.length > 0) && (
            <div className={`grid grid-cols-1 items-start gap-6 ${waiting.length && ideas.length ? "wider:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : ""}`}>
              {waiting.length > 0 && (
                <Panel title="Waiting on you" count={waiting.length}>
                  <TaskList label="Waiting on you">
                    {waiting.map((item) =>
                      item.kind === "post" ? (
                        <Task
                          key={item.p.id}
                          urgency={item.p.status === "draft" ? "soon" : "info"}
                          title={item.p.status === "draft" ? `Draft ${postName(item.p)}` : postName(item.p)}
                          mark={<BrandIcon name={item.p.network} />}
                          detail={[item.p.status === "scheduled" && `Goes out ${fmtDateTime(item.p.scheduledFor ?? item.p.createdAt)}`, item.p.carTitle].filter(Boolean).join(", ") || item.p.text}
                          href={`/marketing/posts/${item.p.id}`}
                          action={<PostActions p={item.p} />}
                        />
                      ) : (
                        <Task
                          key={item.a.id}
                          urgency="soon"
                          title={`${AD_PLATFORM_LABELS[item.a.platform]} ad, not started`}
                          mark={<BrandIcon name={AD_PLATFORM_LABELS[item.a.platform]} />}
                          detail={`${item.a.carTitle}, budget ${fmtEur(item.a.budgetEur)}`}
                          action={<AdActions a={item.a} />}
                        />
                      ),
                    )}
                  </TaskList>
                </Panel>
              )}
              {ideas.length > 0 && (
                <Panel title="Cars worth a post">
                  <TaskList label="Cars worth a post">
                    {ideas.map(({ car, reason }) => (
                      <Task
                        key={car.id}
                        title={carName(car)}
                        detail={reason}
                        action={
                          <>
                            <Link href={`/marketing/new?car=${encodeURIComponent(car.slug)}`} className={rowButtonStrong}>
                              Write a post
                            </Link>
                            <Link href={`/marketing/new?car=${encodeURIComponent(car.slug)}&format=story&layout=${reason === "Price dropped" ? "price-drop" : "just-in"}`} className={rowButton}>
                              Make a story
                            </Link>
                          </>
                        }
                      />
                    ))}
                  </TaskList>
                </Panel>
              )}
            </div>
          )}

          {/* How the posts did, after what needs doing: the few numbers a dealer asks about. One plain row of figures on a laptop, not tiles
              that look like the filters; on a phone one line, so the list is not pushed a screen down. */}
          <p className="text-meta text-text-2 sm:hidden">
            Last 30 days: {fmtCompact(recent.length)} posted, {fmtCompact(seen)} saw them, {fmtCompact(clicks)} {clicks === 1 ? "click" : "clicks"}, {fmtCompact(adLeads)} {adLeads === 1 ? "lead" : "leads"} from ads
          </p>
          <Panel plain title="Last 30 days" className="max-sm:hidden">
            <dl className="flex flex-wrap gap-x-10 gap-y-3">
              {([[recent.length, "Posted"], [seen, "Saw them"], [clicks, "Clicks to your site"], [adLeads, "Leads from ads"]] as const).map(([n, label]) => (
                <div key={label} className="flex flex-col">
                  <dt className="order-2 text-meta text-text-2">{label}</dt>
                  <dd className="text-heading font-semibold tabular-nums">{fmtCompact(n)}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <TableToolbar filters={filters} />
          {/* What went out and how it did. Drafts and scheduled posts are in Waiting on you, unless the filter asks for them. No title: the
              tab above already says Posts and ads. */}
          <Panel>
            {paged.total === 0 ? (
              <EmptyState
                title={sp.show || sp.status ? "Nothing matches" : "Nothing posted yet"}
                text={sp.show || sp.status ? undefined : "Pick a car and the words are written for you."}
                action={sp.show || sp.status ? undefined : <Link href="/marketing/new" className={adminButton}><PlusIcon className="shrink-0 size-4" />New post</Link>}
              />
            ) : (
              <ul aria-label="Posts and ads" data-list className="-mx-5 flex flex-col divide-y divide-hairline">
                {paged.rows.map((item) =>
                  item.kind === "post" ? (
                    <li key={item.p.id} className="relative flex flex-wrap items-center gap-3 px-5 py-3 transition-colors has-[>a:hover]:bg-surface">
                      <Thumb src={item.p.photos?.[0]} icon={<BrandIcon name={item.p.network} className="size-5" />} />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="inline-flex items-center gap-1.5 font-medium">{item.p.photos?.[0] && <BrandIcon name={item.p.network} />}{postName(item.p)}</span>
                          {item.p.status === "posted" && prepared(item.p) ? <Badge tone="info">Waiting for {item.p.network}</Badge> : <Badge tone={STATUS[item.p.status].tone}>{STATUS[item.p.status].label}</Badge>}
                        </div>
                        <span className="truncate text-meta text-text-2">
                          {item.p.carTitle ? `${item.p.carTitle}, ` : ""}
                          {item.p.status === "scheduled" && item.p.scheduledFor ? fmtDateTime(item.p.scheduledFor) : fmtDate(item.p.postedAt ?? item.p.createdAt)}
                        </span>
                        <p className="line-clamp-1 max-w-measure text-meta text-text-2 max-sm:hidden">{item.p.text}</p>
                      </div>
                      {/* The whole row opens the post: its edit page while it waits, how it did once it went out. */}
                      <Link href={`/marketing/posts/${item.p.id}`} aria-label={`${postName(item.p)}${item.p.carTitle ? `, ${item.p.carTitle}` : ""}`} className="absolute inset-0" />
                      {item.p.status === "posted" ? (
                        // Held until the network approves us: it has not gone out, so no figures.
                        !prepared(item.p) && <Results items={[[item.p.reach ?? 0, "saw it"], [item.p.clicks ?? 0, "clicks"]]} />
                      ) : (
                        <span className="relative z-10 ml-auto flex flex-wrap justify-end gap-2"><PostActions p={item.p} /></span>
                      )}
                    </li>
                  ) : (
                    <li key={item.a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <Thumb icon={<BrandIcon name={AD_PLATFORM_LABELS[item.a.platform]} className="size-5" />} />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium">{AD_PLATFORM_LABELS[item.a.platform]} ad</span>
                          <Badge tone={STATUS[item.a.status].tone}>{STATUS[item.a.status].label}</Badge>
                        </div>
                        <span className="truncate text-meta text-text-2">{item.a.carTitle}, {fmtEur(item.a.budgetEur)}</span>
                      </div>
                      {item.a.status === "draft" ? (
                        <span className="ml-auto flex flex-wrap justify-end gap-2"><AdActions a={item.a} /></span>
                      ) : (
                        <Results items={[[item.a.impressions, "saw it"], [item.a.clicks, "clicks"], [item.a.leads, "leads"]]} />
                      )}
                    </li>
                  ),
                )}
              </ul>
            )}
          </Panel>
          <TableFooter page={paged.page} pageCount={paged.pageCount} total={paged.total} per={paged.per} />
        </>
      )}

      {tab === "calendar" && <Calendar posts={posts} ads={ads} week={sp.week} />}

      {tab === "media" && (
        <>
          <Panel title="Add photos and videos">
            <LibraryUpload cars={onSale.map((c) => ({ slug: c.slug, title: carName(c) }))} />
          </Panel>
          <Panel title="Your library" count={library.length}>
            {library.length === 0 ? (
              <EmptyState title="Nothing here yet" />
            ) : (
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {[...library].sort((a, b) => b.createdAt - a.createdAt).map((m) => (
                  <li key={m.id} className="flex min-w-0 flex-col gap-2">
                    <div className="aspect-square overflow-hidden rounded-control bg-photo-bg">
                      {m.kind === "video" ? (
                        <video src={m.src} muted playsInline preload="none" aria-label={m.name} className="size-full object-cover" />
                      ) : (
                        <img src={m.src} alt={m.name} className="size-full object-cover" />
                      )}
                    </div>
                    <span className="truncate text-meta font-medium">{m.name}</span>
                    <span className="truncate text-meta text-text-2">{m.kind === "video" ? `Video, ${m.durationSec ?? 0} s` : "Photo"}{m.carTitle ? `, ${m.carTitle}` : ""}</span>
                    <ActButton act={deleteMediaAction.bind(null, m.id)} confirm={{ title: "Delete this file?", text: "A post that uses it keeps the file. It leaves the library.", yes: "Delete" }} label={`Delete ${m.name}`} className={`${rowDanger} w-fit`}>Delete</ActButton>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}

    </>
  );
}

// The week as seven days (a list on a phone), with what is set for each and what has gone out. ?week= is any day in the week wanted.
function Calendar({ posts, ads, week }: { posts: Awaited<ReturnType<typeof postsStore.list>>; ads: Awaited<ReturnType<typeof adsStore.list>>; week?: string }) {
  const today = dublinDay();
  const anchor = week && isIsoDay(week) ? week : today;
  const days = weekDays(anchor);
  const items = calendarWeek(posts, ads, days);
  const link = (day: string) => `/marketing?tab=calendar&week=${day}`;
  const label = (day: string) => threeLetter(new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }));
  return (
    <section aria-label="Week" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={link(addDays(days[0], -7))} className={adminButtonQuiet}>Earlier</Link>
        <Link href={link(today)} className={adminButtonQuiet}>This week</Link>
        <Link href={link(addDays(days[0], 7))} className={adminButtonQuiet}>Later</Link>
        <p className="text-meta text-text-2">{label(days[0])} to {label(days[6])}</p>
      </div>
      <ol className="grid grid-cols-1 gap-3 wide:grid-cols-7">
        {days.map((d) => (
          <li key={d} aria-label={label(d)} className={`flex min-w-0 flex-col gap-2 rounded-card border bg-card p-3 ${d === today ? "border-accent" : "border-hairline"}`}>
            <h3 className="text-meta font-semibold">{label(d)}</h3>
            {items[d].length === 0 ? (
              <p className="text-meta text-text-2">Nothing set</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {items[d].map((i) => (
                  <li key={i.id} data-calendar-item className="relative flex min-w-0 flex-col gap-0.5 rounded-control bg-row-alt p-2 transition-colors has-[>a:hover]:bg-surface">
                    <span className="flex min-w-0 items-center gap-1.5 text-meta font-medium"><BrandIcon name={i.title} /><span className="truncate">{i.title}</span></span>
                    {i.sub && <span className="truncate text-meta text-text-2">{i.sub}</span>}
                    <span className="text-meta text-text-2">{new Date(i.at).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE })} · {i.heldBy && i.status === "posted" ? `Waiting for ${i.heldBy}` : STATUS[i.status].label}</span>
                    {/* A post opens: its edit page while it is scheduled, how it did once it went out. An ad has no page of its own. */}
                    {i.kind === "post" && <Link href={`/marketing/posts/${i.id}`} aria-label={[i.title, i.sub].filter(Boolean).join(", ")} className="absolute inset-0 rounded-control" />}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

// A waiting post's buttons (the row rule): only its next step, then the menu. A draft's next step is Post now (Finish post on TikTok) once it
// has what its format needs, else Edit. A scheduled post has no step due: only the menu. Delete is rare, so it is in the menu, and still asks first.
function PostActions({ p }: { p: SocialPost }) {
  const ready = readyToPost(p);
  const edit = `/marketing/posts/${p.id}`;
  const due = p.status === "draft" ? (ready ? "post" : "edit") : null;
  return (
    <>
      {due === "post" && <PostNow p={p} />}
      {due === "edit" && <Link href={edit} aria-label={`Edit ${postLabel(p)}`} className={rowButtonStrong}><PencilIcon className="shrink-0 size-4" />Edit</Link>}
      <RowMenu label={`More for ${postLabel(p)}`}>
        {due !== "edit" && <Link href={edit} aria-label={`Edit ${postLabel(p)}`} className={rowButton}><PencilIcon className="shrink-0 size-4" />Edit</Link>}
        {due !== "post" && ready && <PostNow p={p} strong={false} />}
        <ActButton act={deletePostAction.bind(null, p.id)} confirm={{ title: "Delete this post?", text: "This cannot be undone.", yes: "Delete" }} label={`Delete ${postLabel(p)}`} className={rowButton}><TrashIcon className="shrink-0 size-4" />Delete</ActButton>
      </RowMenu>
    </>
  );
}

// An ad draft's buttons: Start ad, then the menu with Delete.
function AdActions({ a }: { a: Ad }) {
  const name = `${AD_PLATFORM_LABELS[a.platform]} ad, ${a.carTitle}`;
  return (
    <>
      <ActButton act={startAdAction.bind(null, a.id)} confirm={{ title: "Start this ad?", text: `It runs on ${AD_PLATFORM_LABELS[a.platform]} with a budget of ${fmtEur(a.budgetEur)}.`, yes: "Start ad", safe: true }} label={`Start ad: ${name}`} className={rowButtonStrong}>Start ad</ActButton>
      <RowMenu label={`More for the ${name}`}>
        <ActButton act={deleteAdAction.bind(null, a.id)} confirm={{ title: "Delete this ad?", text: "This cannot be undone.", yes: "Delete" }} label={`Delete the ${name}`} className={rowButton}><TrashIcon className="shrink-0 size-4" />Delete</ActButton>
      </RowMenu>
    </>
  );
}

// The post's first photo, or the network's mark when it has none.
function Thumb({ src, icon }: { src?: string; icon: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-control bg-row-alt text-text-2 [&>svg]:size-5">
      {src ? <img src={src} alt="" className="size-full object-cover" /> : icon}
    </span>
  );
}

// How a post or an ad did: the figures large and the words small, so the eye finds the numbers down the list. Rounded, with the exact
// figure in the title: an ad has no page of its own to show it (#206).
function Results({ items }: { items: [number, string][] }) {
  return (
    <dl className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-right max-sm:basis-full max-sm:pl-15 max-sm:text-left">
      {items.map(([n, label]) => (
        <div key={label} className="flex flex-col">
          <dt className="order-2 text-meta text-text-2">{label}</dt>
          <dd title={fmtNum(n)} className="text-body font-semibold tabular-nums">{fmtCompact(n)}</dd>
        </div>
      ))}
    </dl>
  );
}
