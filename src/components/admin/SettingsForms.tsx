"use client";

import { useKeptForm } from "@/components/admin/useKeptForm";
import { Select } from "@/components/Select";
import { startTransition, useActionState, useEffect, useState } from "react";
import { Field, FormActions, adminButton, adminButtonQuiet, adminInput } from "@/components/admin/kit";
import { DialogCancel } from "@/components/admin/Dialog";
import { EditDialog, useDoneOnSave } from "@/components/admin/EditDialog";
import { addTeamAction, setRoleAction, saveBusinessAction, saveLeadEmailsAction, saveMarketingAction, sendTestEmailAction, saveNotificationsAction, saveTargetsAction, type SettingsState } from "@/app/settings/actions";
import type { DealerSettings, TeamMember } from "@/lib/admin/collections";
import { ROLES } from "@/lib/permission-rules";
import type { DealerProfile } from "@/lib/tenancy/profile";
import { CheckIcon } from "@/components/stock/icons";
import { BUSY, ConfirmDialog } from "@/components/admin/ActButton";

const ROLE_OPTIONS = ROLES.map((r) => [r, r] as const);

// Each settings panel is its own small form that saves on its own and says so; where a section has two, each Save says what it saves. The server checks every value again.
type Action = (prev: SettingsState, data: FormData) => Promise<SettingsState>;

function useSave(action: Action) {
  const [state, run, pending] = useKeptForm<SettingsState>(action, undefined);
  // A refused save brings its first error into view: the Save button can sit far below the field (the email above the opening hours).
  useEffect(() => {
    if (state?.errors) run.ref.current?.querySelector('[role="alert"]')?.scrollIntoView({ block: "center" });
  }, [state, run.ref]);
  return { state, run, pending, errors: state?.errors ?? {} };
}

// The form's button. `add` for a form that adds something (a person), so the button says what it does. `label` names what it saves where a
// section has two forms, so nobody saves one and loses the other's edits.
function Save({ pending, saved, add = false, label = "Save" }: { pending: boolean; saved?: boolean; add?: boolean; label?: string }) {
  return (
    <div className="flex items-center gap-4">
      <button type="submit" disabled={pending} className={adminButton}>
        {pending ? (add ? "Adding" : "Saving") : add ? "Add" : label}
      </button>
      {/* Says it is done and that it works at once, so nobody saves twice to be sure. */}
      {saved && !pending && (
        <p role="status" className="inline-flex items-center gap-1.5 text-meta font-medium text-ok">
          <CheckIcon aria-hidden="true" className="size-4" />
          {add ? "Added to the team" : "Saved. It works from now on"}
        </p>
      )}
    </div>
  );
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

// The dealer's own facts. Hours: a time each for opening and closing, empty for a closed day.
function BusinessForm({ name, profile, done }: Business & { done: () => void }) {
  const f = useSave(saveBusinessAction);
  useDoneOnSave(f.state, f.pending, done);
  return (
    <form {...f.run} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" error={f.errors.name}>
          <input name="name" defaultValue={name} className={adminInput} />
        </Field>
        <Field label="Website" hint="The full address, like https://www.yourname.ie" error={f.errors.siteUrl}>
          <input name="siteUrl" type="url" defaultValue={profile.siteUrl} className={adminInput} />
        </Field>
        <Field label="Phone" error={f.errors.phone}>
          <input name="phone" type="tel" defaultValue={profile.phone} className={adminInput} />
        </Field>
        <Field label="Email" error={f.errors.email}>
          <input name="email" type="email" defaultValue={profile.email} className={adminInput} />
        </Field>
        <Field label="Street" error={f.errors.street}>
          <input name="street" defaultValue={profile.address.street} className={adminInput} />
        </Field>
        <Field label="Town" error={f.errors.town}>
          <input name="town" defaultValue={profile.address.town} className={adminInput} />
        </Field>
        <Field label="County" error={f.errors.county}>
          <input name="county" defaultValue={profile.address.county} className={adminInput} />
        </Field>
        <Field label="Eircode" error={f.errors.eircode}>
          <input name="eircode" defaultValue={profile.address.eircode} className={adminInput} />
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

export function LeadEmailsForm({ settings, fallback }: { settings: DealerSettings; fallback: boolean }) {
  const f = useSave(saveLeadEmailsAction);
  const t = useSave(sendTestEmailAction as Action);
  return (
    <div className="flex flex-col gap-4">
      <form {...f.run} className="flex flex-col gap-3" noValidate>
        <Field label="Send new leads to" hint="One address per line." error={f.errors.leadEmails}>
          <textarea name="leadEmails" rows={3} defaultValue={settings.leadEmails.join(String.fromCharCode(10))} className={`${adminInput} h-auto py-2`} />
        </Field>
        {settings.leadEmails.length === 0 && <p className="text-meta text-text-2">{fallback ? "Using the site's own address." : "No address is set, so new leads cannot be sent yet."}</p>}
        <Save pending={f.pending} saved={f.state?.saved} label="Save addresses" />
      </form>
      <form {...t.run} className="flex items-center gap-4">
        <button type="submit" disabled={t.pending} className={adminButtonQuiet}>
          {t.pending ? "Sending" : "Send a test email"}
        </button>
        {t.state?.saved && !t.pending && <p role="status" className="text-meta text-ok">Sent</p>}
        {t.errors.test && !t.pending && <p role="alert" className="text-meta text-destructive">{t.errors.test}</p>}
      </form>
    </div>
  );
}

// Only what is sent: the morning follow-up email. A new lead's email is set under Lead emails; the dashboard's own bell needs no setting.
const NOTES: [keyof DealerSettings["notifications"], string][] = [["followUps", "Each morning, email each salesperson the follow-ups due that day"]];

export function NotificationsForm({ settings, emailConnected }: { settings: DealerSettings; emailConnected: boolean }) {
  const f = useSave(saveNotificationsAction);
  return (
    <form {...f.run} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-meta font-semibold">Emails</legend>
        {NOTES.map(([k, label]) => (
          <label key={k} className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name={k} defaultChecked={settings.notifications[k]} className="size-5 shrink-0 accent-accent" />
            {label}
          </label>
        ))}
      </fieldset>
      {!emailConnected && <p className="text-meta text-text-2">Email is not set up yet. Ask us in Help and we will connect it.</p>}
      {f.errors.notifications && !f.pending && <p role="alert" className="text-meta text-destructive">{f.errors.notifications}</p>}
      <Save pending={f.pending} saved={f.state?.saved} label="Save reminder" />
    </form>
  );
}

function MarketingForm({ settings, done }: { settings: DealerSettings; done: () => void }) {
  const f = useSave(saveMarketingAction);
  useDoneOnSave(f.state, f.pending, done);
  return (
    <form {...f.run} className="grid grid-cols-1 gap-4" noValidate>
      <Field label="How we sound" hint="Used when posts and newsletters are written" error={f.errors.voice}>
        <input name="voice" defaultValue={settings.marketing.voice} className={adminInput} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Hashtags" error={f.errors.hashtags}>
          <input name="hashtags" defaultValue={settings.marketing.hashtags} className={adminInput} />
        </Field>
        <Field label="Sign-off line" error={f.errors.signOff}>
          <input name="signOff" defaultValue={settings.marketing.signOff} className={adminInput} />
        </Field>
      </div>
      <DialogSave pending={f.pending} />
    </form>
  );
}

// `owner`: the signed-in person is an owner, so Owner is a role they may give.
export function AddTeamForm({ owner }: { owner: boolean }) {
  const f = useSave(addTeamAction);
  // The answer the person has since edited past: its errors go (an email "already on the team" may not be any more), until the next Add.
  const [seen, setSeen] = useState<SettingsState>();
  const errors = f.state === seen ? {} : f.errors;
  return (
    <form {...f.run} onChange={() => setSeen(f.state)} className="grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-start" noValidate>
      <Field label="Name" error={errors.name}>
        <input name="name" className={adminInput} autoComplete="off" />
      </Field>
      <Field label="Email" error={errors.email}>
        <input name="email" type="email" className={adminInput} autoComplete="off" />
      </Field>
      <Field label="Role" error={errors.role}>
        <Select name="role" defaultValue="Sales" options={owner ? ROLE_OPTIONS : ROLE_OPTIONS.filter(([r]) => r !== "Owner")} />
      </Field>
      <div className="sm:pt-6">
        <Save pending={f.pending} saved={f.state?.saved} add />
      </div>
    </form>
  );
}

// One person's role, saved as soon as it is picked, by an owner or manager (the server checks again). A refused change shows why and puts
// the picker back to the role they still have. A change to or from Owner asks first: an owner can change everything.
export function RoleForm({ member, owner }: { member: TeamMember; owner: boolean }) {
  // No form here (it saves as soon as a role is picked), so the plain hook.
  const [state, run, pending] = useActionState<SettingsState, FormData>(setRoleAction.bind(null, member.id), undefined);
  const f = { state, run, pending, errors: state?.errors ?? {} };
  const [picked, setPicked] = useState<string>(member.role);
  const shown = f.state?.errors && !f.pending ? member.role : picked;
  const [asking, setAsking] = useState<string | null>(null);
  const save = (role: string) => {
    setPicked(role);
    const data = new FormData();
    data.set("role", role);
    startTransition(() => f.run(data));
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="w-36">
        <Select
          label={`Role for ${member.name}`}
          value={shown}
          onChange={(role) => (role !== member.role && (role === "Owner" || member.role === "Owner") ? setAsking(role) : save(role))}
          options={owner ? ROLE_OPTIONS : ROLE_OPTIONS.filter(([r]) => r !== "Owner")}
        />
      </div>
      {asking && (
        <ConfirmDialog
          confirm={asking === "Owner" ? { title: `Make ${member.name} an Owner?`, text: "Owners can change everything, including the team and other owners.", yes: "Make Owner" } : { title: `Change ${member.name} from Owner to ${asking}?`, text: `They will see only what ${asking} can see.`, yes: "Change role" }}
          onYes={() => save(asking)}
          onClose={() => setAsking(null)}
        />
      )}
      {f.errors.role && !f.pending && (
        <p role="alert" className="max-w-48 text-right text-meta text-destructive">
          {f.errors.role}
        </p>
      )}
      {f.state?.saved && !f.pending && (
        <p role="status" className="text-meta text-ok">
          Saved
        </p>
      )}
    </div>
  );
}
