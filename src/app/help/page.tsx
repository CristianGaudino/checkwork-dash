import Link from "next/link";
import { FeedbackForm, HelpForm } from "@/components/admin/HelpForms";
import { Badge, Columns, EmptyState, PageHeader, Panel, PanelLink, adminButtonQuiet, type Tone } from "@/components/admin/kit";
import { ChevronDownIcon, InboxIcon, PhoneIcon, WhatsAppIcon } from "@/components/stock/icons";
import { fmtDateTime } from "@/lib/admin/format";
import { feedbackStore, requestsOf } from "@/lib/admin/help";
import { STATUS_LABELS, SUPPORT, feedbackDue, safeFrom, supportTel, supportWhatsApp, typesFor, type HelpStatus } from "@/lib/admin/help-rules";
import { currentMember } from "@/lib/permissions";
import { helpGroups } from "@/lib/help/topics";
import { dealerProfile } from "@/lib/tenancy/current";
import { OpenFromHash } from "./OpenFromHash";
import { DEALER_NAV } from "@/lib/admin/nav";
import { enabledModules } from "@/lib/modules";
import { listing, stockSource } from "@/lib/stock-source";
import { NEW_TAB } from "@/components/ui";

export const metadata = { title: "Help" };

const TONE: Record<HelpStatus, Tone> = { received: "neutral", inProgress: "info", done: "good" };
const today = () => Date.now();
const contact = `${adminButtonQuiet} !h-auto w-full justify-start gap-3 py-3 text-left`;

// The page a request came from, as the menu names it ("Margins", "Settings"); a page deeper in an area takes its area's name.
const pageName = (from: string) => DEALER_NAV.filter((i) => from === i.href || from.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.label ?? "the dashboard";

// Every team member can reach us from here. First a person, one press away; then how to do the everyday jobs (most questions end there),
// one topic per job, each closed until opened, grouped as the menu is, only those for this person's role and this dealer's plan (src/lib/help/topics.ts),
// beside the form; then what they sent, with our replies. `from` is the page they came from, when a link sets it (the Billing page does).
export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string; type?: string }> }) {
  const [me, sp, modules, source, { site: listingSite }, { rules }] = await Promise.all([currentMember(), searchParams, enabledModules(), stockSource(), listing(), dealerProfile()]);
  const types = typesFor(me.role);
  const first = types.find((t) => t === sp.type) ?? types[0];
  const [mine, last] = await Promise.all([requestsOf(me.name), feedbackStore.get(me.name.toLowerCase())]);
  const groups = helpGroups({ role: me.role, modules, synced: source === "donedeal", listingSite, oldStockDays: rules.oldStockDays });

  return (
    <>
      <PageHeader title="Help" />

      <Panel title="Talk to us" text={SUPPORT.hours}>
        <ul className="grid grid-cols-1 gap-3 sm:@[35rem]/page:grid-cols-3">
          <li>
            <a href={supportTel} className={contact}>
              <PhoneIcon className="size-5 shrink-0 text-text-2" />
              <span className="flex flex-col">
                <span>Call</span>
                <span className="font-normal text-text-2">{SUPPORT.phone}</span>
              </span>
            </a>
          </li>
          <li>
            <a href={`mailto:${SUPPORT.email}`} className={contact}>
              <InboxIcon className="size-5 shrink-0 text-text-2" />
              <span className="flex min-w-0 flex-col">
                <span>Email</span>
                <span className="truncate font-normal text-text-2">{SUPPORT.email}</span>
              </span>
            </a>
          </li>
          <li>
            <a href={supportWhatsApp} {...NEW_TAB} className={contact}>
              <WhatsAppIcon className="size-5 shrink-0 text-whatsapp" />
              <span className="flex flex-col">
                <span>
                  WhatsApp<span className="sr-only"> (opens in a new tab)</span>
                </span>
                <span className="font-normal text-text-2">{SUPPORT.phone}</span>
              </span>
            </a>
          </li>
        </ul>
      </Panel>

      <Columns
        aside={
          <Panel title="Send us a message" text="Questions, site changes or problems. We reply here">
            <HelpForm types={types} first={first} from={safeFrom(sp.from)} />
          </Panel>
        }
      >
        <Panel title="How to">
          <OpenFromHash />
          <div className="flex flex-col gap-6">
            {groups.map((g) => (
              <section key={g.id} aria-labelledby={`help-${g.id}`} className="flex flex-col gap-2">
                <h3 id={`help-${g.id}`} className="text-meta font-semibold text-text-2">
                  {g.title}
                </h3>
                {/* One topic per row, closed until asked for, as GOV.UK's and Apple Support's help pages do; several can be open at once. */}
                <ul className="flex flex-col divide-y divide-hairline rounded-control border border-hairline">
                  {g.topics.map((t) => (
                    <li key={t.id}>
                      <details id={t.id} className="group scroll-mt-24">
                        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-body font-medium">{t.title}</span>
                            <span className="text-meta text-text-2">{t.summary}</span>
                          </span>
                          <ChevronDownIcon aria-hidden="true" className="size-5 shrink-0 text-text-2 transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="flex flex-col gap-2 px-4 pb-3">
                          {t.steps && (
                            <ol className="flex list-decimal flex-col gap-1 pl-5 text-body text-text-2">
                              {t.steps.map((s) => (
                                <li key={s}>{s}</li>
                              ))}
                            </ol>
                          )}
                          {t.points && (
                            <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-text-2">
                              {t.points.map((s) => (
                                <li key={s}>{s}</li>
                              ))}
                            </ul>
                          )}
                          {t.note && <p className="max-w-measure text-meta text-text-2">{t.note}</p>}
                          <PanelLink href={t.href}>{t.go}</PanelLink>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Panel>
      </Columns>

      <Panel title="What you sent us" count={mine.length || undefined}>
        {mine.length === 0 ? (
          <EmptyState compact title="Nothing sent yet" text="What you send us shows here, with our reply." />
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {mine.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.type}</span>
                  <Badge tone={TONE[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                  <span className="text-meta text-text-2">{fmtDateTime(r.at)}</span>
                  {r.from !== "/" && (
                    <Link href={r.from} className="text-meta text-text-2 underline-offset-2 hover:underline">
                      From {pageName(r.from)}
                    </Link>
                  )}
                </div>
                <p className="max-w-measure whitespace-pre-line text-body">{r.message}</p>
                {r.steps && <p className="max-w-measure whitespace-pre-line text-body text-text-2">{r.steps}</p>}
                {r.screenshot && <p className="text-meta text-text-2">Screenshot attached</p>}
                {r.reply && (
                  <div className="max-w-measure rounded-control bg-row-alt p-3">
                    <p className="text-meta font-semibold">Checkwork support{r.repliedAt ? `, ${fmtDateTime(r.repliedAt)}` : ""}</p>
                    <p className="whitespace-pre-line text-body">{r.reply}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {feedbackDue(last?.at, today()) && (
        <Panel quiet>
          <FeedbackForm />
        </Panel>
      )}
    </>
  );
}
