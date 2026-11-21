import Link from "next/link";
import { AddTeamForm, BusinessForm, RoleForm, LeadEmailsForm, MarketingForm, NotificationsForm, SiteKeyForm, TargetsForm } from "@/components/admin/SettingsForms";
import { Badge, DataTable, Facts, Notice, PageHeader, Panel, adminButtonQuiet, rowDanger } from "@/components/admin/kit";
import { ActButton } from "@/components/admin/ActButton";
import { getSettings } from "@/lib/admin/collections";
import { INTEGRATIONS, type IntegrationId, integrationText, modeOf } from "@/lib/integrations";
import { formatHours } from "@/lib/dealer";
import { removeTeamAction, resetDemoAction, revokeSiteKeyAction } from "./actions";
import { siteKeysOf } from "@/lib/tenancy/directory";
import { fmtDateTime } from "@/lib/admin/format";
import { mayResetDemo } from "@/lib/admin/docs";
import { syncLine } from "@/components/admin/SyncPanel";
import { syncStatus } from "@/lib/donedeal/sync";
import { stockSource } from "@/lib/stock-source";
import { listing } from "@/lib/stock-source";
import { currentDealer } from "@/lib/tenancy/current";
import { addressText } from "@/lib/tenancy/profile";
import { NEW_TAB } from "@/components/ui";
import { currentMember } from "@/lib/permissions";
import { ROLES, roleCan, type Role } from "@/lib/permission-rules";
import { enabledModules } from "@/lib/modules";
import { MODULES, type ModuleId } from "@/lib/modules-rules";
import { BrandIcon } from "@/components/admin/BrandIcon";

// What each role may see, in words, so the owner knows what a role change does.
const GRANTS: Record<Role, string> = { Owner: "Everything", Manager: "Everything except changing an owner", Sales: "Everything except margins, the full reports, the team, settings, activity, data requests and billing", Finance: "Margins and the full reports, and everything Sales sees" };

export const metadata = { title: "Settings" };

const ASK_CHANGE = `/help?type=${encodeURIComponent("Request a change")}&from=/settings`;

// The page in sections, one at a time (?section=), so it is never one long scroll on a phone: a list down the side from 1024px, each with
// a line on what it changes, and a row of tabs above on a phone. The old Voice section (?section=marketing) is under Your business now.
const SECTIONS = [
  ["business", "Your business", "Your details, opening hours and how your posts sound"],
  ["targets", "Targets", "How fast to reply to a lead, and how long a test drive takes"],
  ["team", "Team", "Who can sign in, and what each person can see"],
  ["emails", "Notifications", "Where new leads are emailed, and the morning reminder"],
  ["services", "Connected services", "The outside services your site uses, and which are on"],
  ["demo", "Start again", "Put the dashboard back as it started"],
] as const;
// The module each outside service belongs to; a service without one is the base site's (lead email, the bot check).
const SERVICE_MODULE: Partial<Record<IntegrationId, ModuleId | ModuleId[]>> = {
  reviews: "reviews", gbp: "reviews", social: "social", ads: "social", newsletter: "newsletter", whatsapp: "whatsapp", ai: "ai", reglookup: ["lookupWebsite", "lookupDashboard"],
};

export default async function Page({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const [s, me, source, sp, resettable, { id: dealerId, name, profile }, { site: listingSite, url: listingUrl }] = await Promise.all([getSettings(), currentMember(), stockSource(), searchParams, mayResetDemo(), currentDealer(), listing()]);
  const synced = source === "donedeal";
  const sync = synced ? await syncStatus() : null;
  // The listing site is a service only for a dealer whose stock comes from there; the others only with their module (#173).
  const mods = await enabledModules();
  const services = INTEGRATIONS.filter((i) => (i.id !== "donedeal" || synced) && (!SERVICE_MODULE[i.id] || [SERVICE_MODULE[i.id]!].flat().some((m) => mods.has(m)))).map((i) => integrationText(i, { name, site: listingSite }));
  // Lead email is ours to connect: the dealer's fallback address in their profile (leadEmail), as LEAD_TO_EMAIL was for one site.
  const modes = new Map(await Promise.all(INTEGRATIONS.map(async (i) => [i.id, i.id === "email" ? (profile.leadEmail ? "live" : "off") : await modeOf(i.id)] as const)));
  const mode = (id: IntegrationId) => modes.get(id)!;
  const usable = (id: IntegrationId) => mode(id) !== "off";
  const team = roleCan(me.role, "team");
  const edit = roleCan(me.role, "settings");
  const owner = me.role === "Owner";
  const voice = mods.has("social") || mods.has("newsletter");
  // A manager changes everyone but an owner.
  const mayChange = (t: { role: Role }) => team && (owner || t.role !== "Owner");
  // Demo data only where there are made-up records to put back: a real dealer's dashboard has no demo, and the server refuses it there too.
  // Your business mentions the posts' voice only when that panel is there (posts or the newsletter are on).
  const sections = SECTIONS.filter(([k]) => k !== "demo" || (resettable && edit)).map(([k, label, line]) => [k, label, k === "business" && !voice ? "Your details and opening hours" : line] as const);
  const [section, , about] = sections.find(([k]) => k === sp.section) ?? sections[0];
  // Website keys only for those who make and revoke them (owners and managers).
  const keys = section === "services" && edit ? await siteKeysOf(dealerId) : [];
  return (
    <>
      <PageHeader title="Settings" text="How your site and dashboard work for you and your team." />
      {!edit && <Notice tone="neutral">Only an owner or manager can change these settings.</Notice>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Settings" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0 lg:sticky lg:top-24 lg:flex-col">
          {sections.map(([k, label, line]) => (
            <Link
              key={k}
              href={k === "business" ? "/settings" : `/settings?section=${k}`}
              aria-current={k === section ? "page" : undefined}
              className={`flex min-h-11 shrink-0 flex-col justify-center rounded-control px-3 lg:py-2.5 ${k === section ? "bg-text text-ink" : "text-text-2 hover:bg-card hover:text-text"}`}
            >
              <span className="text-meta font-medium">{label}</span>
              {/* The line on what it changes: in the side list on a laptop; on a phone it is under the tabs, for the open one only. */}
              <span aria-hidden="true" className={`hidden text-meta lg:block ${k === section ? "opacity-80" : "text-text-2"}`}>{line}</span>
            </Link>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-6">
          <p className="-mb-2 text-body text-text-2 lg:hidden">{about}</p>

          {section === "business" && (
            <>
              <Panel title="Business details">
                {edit ? (
                  <BusinessForm name={name} profile={profile} />
                ) : (
                  <>
                  <Facts items={[["Name", name], ["Website", profile.siteUrl || "Not set"], ["Phone", profile.phone || "Not set"], ["Email", profile.email || "Not set"], ["Address", addressText(profile.address) || "Not set"]]} />
                  <div className="flex flex-col gap-1">
                    <h3 className="text-meta text-text-2">Opening hours</h3>
                    <ul className="grid grid-cols-1 gap-x-8 gap-y-1 text-body sm:grid-cols-2">
                      {profile.hours.map((h) => (
                        <li key={h.day} className="flex justify-between gap-4 border-b border-hairline py-1.5">
                          <span>{h.day}</span>
                          <span className="tabular-nums text-text-2">{formatHours(h)}</span>
                        </li>
                      ))}
                      {/* As on the public site: no test drive is offered on one (src/lib/bank-holidays.ts). */}
                      <li className="flex justify-between gap-4 border-b border-hairline py-1.5">
                        <span>Bank holidays</span>
                        <span className="text-text-2">Closed</span>
                      </li>
                    </ul>
                  </div>
                  </>
                )}
              </Panel>
              {/* Ours to set (the owner's program, docs/new-dealer.md): shown, never changed here. */}
              <Panel title="Your plan" quiet>
                <Facts
                  items={[
                    ["Modules", MODULES.filter((m) => mods.has(m.id)).map((m) => m.label).join(", ") || "None"],
                    ["Stock", synced ? `From ${listingSite}` : "Kept here"],
                    ["Old stock after", `${profile.rules.oldStockDays} days`],
                    ["Price drop suggested", `€${profile.rules.slowDropEur}`],
                    ["Sold cars stay on your website", `${profile.rules.soldVisibleDays} days`],
                    ["Sales asked about for", `${profile.rules.saleNudgeDays} days`],
                  ]}
                />
                <p className="text-meta text-text-2">
                  We set these for you:{" "}
                  <Link href={ASK_CHANGE} className="font-medium text-accent-text underline underline-offset-2">ask us to change them</Link>
                </p>
              </Panel>
              {voice && (
                <Panel title="How your posts sound">
                  {edit ? <MarketingForm settings={s} /> : <Facts items={[["How we sound", s.marketing.voice], ["Hashtags", s.marketing.hashtags], ["Sign-off line", s.marketing.signOff]].map(([k, v]) => [k, v || "Not set"] as const)} />}
                </Panel>
              )}
            </>
          )}

          {section === "targets" && (
            <Panel title="Targets">
              {edit ? <TargetsForm settings={s} /> : <Facts items={[["Reply to a new lead within", `${s.leadSlaHours} hours`], ["Test drive slot", `${s.driveSlotMinutes} minutes`]]} />}
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
                    { key: "name", header: "Name", cell: (t) => <span className="font-medium">{t.name}</span> },
                    { key: "email", header: "Email", cell: (t) => t.email, hide: "sm" },
                    {
                      key: "role",
                      header: "Role",
                      // The picker and Remove share a cell, so on a phone Remove sits under the picker instead of off the screen.
                      cell: (t) =>
                        mayChange(t) ? (
                          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-start">
                            <RoleForm member={t} owner={owner} />
                            {s.team.length > 1 && (
                              <ActButton act={removeTeamAction.bind(null, t.id)} confirm={{ title: `Remove ${t.name} from the team?`, text: "Their leads and test drives go back to nobody. They can be added again later.", yes: "Remove" }} className={rowDanger}>
                                Remove
                              </ActButton>
                            )}
                          </div>
                        ) : (
                          <Badge tone={t.role === "Owner" ? "info" : "neutral"}>{t.role}</Badge>
                        ),
                      align: team ? "right" : undefined,
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
                {edit ? <LeadEmailsForm settings={s} fallback={Boolean(profile.leadEmail)} /> : <Facts items={[["Send new leads to", s.leadEmails.join(", ") || (profile.leadEmail ? "The site's own address" : "No address set")]]} />}
              </Panel>
              <Panel title="Morning reminder">
                {edit ? <NotificationsForm settings={s} emailConnected={usable("email")} /> : <Facts items={[["Morning follow-ups email to each salesperson", s.notifications.followUps ? "On" : "Off"]]} />}
              </Panel>
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
                  <dt className="text-meta text-text-2">Connection</dt>
                  <dd className="text-body">{usable("donedeal") ? "Connected" : "Not connected"}</dd>
                </div>
              </dl>
              <p className="text-body">{syncLine(sync)}</p>
              <p className="max-w-measure text-meta text-text-2">
                Cars are added, changed and sold on {listingSite}, and the site follows every 15 minutes. {listingSite} gives the key for your own site only, with your written consent.
              </p>
            </Panel>
          )}

          {section === "services" && (
            <Panel title="Connected services">
              <p className="-mt-2 max-w-measure text-meta text-text-2">We connect these for you. Anything not connected yet, ask and we set it up.</p>
              <DataTable
                bare
                rows={services}
                rowKey={(i) => i.id}
                columns={[
                  { key: "name", header: "Service", cell: (i) => <span className="flex flex-col"><span className="inline-flex items-center gap-1.5 font-medium"><BrandIcon name={i.name} />{i.name}</span><span className="text-meta text-text-2 md:hidden">{i.purpose}</span></span> },
                  { key: "purpose", header: "What it does", hide: "md", cell: (i) => i.purpose, className: "max-w-[20rem]" },
                  { key: "status", header: "Status", cell: (i) => (usable(i.id) ? <Badge tone="good">Connected</Badge> : <Badge tone="warn">Not connected</Badge>) },
                  // A dealer never sees setting names: we connect a service for them (the names are in .env.example and docs/new-site-checklist.md).
                  { key: "account", header: "Account", hide: "sm", cell: (i) => (mode(i.id) === "off" ? <Link href={ASK_CHANGE} className="text-meta font-medium text-accent-text underline underline-offset-2">Ask us to connect it</Link> : <span className="break-words text-meta text-text-2">{mode(i.id) === "simulated" ? i.demoAccount : "Nothing to do"}</span>) },
                ]}
              />
            </Panel>
          )}

          {section === "services" && edit && (
            <Panel title="Website connection" text="Your website sends its leads here, and reads your cars, with a key made here.">
              <SiteKeyForm />
              {keys.length > 0 && (
                <DataTable
                  bare
                  rows={keys}
                  rowKey={(k) => k.id}
                  columns={[
                    { key: "name", header: "Key", cell: (k) => <span className="font-medium">{k.label}</span> },
                    { key: "made", header: "Made", cell: (k) => fmtDateTime(k.createdAt), hide: "sm" },
                    { key: "used", header: "Last used", cell: (k) => (k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "Not yet"), hide: "sm" },
                    {
                      key: "state",
                      header: "Status",
                      align: "right",
                      cell: (k) =>
                        k.revokedAt ? (
                          <Badge>Revoked</Badge>
                        ) : (
                          <ActButton act={revokeSiteKeyAction.bind(null, k.id)} confirm={{ title: `Revoke ${k.label}?`, text: "A website using this key can no longer send leads or read your cars.", yes: "Revoke" }} className={rowDanger}>
                            Revoke
                          </ActButton>
                        ),
                    },
                  ]}
                />
              )}
            </Panel>
          )}

          {section === "demo" && (
            <Panel title="Start again">
              <p className="max-w-measure text-body">Put the leads, bookings, reviews, marketing and settings back as they started.</p>
              <ActButton act={resetDemoAction} confirm={{ title: "Start again from the beginning?", text: "Every change made in the dashboard is lost.", yes: "Start again" }} className={`${adminButtonQuiet} w-fit`}>
                Start again
              </ActButton>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
