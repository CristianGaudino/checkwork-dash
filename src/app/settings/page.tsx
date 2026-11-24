import Link from "next/link";
import { redirect } from "next/navigation";
import { AddPersonEdit, BusinessEdit, DefaultsEdit, LeadEmailsEdit, MarketingEdit, NotificationsEdit, PersonEdit, ProfileEdit, ReplyTimeEdit, TargetsEdit, TestEmail } from "@/components/admin/SettingsForms";
import { Badge, DataTable, Facts, FormActions, PageHeader, Panel, dangerButton, rowDanger, tapArea } from "@/components/admin/kit";
import { formatHours } from "@/lib/dealer";
import { TabRow } from "@/components/admin/TabRow";
import { ActButton } from "@/components/admin/ActButton";
import { RowMenu } from "@/components/admin/RowMenu";
import { NotifyList } from "@/components/admin/NotifyGrid";
import { Phones } from "@/components/admin/whatsapp/Phones";
import { ChevronDownIcon } from "@/components/stock/icons";
import { getSettings, type DealerSettings } from "@/lib/admin/collections";
import { INTEGRATIONS, type IntegrationId, integrationText, modeOf } from "@/lib/integrations";
import { removeTeamAction, resetDemoAction } from "./actions";
import { fmtDate, fmtNum } from "@/lib/admin/format";
import { mayResetDemo } from "@/lib/admin/docs";
import { syncLine } from "@/components/admin/SyncPanel";
import { syncStatus } from "@/lib/donedeal/sync";
import { stockSource } from "@/lib/stock-source";
import { listing } from "@/lib/stock-source";
import { currentDealer } from "@/lib/tenancy/current";
import { NEW_TAB } from "@/components/ui";
import { currentMember, type Member } from "@/lib/permissions";
import { ROLES, roleCan, type Role } from "@/lib/permission-rules";
import { enabledModules } from "@/lib/modules";
import { type ModuleId } from "@/lib/modules-rules";
import { BrandIcon } from "@/components/admin/BrandIcon";
import { PushPanel } from "@/components/admin/PushPanel";
import { pushStore, vapid } from "@/lib/push";
import { staffIdentity } from "@/lib/staff";
import { CHANNELS, columnsFor, eventLabel, eventsFor, reachLine, roleDefaults } from "@/lib/notify-rules";
import { people, whatsappOn, type Person } from "@/lib/people";
import { monthUsage } from "@/lib/billing/usage";
import { viewFor } from "@/lib/whatsapp/store";

// What each role may see, in words, so the owner knows what a role change does.
const GRANTS: Record<Role, string> = {
  Owner: "Everything",
  Manager: "Everything except changing an owner",
  Sales: "Their own account and the everyday dashboard. Not margins, the full reports, the team, the dealership's settings, activity, data requests or billing",
  Finance: "Margins and the full reports, and everything Sales sees, without WhatsApp alerts",
};

export const metadata = { title: "Settings" };

// Two groups (#142), as Slack, HubSpot and Shopify split them: Your account (everyone: their own profile and notifications) and Dealership
// (owners and managers). One section at a time (?section=), so it is never one long scroll on a phone: a list down the side from 1024px,
// each with a line on what it changes, and a row of tabs above on a phone. Old keys still work: Timings is still targets, Notifications
// still emails, and the old Voice (?section=marketing) is under Business.
const ACCOUNT = [
  ["profile", "Profile", "Your name and phone"],
  ["emails", "Notifications", "What reaches you, and how"],
] as const;
const DEALERSHIP = [
  ["business", "Business", "Your details, opening hours and how your posts sound"],
  ["team", "Team", "Who can sign in, their role and what reaches them"],
  ["routing", "Lead routing", "Where new leads are emailed, and how fast to reply"],
  ["services", "Connected services", "The outside services your site uses, WhatsApp among them"],
  ["targets", "Timings", "How long a test drive takes"],
  ["demo", "Start again", "Put the dashboard back as it started"],
] as const;
// The module each outside service belongs to; a service without one is the base site's (lead email, the bot check).
const SERVICE_MODULE: Partial<Record<IntegrationId, ModuleId | ModuleId[]>> = {
  reviews: "reviews", gbp: "reviews", social: "social", ads: "social", newsletter: "newsletter", whatsapp: "whatsapp", ai: "ai", reglookup: ["lookupWebsite", "lookupDashboard"],
};

export default async function Page({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const [s, me, source, sp, resettable, { name, profile }, { site: listingSite, url: listingUrl }, team, waOn] = await Promise.all([getSettings(), currentMember(), stockSource(), searchParams, mayResetDemo(), currentDealer(), listing(), people(), whatsappOn()]);
  const synced = source === "donedeal";
  const mods = await enabledModules();
  const edit = roleCan(me.role, "settings");
  const owner = me.role === "Owner";
  const voice = mods.has("social");
  // Sales and Finance have Your account only: Dealership is not theirs to see, a link to it goes back to Settings, and each action checks
  // again on the server.
  const dealership = edit ? DEALERSHIP.filter(([k]) => k !== "demo" || resettable).map(([k, label, line]) => [k, label, k === "business" && !voice ? "Your details and opening hours" : line] as const) : [];
  const asked = sp.section === "marketing" ? "business" : sp.section;
  if (!edit && DEALERSHIP.some(([k]) => k === asked)) redirect("/settings");
  const all = [...ACCOUNT, ...dealership];
  const [section, , about] = all.find(([k]) => k === asked) ?? all[0];

  // The signed-in person as the team knows them (none for someone the dealer has not added, as the open app's own person at Test Motors).
  const mine = team.find((t) => (me.email ? t.email.toLowerCase() === me.email.toLowerCase() : t.name === me.name));
  const oldDays = profile.rules.oldStockDays;
  // Every event the plan has, worded; each grid keeps the rows the person's role may get.
  const rows = eventsFor("Owner", mods).map((id) => ({ id, label: eventLabel(id, oldDays) }));
  const waMode = await modeOf("whatsapp");
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <TabRow current={section} aria-label="Settings" className="scrollbar-none -mx-4 -my-1 flex gap-1 overflow-x-auto px-4 py-1 sm:-mx-1 sm:px-1 lg:sticky lg:top-24 lg:flex-col lg:overflow-visible">
          {[["Your account", ACCOUNT], ["Dealership", dealership]].map(([group, items]) =>
            (items as typeof all).length === 0 ? null : (
              <div key={group as string} className="contents lg:flex lg:flex-col lg:gap-1 lg:[&+&]:mt-4">
                {/* The group's name in the side list; on a phone the tabs run on in one row. */}
                <p className="hidden px-3 pb-1 text-meta font-semibold text-text-2 lg:block">{group as string}</p>
                {(items as typeof all).map(([k, label, line]) => (
                  <Link
                    key={k}
                    href={k === all[0][0] ? "/settings" : `/settings?section=${k}`}
                    aria-current={k === section ? "page" : undefined}
                    className={`flex min-h-11 shrink-0 flex-col justify-center rounded-control px-3 lg:py-2.5 ${k === section ? "bg-card text-text ring-1 ring-inset ring-hairline" : "text-text-2 hover:bg-card hover:text-text"}`}
                  >
                    <span className="text-meta font-medium">{label}</span>
                    {/* The line on what it changes: in the side list on a laptop; on a phone it is under the tabs, for the open one only. */}
                    <span aria-hidden="true" className="hidden text-meta text-text-2 lg:block">{line}</span>
                  </Link>
                ))}
              </div>
            ),
          )}
        </TabRow>
        <div className="flex min-w-0 flex-col gap-6">
          <p className="-mb-2 text-body text-text-2 lg:hidden">{about}</p>

          {section === "profile" && (
            <Panel title="Profile" action={mine && <ProfileEdit name={mine.name} phone={mine.phone} />}>
              {mine ? (
                <>
                  <Facts items={[["Name", mine.name], ["Mobile phone", mine.phone || "Not set"], ["Email", mine.email, "[overflow-wrap:anywhere]"], ["Role", mine.role]]} />
                  <p className="max-w-measure text-meta text-text-2">You sign in with this email. {edit ? "Another owner or manager can change it in Team." : "An owner or manager can change it."}</p>
                </>
              ) : (
                <p className="max-w-measure text-body">You are not on this dealer&apos;s team yet. {edit ? "Add yourself in Team." : "Ask an owner or manager to add you."}</p>
              )}
            </Panel>
          )}

          {section === "emails" && <Notifications mine={mine} rows={rows} waOn={waOn} waMode={waMode} />}

          {section === "business" && (
            <>
              {/* Read first, changed in the house dialog (#141). The hours one day to a line, as a shop's door and Google show them. */}
              <Panel title="Business details" action={<BusinessEdit name={name} profile={profile} />}>
                <Facts
                  items={[
                    ["Name", name],
                    ["Website", profile.siteUrl || "Not set", "[overflow-wrap:anywhere]"],
                    ["Phone", profile.phone || "Not set"],
                    ["Email", profile.email || "Not set", "[overflow-wrap:anywhere]"],
                    ["Address", [profile.address.street, profile.address.town, profile.address.county, profile.address.eircode].filter(Boolean).join(", ") || "Not set"],
                  ]}
                />
                <dl aria-label="Opening hours" className="grid max-w-sm grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1 text-body">
                  {profile.hours.map((h) => (
                    <div key={h.day} className="contents">
                      <dt className="text-text-2">{h.day}</dt>
                      <dd className="tabular-nums">{formatHours(h)}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
              {voice && (
                <Panel title="How your posts sound" action={<MarketingEdit settings={s} />}>
                  <Facts items={[["How we sound", s.marketing.voice || "Not set"], ["Hashtags", s.marketing.hashtags || "None", "[overflow-wrap:anywhere]"], ["Sign-off line", s.marketing.signOff || "None"]]} />
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
            <Panel title="Timings" action={<TargetsEdit settings={s} />}>
              <Facts items={[["Test drive slot", `${s.driveSlotMinutes} minutes`]]} />
            </Panel>
          )}

          {section === "team" && <Team team={team} settings={s} me={me} owner={owner} rows={rows} waOn={waOn} />}

          {section === "routing" && (
            <>
              <Panel title="Lead emails" action={<LeadEmailsEdit settings={s} />}>
                <Facts items={[["Send new leads to", s.leadEmails.length ? s.leadEmails.join(", ") : profile.leadEmail ? "The site's own address" : "Not set, so new leads cannot be sent yet", "[overflow-wrap:anywhere]"]]} />
                <TestEmail />
              </Panel>
              <Panel title="Reply time" action={<ReplyTimeEdit settings={s} />}>
                <Facts items={[["Reply to a new lead within", `${s.leadSlaHours} hours`]]} />
              </Panel>
            </>
          )}

          {section === "services" && <Services synced={synced} listingSite={listingSite} listingUrl={listingUrl} name={name} profileLeadEmail={Boolean(profile.leadEmail)} mods={mods} team={team.length} phones={team.filter((t) => t.phone && t.role !== "Finance").length} billing={roleCan(me.role, "billing")} />}

          {section === "demo" && (
            <Panel title="Start again">
              <p className="max-w-measure text-body">Put the leads, bookings, reviews, marketing and settings back as they started.</p>
              <FormActions>
                <ActButton act={resetDemoAction} confirm={{ title: "Lose every change and start again?", text: "Every lead, booking, review, post and setting goes back to how it started. This cannot be undone.", yes: "Lose every change" }} className={dangerButton}>
                  Start again
                </ActButton>
              </FormActions>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

type Rows = { id: Parameters<typeof eventLabel>[0]; label: string }[];
type Mine = Person | undefined;

// Your account, Notifications: what reaches you and how (read first, changed in the house dialog), your devices for push, and, while
// WhatsApp is simulated (a demo dealer), the conversation to try it with.
async function Notifications({ mine, rows, waOn, waMode }: { mine: Mine; rows: Rows; waOn: boolean; waMode: string }) {
  const who = await staffIdentity();
  // This person's own devices with notifications on (#11), never anyone else's.
  const devices = who.ok ? (await pushStore.list()).filter((d) => d.email === who.email).sort((a, b) => a.addedAt - b.addedAt).map((d) => ({ id: d.id, label: d.label, added: fmtDate(d.addedAt) })) : [];
  const columns = mine ? columnsFor(mine.role, { on: waOn, phone: mine.phone }) : [];
  const wa = columns.includes("whatsapp");
  const view = wa && waMode === "simulated" ? await viewFor(mine!.name, await enabledModules()) : null;
  return (
    <>
      {mine && (
        <Panel title="What reaches you" action={<NotificationsEdit grid={{ rows, columns, value: mine.prefs, role: mine.role }} quietFrom={mine.quietFrom} quietTo={mine.quietTo} />}>
          <NotifyList rows={rows} columns={columns} value={mine.prefs} role={mine.role} />
          {wa && <p className="text-meta text-text-2">Quiet hours: {mine.quietFrom && mine.quietTo ? `no WhatsApp alerts from ${mine.quietFrom} to ${mine.quietTo}` : "none"}</p>}
          {!wa && waOn && mine.role !== "Finance" && (
            <p className="text-meta text-text-2">
              Add your mobile phone in{" "}
              <Link href="/settings" className={`font-medium text-accent-text underline underline-offset-2 ${tapArea}`}>Profile</Link> to get alerts on WhatsApp.
            </p>
          )}
        </Panel>
      )}
      <Panel title="Notifications on this device">
        <PushPanel publicKey={vapid()?.publicKey ?? null} devices={devices} />
      </Panel>
      {view && (
        // The job first (what reaches you); the live demo one tap away. How it works is in Help.
        <details className="group rounded-tile border border-hairline">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 sm:px-6 [&::-webkit-details-marker]:hidden">
            <h2 className="text-section font-semibold">Try WhatsApp</h2>
            <ChevronDownIcon aria-hidden="true" className="size-5 shrink-0 text-text-2 transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-3 border-t border-hairline p-4 sm:p-6">
            <Phones initial={view} />
            <Link href="/help#whatsapp-how" className="text-meta font-medium text-accent-text underline underline-offset-2">
              How WhatsApp works
            </Link>
          </div>
        </details>
      )}
    </>
  );
}

// Dealership, Team: each person, how they are reached, and their details in the house dialog; what a new person starts with.
async function Team({ team, settings: s, me, owner, rows, waOn }: { team: Person[]; settings: DealerSettings; me: Member; owner: boolean; rows: Rows; waOn: boolean }) {
  const devices = await pushStore.list();
  const withDevice = new Set(devices.map((d) => d.email));
  const may = roleCan(me.role, "team");
  // A manager changes everyone but an owner.
  const mayChange = (t: { role: Role }) => may && (owner || t.role !== "Owner");
  const plan = rows.map((r) => r.id);
  const defaults = s.notifyDefaults;
  const defaultColumns = CHANNELS.filter((c) => c !== "whatsapp" || waOn);
  return (
    <>
      <Panel title="Team" count={team.length} action={may && <AddPersonEdit owner={owner} />}>
        <DataTable
          bare
          rows={team}
          rowKey={(t) => t.id}
          columns={[
            // One column: the name with their role and how they are reached under it, and Edit (the house dialog) and the row's menu
            // (Remove, #95) at the end. Remove is never on their own row: removing yourself would lock you out.
            {
              key: "name",
              header: "Name",
              cell: (t) => (
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{t.name}</span>
                    <span className="hidden break-all text-meta text-text-2 sm:block">{t.email}</span>
                    <span className="text-meta text-text-2">
                      {t.role} · {reachLine(t.prefs, t.role, { devices: withDevice.has(t.email.toLowerCase()), whatsapp: waOn && Boolean(t.phone) }, plan)}
                    </span>
                  </span>
                  {mayChange(t) && (
                    <span className="flex shrink-0 items-center gap-1">
                      <PersonEdit person={{ id: t.id, name: t.name, email: t.email, role: t.role, phone: t.phone, quietFrom: t.quietFrom, quietTo: t.quietTo, prefs: t.prefs }} rows={rows} whatsapp={waOn} owner={owner} self={t.email.toLowerCase() === me.email.toLowerCase()} />
                      {team.length > 1 && t.email.toLowerCase() !== me.email.toLowerCase() ? (
                        <RowMenu label={`More for ${t.name}`}>
                          <ActButton act={removeTeamAction.bind(null, t.id)} confirm={{ title: `Remove ${t.name} from the team?`, text: "Their leads and test drives go back to nobody. They can be added again later.", yes: "Remove" }} className={rowDanger}>
                            Remove
                          </ActButton>
                        </RowMenu>
                      ) : (
                        // The menu's room, so every Edit lines up.
                        <span aria-hidden="true" className="w-11" />
                      )}
                    </span>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Panel>
      <Panel title="What a new person gets" text={defaults ? undefined : "What their role usually gets, until an owner chooses"} action={owner && <DefaultsEdit grid={{ rows, columns: defaultColumns, value: defaults ?? roleDefaults("Owner", s.notifications.followUps), role: "Owner" }} />}>
        {defaults && <NotifyList rows={rows} columns={defaultColumns} value={defaults} role="Owner" />}
        <p className="text-meta text-text-2">Each person can change their own in Settings, Notifications.</p>
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
  );
}

// Dealership, Connected services: the listing site for a synced dealer, WhatsApp (#142: its business number, whether it is connected, and
// this month's use), then every outside service and whether it is on.
async function Services({ synced, listingSite, listingUrl, name, profileLeadEmail, mods, team, phones, billing }: { synced: boolean; listingSite: string; listingUrl: string; name: string; profileLeadEmail: boolean; mods: Set<ModuleId>; team: number; phones: number; billing: boolean }) {
  const sync = synced ? await syncStatus() : null;
  // The listing site is a service only for a dealer whose stock comes from there; the others only with their module (#173).
  const services = INTEGRATIONS.filter((i) => (i.id !== "donedeal" || synced) && (!SERVICE_MODULE[i.id] || [SERVICE_MODULE[i.id]!].flat().some((m) => mods.has(m)))).map((i) => integrationText(i, { name, site: listingSite }));
  // Lead email is ours to connect: the dealer's fallback address in their profile (leadEmail), as LEAD_TO_EMAIL was for one site.
  const modes = new Map(await Promise.all(INTEGRATIONS.map(async (i) => [i.id, i.id === "email" ? (profileLeadEmail ? "live" : "off") : await modeOf(i.id)] as const)));
  const mode = (id: IntegrationId) => modes.get(id)!;
  const status = (id: IntegrationId) => (mode(id) !== "off" ? <Badge tone="good">Connected</Badge> : <Badge>Not connected</Badge>);
  const account = (id: IntegrationId) => (mode(id) === "simulated" ? integrationText(INTEGRATIONS.find((i) => i.id === id)!, { name, site: listingSite }).demoAccount : null);
  const wa = mods.has("whatsapp") ? (await monthUsage()).whatsapp.count : null;
  return (
    <>
      {sync && (
        <Panel title={listingSite}>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-meta text-text-2">Account</dt>
              <dd className="text-body">
                <a href={listingUrl} {...NEW_TAB} className="underline-offset-2 hover:underline">
                  {account("donedeal") ?? `Your ${listingSite} dealer page`}
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
          <p className="max-w-measure text-meta text-text-2">Cars are added, changed and sold on {listingSite}, and your stock here follows every 15 minutes.</p>
        </Panel>
      )}
      {wa !== null && (
        <Panel title="WhatsApp">
          <Facts
            items={[
              ["Business number", account("whatsapp") ?? (mode("whatsapp") === "off" ? "Not connected yet" : "Your WhatsApp Business number")],
              ["Status", status("whatsapp")],
              ["Messages this month", fmtNum(wa)],
              ["People with a phone for alerts", `${phones} of ${team}`],
            ]}
          />
          <p className="max-w-measure text-meta text-text-2">
            Each person chooses their alerts in Settings, Notifications, once their phone is in their Profile.{billing && " What it costs is in "}
            {billing && (
              <Link href="/billing" className={`font-medium text-accent-text underline underline-offset-2 ${tapArea}`}>Billing</Link>
            )}
          </p>
        </Panel>
      )}
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
    </>
  );
}
