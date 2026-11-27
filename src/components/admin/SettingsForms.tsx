"use client";

import { useKeptForm } from "@/components/admin/useKeptForm";
import { Select } from "@/components/Select";
import { useEffect, useState } from "react";
import { Field, FormActions, adminButton, adminButtonQuiet, adminInput } from "@/components/admin/kit";
import { DialogCancel } from "@/components/admin/Dialog";
import { EditDialog, useDoneOnSave } from "@/components/admin/EditDialog";
import { addTeamAction, saveBusinessAction, saveLeadEmailsAction, saveMarketingAction, saveMyNotificationsAction, savePersonAction, saveProfileAction, sendTestEmailAction, saveTargetsAction, type SettingsState } from "@/app/settings/actions";
import type { DealerSettings } from "@/lib/admin/collections";
import { columnsFor, type Channel, type Prefs } from "@/lib/notify-rules";
import { NotifyGrid, type GridRow } from "@/components/admin/NotifyGrid";
import { ROLES, type Role } from "@/lib/permission-rules";
import type { DealerProfile } from "@/lib/tenancy/profile";
import { BUSY } from "@/components/admin/ActButton";
import { LIMITS } from "@/lib/leads/constants";

const ROLE_OPTIONS = ROLES.map((r) => [r, r] as const);

// Each settings panel is read on the page and changed in its own dialog, which saves on its own and says so. The server checks every value again.
type Action = (prev: SettingsState, data: FormData) => Promise<SettingsState>;

function useSave(action: Action) {
  const [state, run, pending] = useKeptForm<SettingsState>(action, undefined);
  // A refused save brings its first error into view: the Save button can sit far below the field (the email above the opening hours).
  useEffect(() => {
    if (state?.errors) run.ref.current?.querySelector('[role="alert"]')?.scrollIntoView({ block: "center" });
  }, [state, run.ref]);
  return { state, run, pending, errors: state?.errors ?? {} };
}

// A dialog's Cancel and Save, bottom right with Save right-most.
function DialogSave({ pending }: { pending: boolean }) {
  return (
    <FormActions>
      <DialogCancel />
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${adminButton} ${BUSY}`}>
        {pending ? "Saving" : "Save"}
      </button>
    </FormActions>
  );
}

const SAVED = "Saved. It works from now on";
type Business = { name: string; profile: Pick<DealerProfile, "siteUrl" | "phone" | "email" | "address" | "hours"> };

// The panels of Settings are read first (the page shows the values) and changed in the house dialog (#141). A save that works closes it and
// says so; a refused one keeps it open with the errors by their fields.
export const BusinessEdit = (props: Business) => (
  <EditDialog title="Business details" what="business details" saved={SAVED}>
    {(done) => <BusinessForm {...props} done={done} />}
  </EditDialog>
);
export const MarketingEdit = ({ settings }: { settings: DealerSettings }) => (
  <EditDialog title="How your posts sound" what="how your posts sound" saved={SAVED}>
    {(done) => <MarketingForm settings={settings} done={done} />}
  </EditDialog>
);
export const TargetsEdit = ({ settings }: { settings: DealerSettings }) => (
  <EditDialog title="Timings" what="timings" saved={SAVED}>
    {(done) => <TargetsForm settings={settings} done={done} />}
  </EditDialog>
);
export const LeadEmailsEdit = ({ settings }: { settings: DealerSettings }) => (
  <EditDialog title="Lead emails" what="lead emails" saved={SAVED}>
    {(done) => <LeadEmailsForm settings={settings} done={done} />}
  </EditDialog>
);

// The dealer's own facts. Hours: a time each for opening and closing, empty for a closed day.
function BusinessForm({ name, profile, done }: Business & { done: () => void }) {
  const f = useSave(saveBusinessAction);
  useDoneOnSave(f.state, f.pending, done);
  return (
    <form {...f.run} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" error={f.errors.name}>
          <input name="name" maxLength={80} defaultValue={name} className={adminInput} />
        </Field>
        <Field label="Website" hint="The full address, like https://www.yourname.ie" error={f.errors.siteUrl}>
          <input name="siteUrl" type="url" maxLength={200} defaultValue={profile.siteUrl} className={adminInput} />
        </Field>
        <Field label="Phone" error={f.errors.phone}>
          <input name="phone" type="tel" maxLength={30} defaultValue={profile.phone} className={adminInput} />
        </Field>
        <Field label="Email" error={f.errors.email}>
          <input name="email" type="email" maxLength={120} defaultValue={profile.email} className={adminInput} />
        </Field>
        <Field label="Street" error={f.errors.street}>
          <input name="street" maxLength={80} defaultValue={profile.address.street} className={adminInput} />
        </Field>
        <Field label="Town" error={f.errors.town}>
          <input name="town" maxLength={60} defaultValue={profile.address.town} className={adminInput} />
        </Field>
        <Field label="County" error={f.errors.county}>
          <input name="county" maxLength={60} defaultValue={profile.address.county} className={adminInput} />
        </Field>
        <Field label="Eircode" error={f.errors.eircode}>
          <input name="eircode" maxLength={10} defaultValue={profile.address.eircode} className={adminInput} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-meta font-semibold">Opening hours</legend>
        {profile.hours.map((h, i) => (
          // On a phone the day sits above its two times, so each time has the room to show in full.
          <div key={h.day} className="grid grid-cols-2 items-start gap-x-2 gap-y-1 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)] sm:gap-y-2">
            <span className="col-span-2 flex items-center text-body sm:col-span-1 sm:h-11">{h.day}</span>
            <Field label={`${h.day} opens`} error={f.errors[`opens${i}`]} className="[&>span:first-child]:sr-only">
              <input name={`opens${i}`} type="time" defaultValue={h.opens ?? ""} className={adminInput} />
            </Field>
            <Field label={`${h.day} closes`} className="[&>span:first-child]:sr-only">
              <input name={`closes${i}`} type="time" defaultValue={h.closes ?? ""} className={adminInput} />
            </Field>
          </div>
        ))}
      </fieldset>
      <DialogSave pending={f.pending} />
    </form>
  );
}

function TargetsForm({ settings, done }: { settings: DealerSettings; done: () => void }) {
  const f = useSave(saveTargetsAction);
  useDoneOnSave(f.state, f.pending, done);
  return (
    <form {...f.run} className="flex flex-col gap-4" noValidate>
      <Field label="Reply to a new lead within (hours)" hint="Leads waiting longer show on the overview" error={f.errors.leadSlaHours}>
        <input name="leadSlaHours" type="number" inputMode="numeric" defaultValue={settings.leadSlaHours} className={adminInput} />
      </Field>
      <Field label="Test drive slot (minutes)" hint="The same car cannot be booked twice within this time" error={f.errors.driveSlotMinutes}>
        <input name="driveSlotMinutes" type="number" inputMode="numeric" defaultValue={settings.driveSlotMinutes} className={adminInput} />
      </Field>
      <DialogSave pending={f.pending} />
    </form>
  );
}

function LeadEmailsForm({ settings, done }: { settings: DealerSettings; done: () => void }) {
  const f = useSave(saveLeadEmailsAction);
  useDoneOnSave(f.state, f.pending, done);
  return (
    <form {...f.run} className="flex flex-col gap-4" noValidate>
      <Field label="Send new leads to" hint="Up to five addresses, one per line" error={f.errors.leadEmails}>
        <textarea name="leadEmails" rows={4} defaultValue={settings.leadEmails.join(String.fromCharCode(10))} className={`${adminInput} h-auto py-2`} />
      </Field>
      <DialogSave pending={f.pending} />
    </form>
  );
}

// One test message to the saved addresses, so the dealer can see it arrive. Beside the addresses it tests, not in their dialog.
export function TestEmail() {
  const t = useSave(sendTestEmailAction as Action);
  return (
    <form {...t.run} className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button type="submit" disabled={t.pending} aria-busy={t.pending || undefined} className={`${adminButtonQuiet} ${BUSY}`}>
        {t.pending ? "Sending" : "Send a test email"}
      </button>
      {t.state?.saved && !t.pending && <p role="status" className="text-meta text-ok">Sent</p>}
      {t.errors.test && !t.pending && <p role="alert" className="text-meta text-destructive">{t.errors.test}</p>}
    </form>
  );
}

function MarketingForm({ settings, done }: { settings: DealerSettings; done: () => void }) {
  const f = useSave(saveMarketingAction);
  useDoneOnSave(f.state, f.pending, done);
  return (
    <form {...f.run} className="grid grid-cols-1 gap-4" noValidate>
      <Field label="How we sound" hint="Used when posts are written" error={f.errors.voice}>
        <input name="voice" maxLength={200} defaultValue={settings.marketing.voice} className={adminInput} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Hashtags" error={f.errors.hashtags}>
          <input name="hashtags" maxLength={120} defaultValue={settings.marketing.hashtags} className={adminInput} />
        </Field>
        <Field label="Sign-off line" error={f.errors.signOff}>
          <input name="signOff" maxLength={160} defaultValue={settings.marketing.signOff} className={adminInput} />
        </Field>
      </div>
      <DialogSave pending={f.pending} />
    </form>
  );
}

// `owner`: the signed-in person is an owner, so Owner is a role they may give.
export const AddPersonEdit = ({ owner }: { owner: boolean }) => (
  <EditDialog title="Add someone" text="They sign in with this email" label="Add someone" add saved="Added to the team">
    {(done) => <AddTeamForm owner={owner} done={done} />}
  </EditDialog>
);

function AddTeamForm({ owner, done }: { owner: boolean; done: () => void }) {
  const f = useSave(addTeamAction);
  useDoneOnSave(f.state, f.pending, done);
  return (
    <form {...f.run} className="flex flex-col gap-4" noValidate>
      <Field label="Name" error={f.errors.name}>
        <input name="name" data-autofocus maxLength={LIMITS.name} className={adminInput} autoComplete="off" />
      </Field>
      <Field label="Email" error={f.errors.email}>
        <input name="email" type="email" maxLength={120} className={adminInput} autoComplete="off" />
      </Field>
      <Field label="Role" error={f.errors.role}>
        <Select name="role" defaultValue="Sales" options={owner ? ROLE_OPTIONS : ROLE_OPTIONS.filter(([r]) => r !== "Owner")} />
      </Field>
      <FormActions>
        <DialogCancel />
        <button type="submit" disabled={f.pending} aria-busy={f.pending || undefined} className={`${adminButton} ${BUSY}`}>
          {f.pending ? "Adding" : "Add"}
        </button>
      </FormActions>
    </form>
  );
}

// Your account, Profile: your own name and phone. The email is the sign-in address, so it is shown on the page, not here.
export const ProfileEdit = ({ name, phone }: { name: string; phone: string }) => (
  <EditDialog title="Profile" what="your profile" saved={SAVED}>
    {(done) => <ProfileForm name={name} phone={phone} done={done} />}
  </EditDialog>
);

function ProfileForm({ name, phone, done }: { name: string; phone: string; done: () => void }) {
  const f = useSave(saveProfileAction);
  useDoneOnSave(f.state, f.pending, done);
  return (
    <form {...f.run} className="flex flex-col gap-4" noValidate>
      <Field label="Name" hint="As the team sees it on leads and bookings" error={f.errors.name}>
        <input name="name" maxLength={LIMITS.name} defaultValue={name} className={adminInput} autoComplete="name" />
      </Field>
      <PhoneField phone={phone} error={f.errors.phone} />
      <DialogSave pending={f.pending} />
    </form>
  );
}

const PhoneField = ({ phone, error, onChange }: { phone: string; error?: string; onChange?: (v: string) => void }) => (
  <Field label="Mobile phone" hint="With the country code. WhatsApp alerts go to it." error={error}>
    <input name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={18} defaultValue={phone} onChange={(e) => onChange?.(e.target.value)} aria-invalid={Boolean(error)} className={adminInput} />
  </Field>
);

// Quiet hours hold WhatsApp alerts back, so they show with its column only.
function QuietHours({ from, to, errors }: { from: string; to: string; errors: Record<string, string> }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-meta font-semibold">Quiet hours</legend>
      <p className="text-meta text-text-2">No WhatsApp alerts between these times. Leave both empty for none.</p>
      <div className="grid max-w-sm grid-cols-2 gap-3">
        <Field label="From" error={errors.quietFrom}>
          <input name="quietFrom" type="time" defaultValue={from} aria-invalid={Boolean(errors.quietFrom)} className={adminInput} />
        </Field>
        <Field label="Until" error={errors.quietTo}>
          <input name="quietTo" type="time" defaultValue={to} aria-invalid={Boolean(errors.quietTo)} className={adminInput} />
        </Field>
      </div>
    </fieldset>
  );
}

export type Grid = { rows: GridRow[]; columns: Channel[]; value: Prefs; role: Role | null };

// Your account, Notifications: your own grid and quiet hours.
export const NotificationsEdit = ({ grid, quietFrom, quietTo }: { grid: Grid; quietFrom: string; quietTo: string }) => (
  <EditDialog title="Notifications" what="your notifications" saved={SAVED}>
    {(done) => <NotificationsForm grid={grid} quietFrom={quietFrom} quietTo={quietTo} done={done} />}
  </EditDialog>
);

function NotificationsForm({ grid, quietFrom, quietTo, done }: { grid: Grid; quietFrom: string; quietTo: string; done: () => void }) {
  const f = useSave(saveMyNotificationsAction);
  useDoneOnSave(f.state, f.pending, done);
  return (
    <form {...f.run} className="flex flex-col gap-5" noValidate>
      <NotifyGrid {...grid} />
      {grid.columns.includes("whatsapp") && <QuietHours from={quietFrom} to={quietTo} errors={f.errors} />}
      <DialogSave pending={f.pending} />
    </form>
  );
}

// One person, from Team: their name, sign-in email, phone, role and notifications, saved together. The WhatsApp column follows the phone
// and role as they are typed and picked (never for Finance), so the grid shows what will be saved.
export type PersonView = { id: string; name: string; email: string; role: Role; phone: string; quietFrom: string; quietTo: string; prefs: Prefs };
export const PersonEdit = (props: { person: PersonView; rows: GridRow[]; whatsapp: boolean; owner: boolean; self: boolean }) => (
  <EditDialog title={props.person.name} what={`${props.person.name}'s details`} saved={SAVED}>
    {(done) => <PersonForm {...props} done={done} />}
  </EditDialog>
);

function PersonForm({ person, rows, whatsapp, owner, self, done }: { person: PersonView; rows: GridRow[]; whatsapp: boolean; owner: boolean; self: boolean; done: () => void }) {
  const f = useSave(savePersonAction.bind(null, person.id));
  useDoneOnSave(f.state, f.pending, done);
  const [phone, setPhone] = useState(person.phone);
  const [role, setRole] = useState<Role>(person.role);
  const columns = columnsFor(role, { on: whatsapp, phone });
  return (
    <form {...f.run} className="flex flex-col gap-5" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" error={f.errors.name}>
          <input name="name" maxLength={LIMITS.name} defaultValue={person.name} className={adminInput} autoComplete="off" />
        </Field>
        <Field label="Email" hint={self ? "Another owner or manager changes your sign-in email" : "The address they sign in with"} error={f.errors.email}>
          <input name="email" type="email" maxLength={120} defaultValue={person.email} readOnly={self} className={adminInput} autoComplete="off" />
        </Field>
        <PhoneField phone={person.phone} error={f.errors.phone} onChange={setPhone} />
        <Field label="Role" error={f.errors.role}>
          <Select name="role" value={role} onChange={(r) => setRole(r as Role)} options={owner ? ROLE_OPTIONS : ROLE_OPTIONS.filter(([r]) => r !== "Owner")} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-meta font-semibold">Notifications</legend>
        <NotifyGrid rows={rows} columns={columns} value={person.prefs} role={role} />
      </fieldset>
      {columns.includes("whatsapp") && <QuietHours from={person.quietFrom} to={person.quietTo} errors={f.errors} />}
      <DialogSave pending={f.pending} />
    </form>
  );
}
