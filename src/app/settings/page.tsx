import Link from "next/link";
import { AddTeamForm, BusinessForm, RoleForm, LeadEmailsForm, MarketingForm, NotificationsForm, TargetsForm } from "@/components/admin/SettingsForms";
import { Badge, DataTable, PageHeader, Panel, dangerButton, rowDanger, tapArea } from "@/components/admin/kit";
import { TabRow } from "@/components/admin/TabRow";
import { ActButton } from "@/components/admin/ActButton";
import { RowMenu } from "@/components/admin/RowMenu";
import { getSettings } from "@/lib/admin/collections";
import { INTEGRATIONS, type IntegrationId, integrationText, modeOf } from "@/lib/integrations";
import { removeTeamAction, resetDemoAction } from "./actions";
import { fmtDate } from "@/lib/admin/format";
import { mayResetDemo } from "@/lib/admin/docs";
import { syncLine } from "@/components/admin/SyncPanel";
import { syncStatus } from "@/lib/donedeal/sync";
import { stockSource } from "@/lib/stock-source";
import { listing } from "@/lib/stock-source";
import { currentDealer } from "@/lib/tenancy/current";
import { NEW_TAB } from "@/components/ui";
import { currentMember } from "@/lib/permissions";
import { ROLES, roleCan, type Role } from "@/lib/permission-rules";
import { enabledModules } from "@/lib/modules";
import { type ModuleId } from "@/lib/modules-rules";
import { BrandIcon } from "@/components/admin/BrandIcon";
import { PushPanel } from "@/components/admin/PushPanel";
import { pushStore, vapid } from "@/lib/push";
import { staffIdentity } from "@/lib/staff";

// What each role may see, in words, so the owner knows what a role change does.
const GRANTS: Record<Role, string> = { Owner: "Everything", Manager: "Everything except changing an owner", Sales: "Everything except margins, the full reports, the team, settings, activity, data requests and billing", Finance: "Margins and the full reports, and everything Sales sees" };

export const metadata = { title: "Settings" };

// The page in sections, one at a time (?section=), so it is never one long scroll on a phone: a list down the side from 1024px, each with
// a line on what it changes, and a row of tabs above on a phone. The old Voice section (?section=marketing) is under Your business now.
// Timings keeps its old key (targets), so links to it still work.
const SECTIONS = [
  ["business", "Your business", "Your details, opening hours and how your posts sound"],
  ["targets", "Timings", "How fast to reply to a lead, and how long a test drive takes"],
  ["team", "Team", "Who can sign in, and what each person can see"],
  ["emails", "Notifications", "Where new leads are emailed, the morning reminder and your phone"],
  ["services", "Connected services", "The outside services your site uses, and which are on"],
  ["demo", "Start again", "Put the dashboard back as it started"],
] as const;
// The module each outside service belongs to; a service without one is the base site's (lead email, the bot check).
const SERVICE_MODULE: Partial<Record<IntegrationId, ModuleId | ModuleId[]>> = {
  reviews: "reviews", gbp: "reviews", social: "social", ads: "social", newsletter: "newsletter", whatsapp: "whatsapp", ai: "ai", reglookup: ["lookupWebsite", "lookupDashboard"],
};

export default async function Page({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const [s, me, source, sp, resettable, { name, profile }, { site: listingSite, url: listingUrl }] = await Promise.all([getSettings(), currentMember(), stockSource(), searchParams, mayResetDemo(), currentDealer(), listing()]);
  const synced = source === "donedeal";
  const sync = synced ? await syncStatus() : null;
  // The listing site is a service only for a dealer whose stock comes from there; the others only with their module (#173).
  const mods = await enabledModules();
  const services = INTEGRATIONS.filter((i) => (i.id !== "donedeal" || synced) && (!SERVICE_MODULE[i.id] || [SERVICE_MODULE[i.id]!].flat().some((m) => mods.has(m)))).map((i) => integrationText(i, { name, site: listingSite }));
  // Lead email is ours to connect: the dealer's fallback address in their profile (leadEmail), as LEAD_TO_EMAIL was for one site.
  const modes = new Map(await Promise.all(INTEGRATIONS.map(async (i) => [i.id, i.id === "email" ? (profile.leadEmail ? "live" : "off") : await modeOf(i.id)] as const)));
  const mode = (id: IntegrationId) => modes.get(id)!;
  const usable = (id: IntegrationId) => mode(id) !== "off";
  const status = (id: IntegrationId) => (usable(id) ? <Badge tone="good">Connected</Badge> : <Badge>Not connected</Badge>);
  const team = roleCan(me.role, "team");
  const edit = roleCan(me.role, "settings");
  const owner = me.role === "Owner";
  const voice = mods.has("social") || mods.has("newsletter");
  // A manager changes everyone but an owner.
  const mayChange = (t: { role: Role }) => team && (owner || t.role !== "Owner");
  // A person's role: the picker, and Remove under the row's menu (#95), for those this person may change, else the role. Remove is never on their own row:
  // removing yourself would lock you out.
  const role = (t: (typeof s.team)[number]) =>
    mayChange(t) ? (
      <div className="flex items-start gap-1">
        <RoleForm member={t} owner={owner} />
        {s.team.length > 1 && t.email.toLowerCase() !== me.email.toLowerCase() && (
          <RowMenu label={`More for ${t.name}`}>
            <ActButton act={removeTeamAction.bind(null, t.id)} confirm={{ title: `Remove ${t.name} from the team?`, text: "Their leads and test drives go back to nobody. They can be added again later.", yes: "Remove" }} className={rowDanger}>
              Remove
            </ActButton>
          </RowMenu>
        )}
      </div>
    ) : (
      <Badge tone={t.role === "Owner" ? "info" : "neutral"}>{t.role}</Badge>
    );
  // Demo data only where there are made-up records to put back: a real dealer's dashboard has no demo, and the server refuses it there too.
  // Your business mentions the posts' voice only when that panel is there (posts or the newsletter are on). Without the settings permission
  // (Sales, Finance) only Notifications, for their own devices: the rest is not theirs to see, and each action checks again on the server.
  const sections = SECTIONS.filter(([k]) => (edit ? k !== "demo" || resettable : k === "emails")).map(([k, label, line]) => [k, label, k === "business" && !voice ? "Your details and opening hours" : line] as const);
  const [section, , about] = sections.find(([k]) => k === sp.section) ?? sections[0];
  // This person's own devices with notifications on (#11), never anyone else's.
  const who = section === "emails" ? await staffIdentity() : null;
  const devices = who?.ok ? (await pushStore.list()).filter((d) => d.email === who.email).sort((a, b) => a.addedAt - b.addedAt).map((d) => ({ id: d.id, label: d.label, added: fmtDate(d.addedAt) })) : [];
  // Everyone's own: the only part of Settings for Sales and Finance.
  const push = (
    <Panel title="Notifications on this device">
      <PushPanel publicKey={vapid()?.publicKey ?? null} devices={devices} />
    </Panel>
  );
  return (
    <>
      <PageHeader title="Settings" />
      {edit ? (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <TabRow current={section} aria-label="Settings" className="scrollbar-none -mx-4 -my-1 flex gap-1 overflow-x-auto px-4 py-1 sm:-mx-1 sm:px-1 lg:sticky lg:top-24 lg:flex-col lg:overflow-visible">
          {sections.map(([k, label, line]) => (
            <Link
              key={k}
              href={k === "business" ? "/settings" : `/settings?section=${k}`}
              aria-current={k === section ? "page" : undefined}
              className={`flex min-h-11 shrink-0 flex-col justify-center rounded-control px-3 lg:py-2.5 ${k === section ? "bg-card text-text ring-1 ring-inset ring-hairline" : "text-text-2 hover:bg-card hover:text-text"}`}
            >
              <span className="text-meta font-medium">{label}</span>
              {/* The line on what it changes: in the side list on a laptop; on a phone it is under the tabs, for the open one only. */}
              <span aria-hidden="true" className="hidden text-meta text-text-2 lg:block">{line}</span>
            </Link>
          ))}
        </TabRow>
        <div className="flex min-w-0 flex-col gap-6">
          <p className="-mb-2 text-body text-text-2 lg:hidden">{about}</p>

          {section === "business" && (
            <>
              <Panel title="Business details">
                <BusinessForm name={name} profile={profile} />
              </Panel>
              {voice && (
                <Panel title="How your posts sound">
                  <MarketingForm settings={s} />
                </Panel>
              )}
              {/* The plan and what we set for you (stock, the old stock and sold car rules) are in Billing, beside what it costs. */}
              <p className="text-meta text-text-2">
                Your plan, and what we set up for you, are in{" "}
                <Link href="/billing" className={`font-medium text-accent-text underline underline-offset-2 ${tapArea}`}>Billing</Link>
              </p>
            </>
          )}

          {section === "targets" && (
            <Panel title="Timings">
              <TargetsForm settings={s} />
            </Panel>
          )}

          {section === "team" && (
            <>
              <Panel title="Team" count={s.team.length}>
                <DataTable
                  bare
                  rows={s.team}
                  rowKey={(t) => t.id}
                  columns={[
                    // One column: the role (the picker and Remove, or a badge) beside the name from 640px and under it on a phone, where its own
                    // column squeezed the name and ran off the screen. Rendered once, so each picker is one control.
                    {
                      key: "name",
                      header: "Name",
                      cell: (t) => (
                        <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                          <span className="flex min-w-0 flex-col">
                            <span className="font-medium">{t.name}</span>
                            <span className="hidden break-all text-meta text-text-2 sm:block">{t.email}</span>
                          </span>
                          {role(t)}
                        </div>
                      ),
                    },
                  ]}
                />
                {team ? (
                  <div className="flex flex-col gap-3 border-t border-hairline pt-4">
                    <h3 className="font-semibold">Add someone</h3>
                    <AddTeamForm owner={owner} />
                  </div>
                ) : (
                  <p className="text-meta text-text-2">Only an owner or manager can change the team.</p>
                )}
              </Panel>
              <Panel title="What each role can see" quiet>
                <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-meta sm:grid-cols-2">
                  {ROLES.map((r) => (
                    <div key={r}>
                      <dt className="font-medium">{r}</dt>
                      <dd className="text-text-2">{GRANTS[r]}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            </>
          )}

          {section === "emails" && (
            <>
              <Panel title="Lead emails">
                <LeadEmailsForm settings={s} fallback={Boolean(profile.leadEmail)} />
              </Panel>
              <Panel title="Morning reminder">
                <NotificationsForm settings={s} emailConnected={usable("email")} />
              </Panel>
              {push}
            </>
          )}

          {section === "services" && sync && (
            <Panel title={listingSite}>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt className="text-meta text-text-2">Account</dt>
                  <dd className="text-body">
                    <a href={listingUrl} {...NEW_TAB} className="underline-offset-2 hover:underline">
                      {mode("donedeal") === "simulated" ? integrationText(INTEGRATIONS.find((i) => i.id === "donedeal")!, { name, site: listingSite }).demoAccount : `Your ${listingSite} dealer page`}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-meta text-text-2">Status</dt>
                  <dd className="text-body">{status("donedeal")}</dd>
                </div>
              </dl>
              <p className="text-body">{syncLine(sync)}</p>
              <p className="max-w-measure text-meta text-text-2">
                Cars are added, changed and sold on {listingSite}, and your stock here follows every 15 minutes.
              </p>
            </Panel>
          )}

          {section === "services" && (
            <Panel title="Connected services" text="We connect these for you">
              <DataTable
                bare
                rows={services}
                rowKey={(i) => i.id}
                columns={[
                  { key: "name", header: "Service", cell: (i) => <span className="flex flex-col"><span className="inline-flex flex-wrap items-center gap-x-1.5 font-medium">{i.name}<BrandIcon name={i.name} /></span><span className="text-meta text-text-2 md:hidden">{i.purpose}</span><span className="mt-1 sm:hidden">{status(i.id)}</span></span> },
                  { key: "purpose", header: "What it does", hide: "md", cell: (i) => i.purpose, className: "max-w-[20rem]" },
                  { key: "status", header: "Status", hide: "sm", cell: (i) => status(i.id) },
                  { key: "account", header: "Account", hide: "sm", cell: (i) => (mode(i.id) === "off" ? null : <span className="text-meta text-text-2 [overflow-wrap:anywhere]">{mode(i.id) === "simulated" ? i.demoAccount : "Nothing to do"}</span>) },
                ]}
              />
            </Panel>
          )}

          {section === "demo" && (
            <Panel title="Start again">
              <p className="max-w-measure text-body">Put the leads, bookings, reviews, marketing and settings back as they started.</p>
              <ActButton act={resetDemoAction} confirm={{ title: "Lose every change and start again?", text: "Every lead, booking, review, post and setting goes back to how it started. This cannot be undone.", yes: "Lose every change" }} className={`${dangerButton} w-fit`}>
                Start again
              </ActButton>
            </Panel>
          )}
        </div>
      </div>
      ) : (
        push
      )}
    </>
  );
}
