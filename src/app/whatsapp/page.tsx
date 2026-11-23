import Link from "next/link";
import { Avatar, Badge, Notice, PageHeader, Panel, rowButton } from "@/components/admin/kit";
import { ActButton } from "@/components/admin/ActButton";
import { askModuleAction } from "@/app/billing/actions";
import { SHOW_PRICING } from "@/lib/billing/rules";
import { Phones } from "@/components/admin/whatsapp/Phones";
import { CalculatorIcon, CalendarIcon, CarIcon, ChevronDownIcon, InboxIcon, MegaphoneIcon, ReceiptIcon, ReportIcon, StarIcon, SwapIcon, WrenchIcon } from "@/components/stock/icons";
import { getSettings } from "@/lib/admin/collections";
import { MODULES } from "@/lib/modules-rules";
import { enabledModules, requireModule } from "@/lib/modules";
import { can, currentMember } from "@/lib/permissions";
import { BUTTON_LABELS, EVENTS, eventList, type EventId } from "@/lib/whatsapp/rules";
import { dealerProfile } from "@/lib/tenancy/current";
import { staffStore, viewFor } from "@/lib/whatsapp/store";
import { StaffForm } from "@/components/admin/whatsapp/StaffForm";

export const metadata = { title: "WhatsApp" };

const NOTICES: Record<string, { tone: "good" | "warn"; text: string }> = {
  saved: { tone: "good", text: "Saved." },
};

// One line icon per alert, so the list reads at a glance.
const ICONS: Record<EventId, typeof InboxIcon> = { enquiry: InboxIcon, "slow-stock": CarIcon, "trade-in": SwapIcon, "test-drive": CalendarIcon, service: WrenchIcon, finance: CalculatorIcon, deposit: ReceiptIcon, review: StarIcon, "new-in": MegaphoneIcon, monday: ReportIcon };

const STEPS = [
  ["A buyer gets in touch", "They send a request on your site: a trade-in, a test drive, a question about a car."],
  ["It lands on your phone", "As a WhatsApp message with the car, the photos and buttons to answer."],
  ["Tap a reply", "The buyer gets your answer, and the lead and the activity log are updated for you."],
] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireModule("whatsapp");
  const { notice } = await searchParams;
  const modules = await enabledModules();
  const me = await currentMember();
  const { team } = await getSettings();
  const phones = await staffStore.list();
  const view = await viewFor(me.name, modules);
  const mayEditAll = await can("settings");
  const mayBill = await can("billing");
  const { rules } = await dealerProfile();
  // Every alert, the ones the plan has first, each with the module it comes with.
  const events = eventList(modules, rules.oldStockDays).map((e) => ({ ...e, module: MODULES.find((m) => m.id === e.module)! }));
  const allowed = events.filter((e) => e.on);
  const note = notice ? NOTICES[notice] : undefined;
  const linked = phones.some((x) => x.name === me.name && x.phone);

  return (
    <>
      <PageHeader title="WhatsApp" text="New leads on your phone, answered with a tap" />
      {note && <Notice tone={note.tone}>{note.text}</Notice>}

      <Panel title="Staff phones">
        <ul className="flex flex-col divide-y divide-hairline">
          {team.map((t) => {
            const p = phones.find((x) => x.id === t.id);
            const mine = new Set<EventId>(p?.alerts ?? []);
            const count = allowed.filter((e) => mine.has(e.id)).length;
            const canEdit = mayEditAll || t.name === me.name;
            return (
              <li key={t.id} data-wa-person={t.name}>
                <details className="group">
                  <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 py-2 [&::-webkit-details-marker]:hidden">
                    <Avatar name={t.name} className="size-10" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body font-medium">{t.name}</span>
                      {/* Two even lines: the number itself is in the opened form. */}
                      <span className="text-meta text-text-2">
                        {t.role} · <span className="whitespace-nowrap">{p?.phone ? `${count} of ${allowed.length} alerts` : "No number yet"}</span>
                      </span>
                    </span>
                    {/* Not on a phone: the line under the name already says it, and the name and that line keep the width. */}
                    <span className="shrink-0 max-sm:hidden">{p?.phone ? <Badge tone="good">Linked</Badge> : <Badge>Not linked</Badge>}</span>
                    <span className={`${rowButton} max-sm:hidden`}>{canEdit ? "Change" : "See"}</span>
                    {/* A phone has no room for the button; the chevron says the row opens. */}
                    <ChevronDownIcon aria-hidden="true" className="size-5 shrink-0 text-text-2 transition-transform group-open:rotate-180 sm:hidden" />
                  </summary>
                  {canEdit ? (
                    <StaffForm id={t.id} p={p} allowed={allowed.map(({ id, label }) => ({ id, label }))} />
                  ) : (
                    <p className="pb-4 text-meta text-text-2 sm:pl-13">Only {t.name} or an owner or manager can change this.</p>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* The job first (linking phones); what it does, the live demo and the alerts, one tap away. */}
      <details className="group rounded-tile border border-hairline">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 sm:px-6 [&::-webkit-details-marker]:hidden">
          <h2 className="text-section font-semibold">What it does</h2>
          <ChevronDownIcon aria-hidden="true" className="size-5 shrink-0 text-text-2 transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-8 border-t border-hairline p-4 sm:p-6">
          {/* Both phones side by side, how it works beside them from 1280px and under them before that. */}
          <section aria-labelledby="wa-how" className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="flex min-w-0 flex-col gap-3">
              {/* Only a linked number gets alerts and can act, so say that first rather than point at a phone with nothing on it. */}
              {!linked ? (
                <p className="text-meta text-text-2">
                  <span className="font-semibold text-text">Try it:</span> link your number in Staff phones first.
                </p>
              ) : (
                modules.has("tradeIn") && (
                  <p className="text-meta text-text-2">
                    <span className="font-semibold text-text">Try it:</span> tap Reply with a price on the trade-in and type 8,500.
                  </p>
                )
              )}
              <Phones initial={view} />
            </div>
            <div className="flex flex-col gap-4 xl:pt-8">
              <h3 id="wa-how" className="text-section font-semibold">
                How it works
              </h3>
              <ol className="flex flex-col gap-4">
                {STEPS.map(([title, text], i) => (
                  <li key={title} className="flex gap-3">
                    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-hairline text-meta font-semibold text-text">
                      {i + 1}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <p className="text-body font-medium">{title}</p>
                      <p className="text-meta text-text-2">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section aria-labelledby="wa-alerts" className="flex flex-col gap-4">
            <h3 id="wa-alerts" className="text-section font-semibold">
              What reaches your phone
            </h3>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {events.map(({ id, label, does, module, on }) => {
                const Icon = ICONS[id];
                return (
                  <li key={id} data-wa-module={module.id} className={`flex flex-col gap-3 rounded-card border border-hairline p-4 ${on ? "bg-card" : "bg-row-alt"}`}>
                    <div className="flex items-start gap-3">
                      <span aria-hidden="true" className={`flex size-10 shrink-0 items-center justify-center rounded-control text-text-2 ${on ? "bg-row-alt" : "bg-hairline"}`}>
                        <Icon className="size-5" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <h4 className="text-body font-semibold">{label}</h4>
                        <p className="text-meta text-text-2">{does}</p>
                      </div>
                    </div>
                    {on ? (
                      // The buttons the message comes with, in words: drawn as chips they looked like buttons on this page.
                      <p className="mt-auto text-meta text-text-2">Buttons: {EVENTS[id].buttons.map((b) => BUTTON_LABELS[b]).join(", ")}</p>
                    ) : (
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                        <span className="text-meta text-text-2">Comes with {module.label}</span>
                        {/* As on Billing: a request to us, for the owners and managers. Switches nothing on. */}
                        {mayBill && (
                          <ActButton act={askModuleAction.bind(null, module.id)} done="We have your request. Our reply will show in Help." label={`Ask us to add ${module.label}`} className={rowButton}>
                            Ask us to add
                          </ActButton>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="max-w-measure text-meta text-text-2">
              Buyers who tick the WhatsApp box on a form get your replies on WhatsApp, and can stop at any time. Everyone else gets email.{" "}
              {SHOW_PRICING ? "If WhatsApp reaches its monthly limit, replies go by email instead. Alerts your plan includes still go by WhatsApp." : "If WhatsApp can't send, alerts and replies go by email instead."}{" "}
              {mayBill && SHOW_PRICING && (
                <Link href="/billing" className="font-medium text-accent-text underline underline-offset-2">
                  Set the limit
                </Link>
              )}
            </p>
          </section>
        </div>
      </details>
    </>
  );
}
