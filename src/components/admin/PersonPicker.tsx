"use client";

import { Select } from "@/components/Select";
import { ActSelect } from "./ActSelect";

// Who has a lead, a test drive or a job (#135): one drop-down of the team with Not taken first, the signed-in person shown as You, as the
// lists do. A list to pick from on a phone and a searchable one on a desktop (the house Combobox), never a block of chips.
// With `action` it saves the moment a person is picked, with Undo in the toast; without it it is a plain form field sending `name`.
export function PersonPicker({ team, value, me, name = "assignedTo", action, id, label, none = "Not taken" }: { team: readonly string[]; value?: string; me?: string; name?: string; action?: (data: FormData) => Promise<unknown>; id?: string; label?: string; none?: string }) {
  const options: [string, string][] = [["", none], ...team.map((t): [string, string] => [t, t === me ? "You" : t])];
  if (!action) return <Select id={id} name={name} label={label} defaultValue={value ?? ""} options={options} />;
  return <ActSelect id={id} label={label} value={value ?? ""} options={options} action={action} field={name} back={{ [name]: value ?? "" }} done={(_, v) => (!v ? none : v === me ? "You have it" : `Given to ${v}`)} />;
}
